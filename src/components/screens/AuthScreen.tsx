import { useState, memo, useCallback, useRef, useEffect, type InputHTMLAttributes } from "react";
import { useApp } from "@/lib/store";
import { sanitizeUsernameInput, validateUsernameFormat } from "@/lib/usernameRules";
import {
  normalizeEmail,
  validateEmailFormat,
  validateNewPasswordPlain,
} from "@/lib/passwordAuth";
import { validateOptionalPhone } from "@/lib/phoneUtils";
import logo from "@/assets/logo.png";
import { apiBackendEnabled, apiRequestSignupVerification } from "@/lib/apiBackend";
import { clearStaleApiConfig, ensureApiRuntimeConfig, peekApiBaseUrl } from "@/lib/apiConfig";

type Mode = "login" | "signup" | "forgot" | "reset";
type FormState = {
  email: string;
  username: string;
  phone: string;
  password: string;
  confirm: string;
  code: string;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAIL = 8;
const LOGIN_LOCK_MS = 60 * 1000;

const Field = memo(function Field({
  name,
  placeholder,
  type = "text",
  value,
  onChange,
  autoComplete,
  inputMode,
}: {
  name: keyof FormState;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (name: keyof FormState, v: string) => void;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      dir="ltr"
      inputMode={inputMode}
      className="min-h-[48px] w-full touch-manipulation rounded-2xl border border-border bg-input px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      placeholder={placeholder}
      type={type}
      value={value}
      autoComplete={autoComplete}
      spellCheck={false}
      onChange={e => onChange(name, e.target.value)}
    />
  );
});

export function AuthScreen(props?: { onAuthSuccess?: () => void; /** false داخل نافذة «إضافة حساب» حتى لا يستبدل الزائر الحساب الحالي */ allowGuestBrowse?: boolean }) {
  const { onAuthSuccess, allowGuestBrowse = true } = props || {};
  const {
    signup,
    login,
    verifyLogin,
    resetPasswordForUser,
    requestPasswordResetRemote,
    completePasswordResetRemote,
    completePasswordResetLink,
    state,
    enterGuestBrowseMode,
  } = useApp();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<FormState>({
    email: "",
    username: "",
    phone: "",
    password: "",
    confirm: "",
    code: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupAwaitingOtp, setSignupAwaitingOtp] = useState(false);
  const [loginAwaitingOtp, setLoginAwaitingOtp] = useState(false);
  const loginIdentifierRef = useRef("");

  const passwordResetUserIdRef = useRef<string | null>(null);
  const passwordResetOtpRef = useRef<string | null>(null);
  const passwordResetExpiresRef = useRef(0);
  /** عند التفعيل: الاستعادة عبر الخادم (OTP على السيرفر) */
  const passwordResetUsesRemoteRef = useRef(false);
  const passwordResetIdentifierRef = useRef("");
  const passwordResetLinkTokenRef = useRef<string | null>(null);

  const loginFailCountRef = useRef(0);
  const loginLockUntilRef = useRef(0);
  const [apiReady, setApiReady] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw.startsWith("auth-reset")) return;
    const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    const token = new URLSearchParams(q).get("token")?.trim();
    if (!token) return;
    passwordResetLinkTokenRef.current = token;
    passwordResetUsesRemoteRef.current = false;
    setMode("reset");
    setForm(f => ({ ...f, code: "", password: "", confirm: "" }));
    setInfo("اختر كلمة مرور جديدة لحسابك.");
    const base = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", base);
  }, []);

  useEffect(() => {
    clearStaleApiConfig();
    void (async () => {
      await ensureApiRuntimeConfig();
      const base = peekApiBaseUrl();
      const healthPath = base ? `${base.replace(/\/$/, "")}/health` : "/health";
      try {
        const res = await fetch(healthPath, { cache: "no-store" });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          dbOk?: boolean;
        } | null;
        setApiReady(res.ok && j?.ok === true && j?.dbOk !== false);
      } catch {
        setApiReady(false);
      }
    })();
  }, []);

  const clearOtpRefs = () => {
    passwordResetUserIdRef.current = null;
    passwordResetOtpRef.current = null;
    passwordResetExpiresRef.current = 0;
    passwordResetUsesRemoteRef.current = false;
    passwordResetIdentifierRef.current = "";
  };

  useEffect(() => () => clearOtpRefs(), []);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const setField = useCallback((k: keyof FormState, v: string) => {
    const next = k === "username" && mode === "signup" ? sanitizeUsernameInput(v) : v;
    setForm(f => ({ ...f, [k]: next }));
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    resetMessages();
    setBusy(true);
    try {
      await runSubmit();
    } finally {
      setBusy(false);
    }
  };

  const runSubmit = async () => {
    if (mode === "login") {
      if (Date.now() < loginLockUntilRef.current) {
        const s = Math.ceil((loginLockUntilRef.current - Date.now()) / 1000);
        setError(`محاولات كثيرة. انتظر ${s} ثانية ثم أعد المحاولة.`);
        return;
      }
      if (!loginAwaitingOtp) {
        const r = await login({ username: form.username, password: form.password });
        if (!r.ok) {
          loginFailCountRef.current += 1;
          if (loginFailCountRef.current >= LOGIN_MAX_FAIL) {
            loginLockUntilRef.current = Date.now() + LOGIN_LOCK_MS;
            loginFailCountRef.current = 0;
            setError("تم تقييد المحاولة مؤقتاً بسبب محاولات متعددة.");
          } else {
            setError(r.error || "بيانات خاطئة");
          }
          return;
        }
        if (r.requiresOtp) {
          loginIdentifierRef.current = form.username.trim();
          setLoginAwaitingOtp(true);
          setInfo(
            `أُرسل كود التحقق إلى ${r.emailHint || "بريدك الإلكتروني"}. أدخل الـ 6 أرقام للمتابعة.`,
          );
          return;
        }
        loginFailCountRef.current = 0;
        loginLockUntilRef.current = 0;
        onAuthSuccess?.();
        return;
      }
      if (!form.code.trim()) {
        setError("أدخل كود التحقق من بريدك");
        return;
      }
      const vr = await verifyLogin({
        username: loginIdentifierRef.current || form.username,
        code: form.code.trim(),
      });
      if (!vr.ok) {
        setError(vr.error || "كود غير صحيح");
        return;
      }
      loginFailCountRef.current = 0;
      loginLockUntilRef.current = 0;
      setLoginAwaitingOtp(false);
      loginIdentifierRef.current = "";
      onAuthSuccess?.();
      return;
    }

    if (mode === "signup") {
      if (form.password !== form.confirm) {
        setError("كلمة المرور غير متطابقة");
        return;
      }
      const pwdErr = validateNewPasswordPlain(form.password);
      if (pwdErr) {
        setError(pwdErr);
        return;
      }
      const phoneFieldErr = validateOptionalPhone(form.phone);
      if (phoneFieldErr) {
        setError(phoneFieldErr);
        return;
      }

      if (!apiBackendEnabled()) {
        setError("إنشاء الحساب يتطلب اتصالاً بالخادم مع تفعيل البريد (SMTP). شغّل الخادم ثم أعد المحاولة.");
        return;
      }
      const emailErr = validateEmailFormat(form.email);
      if (emailErr) {
        setError(emailErr);
        return;
      }
      const nameErr = validateUsernameFormat(form.username.trim());
      if (nameErr) {
        setError(nameErr);
        return;
      }
      if (!signupAwaitingOtp) {
        const sent = await apiRequestSignupVerification(
          normalizeEmail(form.email),
          form.username.trim(),
        );
        if (!sent.ok) {
          setError(sent.error || "تعذر إرسال كود التحقق");
          return;
        }
        setSignupAwaitingOtp(true);
        setInfo(
          `أُرسل كود التحقق (6 أرقام) إلى ${normalizeEmail(form.email)}. راجع البريد الوارد ومجلد الرسائل غير المرغوب فيها، ثم أدخل الرمز واضغط «تأكيد وإنشاء».`,
        );
        return;
      }
      if (!form.code.trim()) {
        setError("أدخل كود التحقق المرسل إلى بريدك الإلكتروني");
        return;
      }
      const r = await signup({
        email: normalizeEmail(form.email),
        username: form.username,
        password: form.password,
        code: form.code.trim(),
        phone: form.phone.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error || "خطأ");
        return;
      }
      setSignupAwaitingOtp(false);
      if (r.userId) {
        try {
          localStorage.setItem("retweet_pending_welcome_user", r.userId);
        } catch {
          /* ignore */
        }
        onAuthSuccess?.();
      }
      return;
    }

    if (mode === "forgot") {
      const q = form.username.trim();
      if (!q) {
        setError("أدخل اسم المستخدم أو البريد");
        return;
      }
      if (!apiBackendEnabled()) {
        setError("استعادة كلمة المرور تتطلب اتصالاً بالخادم مع تفعيل البريد (SMTP).");
        return;
      }
      const rr = await requestPasswordResetRemote(q);
      if (!rr.ok) {
        setError(rr.error || "تعذر الطلب");
        return;
      }
      passwordResetUsesRemoteRef.current = true;
      passwordResetIdentifierRef.current = q;
      passwordResetUserIdRef.current = null;
      passwordResetOtpRef.current = null;
      passwordResetExpiresRef.current = 0;
      passwordResetLinkTokenRef.current = null;
      setMode("reset");
      setForm(f => ({ ...f, code: "", password: "", confirm: "" }));
      setInfo(
        rr.message ||
          "إن وُجد حساب بهذا البريد أو اسم المستخدم أُرسل رمز التحقق (6 أرقام) إلى بريدك. أدخله أدناه مع كلمة المرور الجديدة.",
      );
      return;
    }

    if (mode === "reset") {
      if (form.password !== form.confirm) {
        setError("كلمة المرور غير متطابقة");
        return;
      }
      const pwdErr = validateNewPasswordPlain(form.password);
      if (pwdErr) {
        setError(pwdErr);
        return;
      }
      const linkToken = passwordResetLinkTokenRef.current;
      if (linkToken && apiBackendEnabled()) {
        const lr = await completePasswordResetLink(linkToken, form.password);
        if (!lr.ok) {
          setError(lr.error || "تعذر الحفظ");
          return;
        }
        passwordResetLinkTokenRef.current = null;
        clearOtpRefs();
        setInfo("تم تغيير كلمة المرور. سجّل الدخول الآن.");
        setMode("login");
        setForm({ email: "", username: "", password: "", confirm: "", code: "" });
        return;
      }
      if (passwordResetUsesRemoteRef.current) {
        const idf = passwordResetIdentifierRef.current.trim();
        if (!idf) {
          setError("انتهت الجلسة. ابدأ من «نسيت كلمة المرور» من جديد.");
          return;
        }
        const r = await completePasswordResetRemote(idf, form.code, form.password);
        if (!r.ok) {
          setError(r.error || "تعذر الحفظ");
          return;
        }
        clearOtpRefs();
        setInfo("تم تغيير كلمة المرور. سجّل الدخول الآن.");
        setMode("login");
        setForm({ email: "", username: "", password: "", confirm: "", code: "" });
        return;
      }
      if (!passwordResetOtpRef.current || Date.now() > passwordResetExpiresRef.current) {
        setError("انتهت صلاحية الجلسة. ابدأ من «نسيت كلمة المرور» من جديد.");
        return;
      }
      if (form.code.trim() !== passwordResetOtpRef.current) {
        setError("الكود غير صحيح");
        return;
      }
      const uid = passwordResetUserIdRef.current;
      if (!uid) {
        setError("تعذر التحقق من البيانات. تحقق من الكود أو أعد المحاولة.");
        return;
      }
      const r = await resetPasswordForUser(uid, form.password);
      if (!r.ok) {
        setError(r.error || "تعذر الحفظ");
        return;
      }
      clearOtpRefs();
      setInfo("تم تغيير كلمة المرور. سجّل الدخول الآن.");
      setMode("login");
      setForm({ email: "", username: "", password: "", confirm: "", code: "" });
    }
  };

  const goLogin = () => {
    resetMessages();
    clearOtpRefs();
    setSignupAwaitingOtp(false);
    setLoginAwaitingOtp(false);
    loginIdentifierRef.current = "";
    passwordResetLinkTokenRef.current = null;
    setMode("login");
  };

  return (
    <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))]">
      <div className="w-full max-w-sm">
        <img src={logo} alt="Retweet" className="w-20 h-20 mx-auto mb-3 dark:invert" />
        <h1 className="text-2xl font-bold text-center mb-2 sm:text-3xl">Retweet</h1>
        <p className="text-center text-muted-foreground mb-8">
          {mode === "login" && "تسجيل الدخول"}
          {mode === "signup" && "إنشاء حساب جديد"}
          {mode === "forgot" && "استعادة كلمة المرور"}
          {mode === "reset" && "إعادة تعيين كلمة المرور"}
        </p>

        <form onSubmit={submit} className="relative z-10 space-y-3">
          {mode === "login" && (
            <>
              <Field
                name="username"
                placeholder="اليوزر أو الإيميل"
                value={form.username}
                onChange={setField}
                autoComplete="username"
              />
              {!loginAwaitingOtp && (
                <Field
                  name="password"
                  placeholder="كلمة المرور"
                  type="password"
                  value={form.password}
                  onChange={setField}
                  autoComplete="current-password"
                />
              )}
              {loginAwaitingOtp && (
                <Field
                  name="code"
                  placeholder="كود التحقق من البريد"
                  value={form.code}
                  onChange={setField}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              )}
            </>
          )}
          {mode === "signup" && (
            <>
              <Field
                name="email"
                placeholder="الإيميل"
                type="email"
                value={form.email}
                onChange={setField}
                autoComplete="email"
              />
              <Field
                name="username"
                placeholder="اسم المستخدم (a-z، 3 أحرف+)"
                value={form.username}
                onChange={setField}
                autoComplete="username"
              />
              <p className="text-[11px] text-muted-foreground px-1">أحرف إنجليزية صغيرة وأرقام و _ فقط — بدون عربي أو أحرف كبيرة</p>
              <Field
                name="phone"
                placeholder="رقم الجوال (اختياري)"
                value={form.phone}
                onChange={setField}
                autoComplete="tel"
                inputMode="tel"
              />
              <p className="text-[11px] text-muted-foreground px-1">اختياري — مثال: 05xxxxxxxx أو +9665xxxxxxxx</p>
              <Field
                name="password"
                placeholder="كلمة المرور"
                type="password"
                value={form.password}
                onChange={setField}
                autoComplete="new-password"
              />
              <Field
                name="confirm"
                placeholder="تأكيد كلمة المرور"
                type="password"
                value={form.confirm}
                onChange={setField}
                autoComplete="new-password"
              />
              {signupAwaitingOtp && (
                <Field
                  name="code"
                  placeholder="كود التحقق (6 أرقام)"
                  value={form.code}
                  onChange={setField}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              )}
            </>
          )}
          {mode === "forgot" && (
            <Field
              name="username"
              placeholder="البريد الإلكتروني أو اسم المستخدم"
              value={form.username}
              onChange={setField}
              autoComplete="username"
            />
          )}
          {mode === "reset" && (
            <>
              {!passwordResetLinkTokenRef.current && (
                <Field
                  name="code"
                  placeholder="كود الاستعادة"
                  value={form.code}
                  onChange={setField}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              )}
              <Field
                name="password"
                placeholder="كلمة المرور الجديدة"
                type="password"
                value={form.password}
                onChange={setField}
                autoComplete="new-password"
              />
              <Field
                name="confirm"
                placeholder="تأكيد كلمة المرور"
                type="password"
                value={form.confirm}
                onChange={setField}
                autoComplete="new-password"
              />
            </>
          )}

          {!apiReady && (
            <p className="text-destructive text-sm text-center leading-relaxed">
              الخادم غير متصل. شغّل على جهازك:{" "}
              <span className="font-mono text-xs">npm run backend:dev</span> ثم حدّث الصفحة (F5).
            </p>
          )}
          {error && <p className="text-destructive text-sm text-center">{error}</p>}
          {info && <p className="text-muted-foreground text-sm text-center leading-relaxed">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="min-h-[48px] w-full touch-manipulation rounded-2xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? "جاري المعالجة…"
              : mode === "login"
                ? loginAwaitingOtp
                  ? "تأكيد الدخول"
                  : "دخول"
                : mode === "signup"
                  ? signupAwaitingOtp
                    ? "تأكيد وإنشاء"
                    : apiBackendEnabled()
                      ? "إرسال كود التحقق"
                      : "إرسال كود التحقق"
                  : mode === "forgot"
                    ? "متابعة"
                    : "حفظ"}
          </button>
        </form>

        {allowGuestBrowse && (
          <button
            type="button"
            disabled={busy}
            onClick={() => enterGuestBrowseMode()}
            className="mt-4 w-full min-h-[48px] touch-manipulation rounded-2xl border border-border bg-background py-3 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            تصفّح التطبيق بدون حساب
          </button>
        )}

        <div className="mt-6 text-center text-sm space-y-2">
          {mode === "login" && (
            <>
              <button type="button" onClick={() => { resetMessages(); clearOtpRefs(); setMode("forgot"); }} className="text-muted-foreground block w-full min-h-[44px] touch-manipulation py-2">
                نسيت كلمة المرور؟
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  clearOtpRefs();
                  setSignupAwaitingOtp(false);
                  setMode("signup");
                }}
                className="min-h-[44px] touch-manipulation py-2 font-semibold text-foreground"
              >
                ليس لديك حساب؟ سجّل هنا
              </button>
            </>
          )}
          {mode !== "login" && (
            <button type="button" onClick={goLogin} className="min-h-[44px] touch-manipulation text-muted-foreground">
              عودة لتسجيل الدخول
            </button>
          )}
        </div>

        {typeof window !== "undefined" && window.location.pathname.startsWith("/app") && (
          <p className="mt-8 text-center text-sm">
            <a href="/" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
              العودة لصفحة التحميل
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
