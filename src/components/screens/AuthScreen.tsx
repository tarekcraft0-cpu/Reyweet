import { useState, memo, useCallback, useRef, useEffect, type InputHTMLAttributes } from "react";
import { useApp } from "@/lib/store";
import { validateUsernameFormat } from "@/lib/usernameRules";
import {
  generateOtpDigits,
  normalizeEmail,
  validateEmailFormat,
  validateNewPasswordPlain,
} from "@/lib/passwordAuth";
import logo from "@/assets/logo.png";
import { apiBackendEnabled } from "@/lib/apiBackend";

type Mode = "login" | "signup" | "forgot" | "reset";
type FormState = { email: string; username: string; password: string; confirm: string; code: string };

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
    resetPasswordForUser,
    requestPasswordResetRemote,
    completePasswordResetRemote,
    state,
    enterGuestBrowseMode,
  } = useApp();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<FormState>({ email: "", username: "", password: "", confirm: "", code: "" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupAwaitingOtp, setSignupAwaitingOtp] = useState(false);
  const signupOtpRef = useRef<string | null>(null);
  const signupOtpExpiresRef = useRef(0);

  const passwordResetUserIdRef = useRef<string | null>(null);
  const passwordResetOtpRef = useRef<string | null>(null);
  const passwordResetExpiresRef = useRef(0);
  /** عند التفعيل: الاستعادة عبر الخادم (OTP على السيرفر) */
  const passwordResetUsesRemoteRef = useRef(false);
  const passwordResetIdentifierRef = useRef("");

  const loginFailCountRef = useRef(0);
  const loginLockUntilRef = useRef(0);

  const clearOtpRefs = () => {
    signupOtpRef.current = null;
    signupOtpExpiresRef.current = 0;
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

  const setField = useCallback((k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v })), []);

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
      loginFailCountRef.current = 0;
      loginLockUntilRef.current = 0;
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

      /** مع خادم API حقيقي: إنشاء مباشر بدون OTP وهمي (لا يظهر كود على الهاتف). */
      if (apiBackendEnabled()) {
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
        const r = await signup({
          email: normalizeEmail(form.email),
          username: form.username,
          password: form.password,
        });
        if (!r.ok) {
          setError(r.error || "خطأ");
          return;
        }
        signupOtpRef.current = null;
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

      if (!signupAwaitingOtp) {
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
        const code = generateOtpDigits();
        signupOtpRef.current = code;
        signupOtpExpiresRef.current = Date.now() + OTP_TTL_MS;
        setSignupAwaitingOtp(true);
        let msg =
          "أدخل كود التحقق المكوّن من 6 أرقام. عند ربط خادم حقيقي سيُرسل الكود إلى بريدك فقط ولا يُعرض هنا.";
        if (import.meta.env.DEV) msg += ` — للتجربة المحلية: ${code}`;
        setInfo(msg);
        if (import.meta.env.DEV) console.debug("[Retweet dev] كود التسجيل:", code);
        return;
      }
      if (Date.now() > signupOtpExpiresRef.current) {
        setError("انتهت صلاحية الكود. ارجع خطوة وأعد طلب كود جديد.");
        signupOtpRef.current = null;
        setSignupAwaitingOtp(false);
        return;
      }
      if (form.code.trim() !== signupOtpRef.current) {
        setError("كود التحقق غير صحيح");
        return;
      }
      const r = await signup({
        email: normalizeEmail(form.email),
        username: form.username,
        password: form.password,
      });
      if (!r.ok) {
        setError(r.error || "خطأ");
        return;
      }
      signupOtpRef.current = null;
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
      if (apiBackendEnabled()) {
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
        setMode("reset");
        setForm(f => ({ ...f, code: "", password: "", confirm: "" }));
        let msg =
          "إن وُجد حساب بهذه البيانات يمكنك إدخال رمز التحقق ثم كلمة المرور الجديدة. (في الإنتاج يُرسل الرمز عبر البريد.)";
        if (import.meta.env.DEV && rr.devCode) msg += ` — للتجربة: ${rr.devCode}`;
        setInfo(msg);
        if (import.meta.env.DEV && rr.devCode) console.debug("[Retweet dev] رمز الاستعادة من الخادم:", rr.devCode);
        return;
      }
      const u = state.users.find(
        x => x.username.toLowerCase() === q.toLowerCase() || x.email.toLowerCase() === q.toLowerCase(),
      );
      passwordResetUsesRemoteRef.current = false;
      passwordResetIdentifierRef.current = "";
      passwordResetUserIdRef.current = u?.id ?? null;
      const code = generateOtpDigits();
      passwordResetOtpRef.current = code;
      passwordResetExpiresRef.current = Date.now() + OTP_TTL_MS;
      setMode("reset");
      setForm(f => ({ ...f, code: "", password: "", confirm: "" }));
      let msg = "أدخل كود الاستعادة ثم كلمة المرور الجديدة.";
      if (import.meta.env.DEV && u) msg += ` — للتجربة المحلية: ${code}`;
      setInfo(msg);
      if (import.meta.env.DEV && u) console.debug("[Retweet dev] كود الاستعادة:", code);
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
              <Field
                name="password"
                placeholder="كلمة المرور"
                type="password"
                value={form.password}
                onChange={setField}
                autoComplete="current-password"
              />
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
                placeholder="اسم المستخدم (إنجليزي، 3 أحرف+)"
                value={form.username}
                onChange={setField}
                autoComplete="username"
              />
              <p className="text-[11px] text-muted-foreground px-1">أحرف إنجليزية وأرقام و _ فقط — من 3 إلى 30 حرفاً</p>
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
              {signupAwaitingOtp && !apiBackendEnabled() && (
                <Field
                  name="code"
                  placeholder="كود التحقق"
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
              placeholder="اليوزر أو الإيميل"
              value={form.username}
              onChange={setField}
              autoComplete="username"
            />
          )}
          {mode === "reset" && (
            <>
              <Field
                name="code"
                placeholder="كود الاستعادة"
                value={form.code}
                onChange={setField}
                autoComplete="one-time-code"
              />
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
                ? "دخول"
                : mode === "signup"
                  ? signupAwaitingOtp && !apiBackendEnabled()
                    ? "تأكيد وإنشاء"
                    : apiBackendEnabled()
                      ? "إنشاء الحساب"
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
      </div>
    </div>
  );
}
