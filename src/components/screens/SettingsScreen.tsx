import React, { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useApp, userById } from "@/lib/store";
import type { User } from "@/lib/types";
import { ensureApiTokenMatchesUser, listAccountSessions } from "@/lib/accountSessions";
import { displayNameFromUsername } from "@/lib/rsocialUi";
import { isGuestUserId } from "@/lib/guestUser";
import {
  apiBackendEnabled,
  apiDeleteAccount,
  apiPatchProfile,
  ensureApiRuntimeConfig,
  getApiToken,
  pushRemoteAppState,
} from "@/lib/apiBackend";
import { isNativeCapacitorShell, VERCEL_SITE_URL } from "@/lib/apiUrlPolicy";
import { cn } from "@/lib/utils";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import { apiAdminMe } from "@/lib/verificationApi";
import { VerificationSubscriptionSheet } from "../verification/VerificationSubscriptionSheet";
import { VerificationRequestPanel } from "../verification/VerificationRequestPanel";
import { VerificationPerksSettings } from "../verification/VerificationPerksSettings";
import { VerificationBadgeColorPicker } from "../verification/VerificationBadgeColorPicker";
import { AdminVerificationPanel } from "../verification/AdminVerificationPanel";
import { ModerationDashboard } from "../admin/ModerationDashboard";
import { BlockConfirmSheet } from "../moderation/BlockConfirmSheet";
import { apiAdminModerationMe } from "@/lib/moderationApi";
import {
  apiGetSecurity,
  apiRevokeTrustedDevices,
  apiSetTwoFactor,
  type SecuritySummary,
} from "@/lib/securityApi";
import { AppErrorBoundary } from "../AppErrorBoundary";
import { useT, type TKey } from "@/lib/i18n";

function AppErrorBoundaryLocal({ children, label }: { children: React.ReactNode; label?: string }) {
  return <AppErrorBoundary label={label}>{children}</AppErrorBoundary>;
}
import {
  ArrowRight,
  Archive,
  BadgeCheck,
  Bell,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Heart,
  HelpCircle,
  Info,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  Moon,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  UserCircle,
  Users,
  UsersRound,
} from "lucide-react";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { RSocialAvatar } from "../rsocial/RSocialAvatar";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { writeDeviceTheme } from "@/lib/deviceTheme";
import { StoriesArchiveScreen } from "./StoriesArchiveScreen";

type SubView =
  | null
  | "accountInfo"
  | "changePwd"
  | "verify"
  | "adminVerify"
  | "adminModeration"
  | "saved"
  | "archive"
  | "timeManagement"
  | "closeFriends"
  | "notifications"
  | "security"
  | "deleteAccount";

const PRIVACY_POLICY_URL = `${VERCEL_SITE_URL}/privacy.html`;

function SectionGap() {
  return <div className="h-2 shrink-0 bg-background" aria-hidden />;
}

const accountsCenterCardClass = "overflow-hidden rounded-2xl border border-border bg-card";

/** إعدادات — تمرير كامل داخل الشاشة (مهم على iOS حيث body overflow:hidden) */
function SettingsScrollBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "settings-screen-root min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-[max(2.75rem,var(--sab))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SettingsScreenRoot({
  dir = "rtl",
  header,
  children,
}: {
  dir?: "rtl" | "ltr";
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-background text-foreground"
      dir={dir}
    >
      {header}
      <SettingsScrollBody>{children}</SettingsScrollBody>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      className="mx-4 overflow-hidden rounded-xl border border-border bg-card divide-y divide-border"
    >
      {children}
    </div>
  );
}

function IgToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={
        "relative h-[30px] w-[50px] shrink-0 rounded-full p-0.5 transition-colors " +
        (on ? "bg-[#0095F6]" : "bg-muted-foreground/40")
      }
    >
      <span
        className={
          "block h-[26px] w-[26px] rounded-full bg-background shadow transition-transform " +
          (on ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-0")
        }
      />
    </button>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  onClick,
  right,
  chevron = false,
}: {
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  label: string;
  onClick?: () => void;
  right?: ReactNode;
  chevron?: boolean;
}) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">
        <Icon size={22} strokeWidth={1.5} className="text-foreground" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-normal leading-snug text-foreground">{label}</span>
      {(right || chevron) && (
        <span className="flex shrink-0 items-center gap-2">
          {right}
          {chevron && !right && (
            <ChevronRight
              size={18}
              strokeWidth={2}
              className="shrink-0 text-muted-foreground rtl:rotate-180"
              aria-hidden
            />
          )}
        </span>
      )}
    </>
  );
  const className =
    "flex w-full min-h-[52px] flex-row items-center gap-3 px-4 py-3 text-start transition-colors active:bg-accent";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

function AccountsCenterRow({
  icon: Icon,
  label,
  subtitle,
  onClick,
}: {
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  label: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-[62px] items-center gap-3 px-4 py-3 text-start transition-colors active:bg-accent"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/70">
        <Icon size={20} strokeWidth={1.6} className="text-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground">{label}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRight
        size={18}
        strokeWidth={2}
        className="shrink-0 text-muted-foreground rtl:rotate-180"
        aria-hidden
      />
    </button>
  );
}

function DeleteAccountPanel({
  me,
  onDone,
  onBack,
}: {
  me: User;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (confirm.trim() !== "DELETE") {
      alert(t("deleteAccountConfirmLabel"));
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        await ensureApiRuntimeConfig();
        const token = ensureApiTokenMatchesUser(me.id) ?? getApiToken();
        if (!apiBackendEnabled() || !token) {
          alert(t("deleteAccountFailed"));
          return;
        }
        const body: { confirm: "DELETE"; password?: string } = { confirm: "DELETE" };
        if (password.trim()) body.password = password.trim();
        const r = await apiDeleteAccount(token, body);
        if (!r.ok) {
          alert(r.error || t("deleteAccountFailed"));
          return;
        }
        alert(t("deleteAccountDone"));
        onDone();
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="settings-screen-root min-h-full w-full overflow-x-hidden bg-background pb-10" dir="rtl">
      <SettingsHeader title={t("deleteAccount")} onBack={onBack} navScope="local" />
      <div className="mx-4 mt-4 space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{t("deleteAccountHint")}</p>
        <input
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="DELETE"
          autoCapitalize="characters"
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground"
        />
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder={t("deleteAccountPassword")}
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground"
        />
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "…" : t("deleteAccount")}
        </button>
      </div>
    </div>
  );
}

function PlaceholderPanel({ title, hint, onBack }: { title: string; hint: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className="settings-screen-root min-h-full w-full overflow-x-hidden bg-background pb-8">
      <SettingsHeader title={title} onBack={onBack} navScope="local" />
      <div className="px-6 pt-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary border border-border">
          <Info size={28} className="text-muted-foreground" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
        <p className="mt-3 text-xs text-muted-foreground/80">{t("comingSoonPanel")}</p>
      </div>
    </div>
  );
}

function AccountInfoPanel({
  me,
  updateProfile,
  onSaved,
}: {
  me: User;
  updateProfile: ReturnType<typeof useApp>["updateProfile"];
  onSaved: () => void;
}) {
  const t = useT();
  const [email, setEmail] = useState(me.email || "");
  const [phone, setPhone] = useState(me.phone || "");
  const [busy, setBusy] = useState(false);

  const save = () => {
    void (async () => {
      setBusy(true);
      try {
        await ensureApiRuntimeConfig();
        const token = ensureApiTokenMatchesUser(me.id) ?? getApiToken();
        const emailTrim = email.trim().toLowerCase();
        const phoneTrim = phone.trim();
        if (apiBackendEnabled() && token) {
          const patch: { email?: string; phone?: string } = {};
          if (emailTrim && emailTrim !== (me.email || "").trim().toLowerCase()) patch.email = emailTrim;
          if (phoneTrim !== (me.phone || "").trim()) patch.phone = phoneTrim || "";
          if (Object.keys(patch).length) {
            const r = await apiPatchProfile(token, patch);
            if (!r.ok) {
              alert(r.error || "تعذر الحفظ");
              return;
            }
            updateProfile(
              {
                email: r.user.email ?? emailTrim,
                phone: (r.user as { phone?: string }).phone ?? (phoneTrim || undefined),
              },
              { commitRemote: false },
            );
          } else {
            updateProfile({ phone: phoneTrim || undefined });
          }
        } else {
          updateProfile({ email: emailTrim, phone: phoneTrim || undefined }, { commitRemote: true });
        }
        onSaved();
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="mx-4 mt-4 overflow-hidden rounded-xl border border-border bg-card p-4 text-sm space-y-3">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <RSocialAvatar name={me.username} src={me.avatar} size={56} />
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">@{me.username}</div>
          <div className="text-xs text-muted-foreground truncate">{me.id}</div>
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">البريد الإلكتروني</span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-foreground outline-none"
          dir="ltr"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">رقم الجوال (اختياري)</span>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+966…"
          className="w-full rounded-xl border border-border bg-input px-3 py-2.5 text-foreground outline-none"
          dir="ltr"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="w-full rounded-xl bg-[#0095F6] py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "…" : t("save")}
      </button>
    </div>
  );
}

function SettingsHeader({
  title,
  onBack,
  navScope = "shell",
  showBack = true,
}: {
  title: string;
  onBack: () => void;
  /** shell = إغلاق الإعدادات بانزلاق؛ local = رجوع داخل القائمة فقط */
  navScope?: "shell" | "local";
  showBack?: boolean;
}) {
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-[10001] isolate flex flex-row items-center gap-3 border-b border-border bg-background px-2 py-3 pt-[max(0.5rem,var(--sat))] [padding-inline-start:max(0.5rem,var(--sal))] [padding-inline-end:max(0.5rem,var(--sar))]"
    >
      {showBack ? (
        <SlideDismissBackButton
          navScope={navScope}
          onDismiss={onBack}
          className="relative z-[10001] shrink-0 rounded-full p-2 text-foreground active:bg-accent"
          aria-label="رجوع"
        >
          <ArrowRight size={24} strokeWidth={1.75} className="pointer-events-none" />
        </SlideDismissBackButton>
      ) : (
        <span className="w-10 shrink-0" aria-hidden />
      )}
      <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold text-foreground px-2">{title}</h1>
      <span className="w-10 shrink-0" aria-hidden />
    </div>
  );
}

type SecurityView =
  | "menu"
  | "changePassword"
  | "twoFactor"
  | "verificationSelfie"
  | "savedLogin"
  | "whereLoggedIn"
  | "comingSoon";

function SecurityMenuRow({
  label,
  onClick,
  trailing,
}: {
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-[52px] items-center gap-3 border-b border-border px-4 py-3.5 text-start transition-colors last:border-b-0 active:bg-accent"
    >
      <span className="min-w-0 flex-1 text-[16px] font-normal text-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {trailing}
        <ChevronRight size={18} strokeWidth={2} className="text-muted-foreground" aria-hidden />
      </span>
    </button>
  );
}

function SecurityScreenShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-screen-root min-h-full w-full overflow-x-hidden bg-background text-foreground pb-10" dir="rtl">
      <div className="sticky top-0 z-[10001] isolate bg-background px-4 pt-[max(0.75rem,var(--sat))] pb-3">
        <SlideDismissBackButton
          navScope="local"
          onDismiss={onBack}
          className="relative z-[10001] mb-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-accent"
          aria-label="رجوع"
        >
          <ArrowRight size={24} strokeWidth={2} className="pointer-events-none" />
        </SlideDismissBackButton>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-foreground">{title}</h1>
      </div>
      <div className="px-4 pb-6">{children}</div>
    </div>
  );
}

function SecurityDarkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground " +
        (props.className ?? "")
      }
    />
  );
}

function SecuritySettingsPanel({ onBack }: { onBack: () => void }) {
  const { currentUser, changeOwnPassword } = useApp();
  const t = useT();
  const me = currentUser!;
  const [view, setView] = useState<SecurityView>("menu");
  const [comingSoonTitle, setComingSoonTitle] = useState("");
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const needsSecurityData = view === "twoFactor" || view === "whereLoggedIn";

  useEffect(() => {
    if (!needsSecurityData) return;
    void (async () => {
      setLoading(true);
      try {
        const r = await apiGetSecurity();
        if (r.ok && r.data) setSummary(r.data);
      } catch {
        /* ignore network/runtime errors in settings UI */
      } finally {
        setLoading(false);
      }
    })();
  }, [needsSecurityData]);

  const refresh = async () => {
    try {
      const r = await apiGetSecurity();
      if (r.ok && r.data) setSummary(r.data);
    } catch {
      /* ignore */
    }
  };

  const openComingSoon = (title: string) => {
    setComingSoonTitle(title);
    setView("comingSoon");
  };

  const submitChangePassword = async () => {
    setBusy(true);
    setMsg(null);
    const r = await changeOwnPassword(oldP, newP);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error || t("pwdChangeFailed"));
      return;
    }
    setMsg(t("pwdChanged"));
    setOldP("");
    setNewP("");
  };

  const toggle2fa = async (enabled: boolean) => {
    if (!pwd.trim()) {
      setMsg("أدخل كلمة المرور الحالية للتأكيد");
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await apiSetTwoFactor(enabled, pwd);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error);
      return;
    }
    setSummary(r.data);
    setPwd("");
    setMsg(enabled ? "تم تفعيل التحقق بخطوتين" : "تم إيقاف التحقق بخطوتين");
  };

  const revokeDevices = async () => {
    if (!pwd.trim()) {
      setMsg("أدخل كلمة المرور الحالية");
      return;
    }
    if (!confirm("إزالة كل الأجهزة الموثوقة؟ سيُطلب كود بريد عند الدخول من أي جهاز.")) return;
    setBusy(true);
    setMsg(null);
    const r = await apiRevokeTrustedDevices(pwd);
    setBusy(false);
    if (!r.ok) {
      setMsg(r.error);
      return;
    }
    setPwd("");
    setMsg(r.message || "تمت الإزالة");
    await refresh();
  };

  const savedAccounts = useMemo(() => {
    const seen = new Set<string>();
    const rows = listAccountSessions().filter(s => {
      const key = s.userId + "|" + s.username.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      seen.add(s.userId);
      seen.add(s.username.toLowerCase());
      return true;
    });
    if (!rows.some(s => s.userId === me.id)) {
      rows.unshift({
        userId: me.id,
        token: "",
        username: me.username,
        email: me.email ?? "",
        avatar: me.avatar,
      });
    }
    return rows;
  }, [me.id, me.username, me.email, me.avatar]);

  if (view === "changePassword") {
    return (
      <SecurityScreenShell title="تغيير كلمة المرور" onBack={() => setView("menu")}>
        <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
          أدخل كلمة المرور الحالية ثم اختر كلمة مرور جديدة.
        </p>
        <div className="mt-4 space-y-3">
          <SecurityDarkInput
            value={oldP}
            onChange={e => setOldP(e.target.value)}
            type="password"
            placeholder={t("pwdCurrent")}
            autoComplete="current-password"
          />
          <SecurityDarkInput
            value={newP}
            onChange={e => setNewP(e.target.value)}
            type="password"
            placeholder={t("pwdNew")}
            autoComplete="new-password"
          />
          <button
            type="button"
            disabled={busy || !oldP.trim() || !newP.trim()}
            onClick={() => void submitChangePassword()}
            className="w-full rounded-xl bg-[#0095F6] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("save")}
          </button>
          {msg ? (
            <p className={`text-sm ${msg.includes("تعذر") || msg.includes("غير") || msg.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>
              {msg}
            </p>
          ) : null}
        </div>
      </SecurityScreenShell>
    );
  }

  if (view === "twoFactor") {
    return (
      <SecurityScreenShell title="التحقق بخطوتين" onBack={() => setView("menu")}>
        <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
          أضف طبقة حماية إضافية عبر رمز بريد إلكتروني عند كل تسجيل دخول.
        </p>
        <div className="mt-4 space-y-4">
          {loading ? <p className="text-sm text-muted-foreground">جاري التحميل…</p> : null}
          {!loading && summary ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-card px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[16px] font-medium text-foreground">التحقق بخطوتين</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">رمز بريد إلكتروني عند كل تسجيل دخول</p>
                </div>
                <IgToggle
                  on={!!summary.twoFactorEnabled}
                  onToggle={() => void toggle2fa(!summary.twoFactorEnabled)}
                />
              </div>
            </div>
          ) : null}
          <SecurityDarkInput
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            type="password"
            placeholder={t("pwdCurrent")}
            autoComplete="current-password"
          />
          {msg ? (
            <p className={`text-sm ${msg.includes("تعذر") || msg.includes("غير") ? "text-red-400" : "text-emerald-400"}`}>
              {msg}
            </p>
          ) : null}
        </div>
      </SecurityScreenShell>
    );
  }

  if (view === "verificationSelfie") {
    return (
      <SecurityScreenShell title="Verification selfie" onBack={() => setView("menu")}>
        <div className="mt-8 flex flex-col items-center gap-4 px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <UserCircle size={36} className="text-muted-foreground" />
          </div>
          <p className="text-[18px] font-semibold text-foreground">لا تزال تحت الصنع</p>
          <p className="text-[14px] leading-6 text-muted-foreground">
            ميزة التحقق بالصورة الشخصية قيد التطوير حالياً وستتوفر قريباً.
          </p>
        </div>
      </SecurityScreenShell>
    );
  }

  if (view === "savedLogin") {
    return (
      <SecurityScreenShell title="تسجيلات الدخول المحفوظة" onBack={() => setView("menu")}>
        <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
          الحسابات المحفوظة على هذا الجهاز والقابلة لتسجيل الدخول.
        </p>
        <div className={accountsCenterCardClass}>
          {savedAccounts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا توجد حسابات محفوظة على هذا الجهاز.</p>
          ) : (
            savedAccounts.map((s, i) => (
              <div
                key={s.userId}
                className={
                  "flex items-center gap-3 px-4 py-3.5 " +
                  (i < savedAccounts.length - 1 ? "border-b border-border" : "")
                }
              >
                <RSocialAvatar name={s.username} src={s.avatar} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium text-foreground">
                    {displayNameFromUsername(s.username)}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">@{s.username}</p>
                  {s.email ? <p className="truncate text-[12px] text-muted-foreground/80">{s.email}</p> : null}
                </div>
                {s.userId === me.id ? (
                  <span className="shrink-0 rounded-full bg-[#0095F6]/20 px-2.5 py-1 text-[11px] font-semibold text-[#0095F6]">
                    نشط
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    محفوظ
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </SecurityScreenShell>
    );
  }

  if (view === "whereLoggedIn") {
    return (
      <SecurityScreenShell title="أماكن تسجيل دخولك" onBack={() => setView("menu")}>
        <p className="mt-2 text-[14px] leading-5 text-muted-foreground">
          الأجهزة والمتصفحات الموثوقة حاليًا لحسابك.
        </p>
        <div className="mt-4 space-y-4">
          {loading ? <p className="text-sm text-muted-foreground">جاري التحميل…</p> : null}
          {!loading && summary ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-border bg-card px-4 py-4">
                <p className="text-[16px] font-medium text-foreground flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  الأجهزة الموثوقة ({summary.trustedDeviceCount ?? 0})
                </p>
                {(summary.trustedDevices ?? []).length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {(summary.trustedDevices ?? []).map((d, i) => (
                      <li key={i} className="text-[13px] text-muted-foreground">
                        {d.label} · آخر ظهور {new Date(d.lastSeenAt).toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] text-muted-foreground">لا توجد أجهزة موثوقة بعد.</p>
                )}
              </div>
              <SecurityDarkInput
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                type="password"
                placeholder={t("pwdCurrent")}
                autoComplete="current-password"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void revokeDevices()}
                className="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-semibold text-red-400 disabled:opacity-50"
              >
                إزالة كل الأجهزة الموثوقة
              </button>
            </>
          ) : null}
          {msg ? (
            <p className={`text-sm ${msg.includes("تعذر") || msg.includes("غير") ? "text-red-400" : "text-emerald-400"}`}>
              {msg}
            </p>
          ) : null}
        </div>
      </SecurityScreenShell>
    );
  }

  if (view === "comingSoon") {
    return (
      <SecurityScreenShell title={comingSoonTitle} onBack={() => setView("menu")}>
        <div className="mt-8 flex flex-col items-center gap-4 px-4 text-center">
          <p className="text-[18px] font-semibold text-foreground">قريبًا</p>
          <p className="text-[14px] leading-6 text-muted-foreground">{t("comingSoonPanel")}</p>
        </div>
      </SecurityScreenShell>
    );
  }

  return (
    <SecurityScreenShell title="كلمة المرور والأمان" onBack={onBack}>
      <p className="mt-4 text-[17px] font-bold leading-snug text-foreground">تسجيل الدخول والاسترداد</p>
      <p className="mt-1.5 text-[14px] leading-5 text-muted-foreground">
        إدارة كلمات المرور وتفضيلات الدخول وطرق الاسترداد.
      </p>
      <div className={`mt-3 ${accountsCenterCardClass}`}>
        <SecurityMenuRow label="تغيير كلمة المرور" onClick={() => { setMsg(null); setView("changePassword"); }} />
        <SecurityMenuRow label="التحقق بخطوتين" onClick={() => { setMsg(null); setPwd(""); setView("twoFactor"); }} />
        <SecurityMenuRow label="سلفي التوثيق" onClick={() => setView("verificationSelfie")} />
        <SecurityMenuRow label="تسجيلات الدخول المحفوظة" onClick={() => setView("savedLogin")} />
      </div>

      <p className="mt-6 text-[17px] font-bold leading-snug text-foreground">فحوصات الأمان</p>
      <p className="mt-1.5 text-[14px] leading-5 text-muted-foreground">
        راجع مشكلات الأمان عبر فحص التطبيقات والأجهزة ورسائل البريد.
      </p>
      <div className={`mt-3 ${accountsCenterCardClass}`}>
        <SecurityMenuRow label="أماكن تسجيل دخولك" onClick={() => { setMsg(null); setPwd(""); setView("whereLoggedIn"); }} />
        <SecurityMenuRow
          label="رسائل البريد الأخيرة"
          onClick={() => openComingSoon("رسائل البريد الأخيرة")}
          trailing={
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-[10px] font-bold text-white">
              IG
            </span>
          }
        />
        <SecurityMenuRow label="فحص الأمان" onClick={() => openComingSoon("فحص الأمان")} />
      </div>
    </SecurityScreenShell>
  );
}

export function SettingsScreen({
  onBack,
  onOpenAccounts,
}: {
  onBack: () => void;
  onAccountInfo?: () => void;
  onOpenAccounts?: () => void;
}) {
  const {
    state,
    setState,
    currentUser,
    logout,
    updateProfile,
    toggleBlockWithSync,
    toggleCloseFriend,
    changeOwnPassword,
    hardResyncFromServer,
  } = useApp();
  const [resyncBusy, setResyncBusy] = useState(false);
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);
  const verifyDismissDragRef = React.useRef<{ pointerId: number | null; startY: number; dragging: boolean }>({
    pointerId: null,
    startY: 0,
    dragging: false,
  });
  const t = useT();
  const me = currentUser!;
  const [subView, setSubView] = useState<SubView>(null);
  const [subViewReturnToAccountsCenter, setSubViewReturnToAccountsCenter] = useState(false);
  const [accountsCenterOpen, setAccountsCenterOpen] = useState(false);
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const subscriptionReturnToAccountsCenterRef = React.useRef(false);

  const openSubViewFromAccountsCenter = useCallback((view: SubView) => {
    setAccountsCenterOpen(false);
    setSubViewReturnToAccountsCenter(true);
    setSubView(view);
  }, []);

  const closeSubView = useCallback(() => {
    const returnToAccountsCenter = subViewReturnToAccountsCenter;
    setSubView(null);
    setSubViewReturnToAccountsCenter(false);
    setSubscriptionSheetOpen(false);
    subscriptionReturnToAccountsCenterRef.current = false;
    if (returnToAccountsCenter) setAccountsCenterOpen(true);
  }, [subViewReturnToAccountsCenter]);

  /** غير المشترك: شيت الباقات فقط — بدون شاشة التوثيق القديمة */
  const openVerificationFlow = useCallback(
    (fromAccountsCenter = false) => {
      const ent = getUserEntitlements(me);
      if (!ent.isSubscribed && !ent.isVerified) {
        subscriptionReturnToAccountsCenterRef.current = fromAccountsCenter;
        if (fromAccountsCenter) {
          setAccountsCenterOpen(false);
          setSubViewReturnToAccountsCenter(false);
        }
        setSubscriptionSheetOpen(true);
        return;
      }
      if (fromAccountsCenter) openSubViewFromAccountsCenter("verify");
      else setSubView("verify");
    },
    [me, openSubViewFromAccountsCenter],
  );

  const openSubscriptionSheetFromVerify = useCallback(() => {
    subscriptionReturnToAccountsCenterRef.current = false;
    setSubscriptionSheetOpen(true);
  }, []);

  const closeSubscriptionSheet = useCallback(() => {
    setSubscriptionSheetOpen(false);
    if (subscriptionReturnToAccountsCenterRef.current) {
      subscriptionReturnToAccountsCenterRef.current = false;
      setAccountsCenterOpen(true);
      return;
    }
    if (subView === "verify" && !getUserEntitlements(me).isSubscribed) {
      closeSubView();
    }
  }, [subView, me, closeSubView]);
  const [accountsCenterDragY, setAccountsCenterDragY] = useState(0);
  const [accountsCenterDragging, setAccountsCenterDragging] = useState(false);
  const accountsCenterDragRef = React.useRef<{
    pointerId: number | null;
    startY: number;
    dragging: boolean;
  }>({ pointerId: null, startY: 0, dragging: false });
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const blockedUsers = state.users.filter(u => (me.blocked ?? []).includes(u.id));
  const [unblockTarget, setUnblockTarget] = useState<{ id: string; username: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const token = getApiToken();
      if (!token || !apiBackendEnabled()) {
        setIsAdmin(false);
        setIsModerator(false);
        return;
      }
      setIsAdmin(await apiAdminMe(token));
      const mod = await apiAdminModerationMe();
      setIsModerator(mod.ok && mod.data.isModerator === true);
    })();
  }, [me.id]);

  const followingUsers = useMemo(
    () =>
      (me.following ?? [])
        .map(id => userById(state, id))
        .filter((u): u is NonNullable<typeof u> => !!u && u.id !== me.id),
    [me.following, state.users, me.id],
  );

  const setTheme = (th: "light" | "dark") => {
    writeDeviceTheme(th);
    setState(s => {
      const next = { ...s, theme: th };
      const token = getApiToken();
      if (apiBackendEnabled() && token && s.currentUserId && !isGuestUserId(s.currentUserId)) {
        void pushRemoteAppState(token, next);
      }
      return next;
    });
  };
  const togglePrivate = () => {
    const next = !me.isPrivate;
    updateProfile({ isPrivate: next });
    void (async () => {
      await ensureApiRuntimeConfig();
      const token = getApiToken();
      if (!apiBackendEnabled() || !token) return;
      await apiPatchProfile(token, { isPrivate: next });
    })();
  };
  const setLang = (l: "ar" | "en") => {
    try {
      if (l === "en") localStorage.setItem("retweet_lang_en", "1");
      else localStorage.removeItem("retweet_lang_en");
    } catch {
      /* ignore */
    }
    setState(s => {
      const next = { ...s, language: l };
      const token = getApiToken();
      if (apiBackendEnabled() && token && s.currentUserId && !isGuestUserId(s.currentUserId)) {
        void pushRemoteAppState(token, next);
      }
      return next;
    });
  };

  const changePwd = async () => {
    const r = await changeOwnPassword(oldP, newP);
    if (!r.ok) {
      alert(r.error || t("pwdChangeFailed"));
      return;
    }
    alert(t("pwdChanged"));
    closeSubView();
    setOldP("");
    setNewP("");
  };

  useEffect(() => {
    if (!accountsCenterOpen) {
      setAccountsCenterDragY(0);
      setAccountsCenterDragging(false);
      accountsCenterDragRef.current = { pointerId: null, startY: 0, dragging: false };
    }
  }, [accountsCenterOpen]);

  const subTitle = (k: SubView): string => {
    if (k === "adminModeration") return "لوحة الإشراف";
    if (k === "security") return "الأمان";
    const map: Record<Exclude<SubView, null | "adminModeration" | "security">, TKey> = {
      accountInfo: "accountInfo",
      changePwd: "changePwd",
      verify: "verifyAccount",
      adminVerify: "verifyAccount",
      saved: "saved",
      archive: "archive",
      timeManagement: "timeManagement",
      closeFriends: "closeFriends",
      notifications: "notificationsSettings",
      deleteAccount: "deleteAccount",
    };
    return k && k in map ? t(map[k as keyof typeof map]) : "";
  };

  if (subView === "deleteAccount") {
    return (
      <DeleteAccountPanel
        me={me}
        onBack={closeSubView}
        onDone={() => {
          logout();
          onBack();
        }}
      />
    );
  }

  if (subView === "saved") {
    return <PlaceholderPanel title={t("saved")} hint={t("savedHint")} onBack={closeSubView} />;
  }
  if (subView === "archive") {
    return <StoriesArchiveScreen onBack={closeSubView} />;
  }
  if (subView === "timeManagement") {
    return <PlaceholderPanel title={t("timeManagement")} hint={t("timeMgmtHint")} onBack={closeSubView} />;
  }
  if (subView === "notifications") {
    return <PlaceholderPanel title={t("notificationsSettings")} hint={t("comingSoonPanel")} onBack={closeSubView} />;
  }

  if (subView === "security") {
    return <SecuritySettingsPanel onBack={closeSubView} />;
  }

  if (subView) {
    return (
      <>
      <SettingsScreenRoot
        header={<SettingsHeader title={subTitle(subView)} onBack={closeSubView} navScope="local" />}
      >
        {subView === "accountInfo" && (
          <AccountInfoPanel me={me} updateProfile={updateProfile} onSaved={closeSubView} />
        )}

        {subView === "changePwd" && (
          <div className="mx-4 mt-4 space-y-3">
            <input
              value={oldP}
              onChange={e => setOldP(e.target.value)}
              type="password"
              placeholder={t("pwdCurrent")}
              className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newP}
              onChange={e => setNewP(e.target.value)}
              type="password"
              placeholder={t("pwdNew")}
              className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={changePwd}
              className="w-full rounded-xl bg-[#0095F6] py-3 text-sm font-semibold text-white"
            >
              {t("save")}
            </button>
          </div>
        )}

        {subView === "verify" ? (
          <AppErrorBoundaryLocal label="verify-panel">
            <div
              onPointerDown={e => {
                verifyDismissDragRef.current = { pointerId: e.pointerId, startY: e.clientY, dragging: true };
              }}
              onPointerMove={e => {
                const d = verifyDismissDragRef.current;
                if (!d.dragging || d.pointerId !== e.pointerId) return;
                const dy = e.clientY - d.startY;
                if (dy > 120) {
                  d.dragging = false;
                  closeSubView();
                }
              }}
              onPointerUp={e => {
                const d = verifyDismissDragRef.current;
                if (d.pointerId === e.pointerId) d.dragging = false;
              }}
              onPointerCancel={e => {
                const d = verifyDismissDragRef.current;
                if (d.pointerId === e.pointerId) d.dragging = false;
              }}
            >
              <VerificationRequestPanel onNeedSubscription={openSubscriptionSheetFromVerify} />
              <VerificationPerksSettings onNeedSubscription={openSubscriptionSheetFromVerify} />
              <VerificationBadgeColorPicker />
            </div>
          </AppErrorBoundaryLocal>
        ) : null}

        {subView === "adminVerify" ? (
          <AppErrorBoundaryLocal label="admin-verify">
            <AdminVerificationPanel />
          </AppErrorBoundaryLocal>
        ) : null}

        {subView === "adminModeration" ? (
          <AppErrorBoundaryLocal label="admin-moderation">
            <ModerationDashboard />
          </AppErrorBoundaryLocal>
        ) : null}

        {subView === "closeFriends" && (
          <div className="mt-2">
            <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">{t("closeFriendsHint")}</p>
            {followingUsers.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">{t("closeFriendsEmpty")}</p>
            ) : (
              <SettingsCard>
                {followingUsers.map(u => {
                  const isClose = (me.closeFriends ?? []).includes(u.id);
                  return (
                    <div key={u.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                      <RSocialAvatar name={u.username} src={u.avatar} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] text-foreground">@{u.username}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCloseFriend(u.id)}
                        className={
                          "rounded-lg px-3 py-1.5 text-xs font-semibold " +
                          (isClose ? "bg-secondary text-foreground" : "bg-[#0095F6] text-white")
                        }
                      >
                        {isClose ? "✓" : t("addToCloseFriends")}
                      </button>
                    </div>
                  );
                })}
              </SettingsCard>
            )}
          </div>
        )}
      </SettingsScreenRoot>

      <VerificationSubscriptionSheet
        open={subscriptionSheetOpen}
        onClose={closeSubscriptionSheet}
        onSubscribed={() => {
          setSubscriptionSheetOpen(false);
          subscriptionReturnToAccountsCenterRef.current = false;
          if (subView !== "verify") setSubView("verify");
        }}
      />
      </>
    );
  }

  const nativeShell = isNativeCapacitorShell();

  return (
    <>
      <SettingsScreenRoot
        header={
          <SettingsHeader
            title={t("settingsActivity")}
            onBack={onBack}
            navScope="local"
            showBack={!accountsCenterOpen}
          />
        }
      >
      <SettingsCard>
        <SettingsRow
          icon={Users}
          label={t("accountsCenter")}
          chevron
          onClick={() => setAccountsCenterOpen(true)}
        />
      </SettingsCard>

      {accountsCenterOpen && (
        <div className="fixed inset-0 z-[10100] bg-black/50">
          <div
            className={cn(
              "absolute flex w-full flex-col overflow-hidden border border-border bg-background text-foreground shadow-2xl",
              nativeShell
                ? "inset-0 max-w-none rounded-none"
                : "inset-x-0 bottom-0 top-[max(3.5rem,var(--sat))] mx-auto max-w-md rounded-t-[28px]",
            )}
            style={{
              transform: `translate3d(0, ${Math.max(0, accountsCenterDragY)}px, 0)`,
              transition: accountsCenterDragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onPointerDown={e => {
              if (e.pointerType === "mouse" && e.button !== 0) return;
              const target = e.target as HTMLElement | null;
              if (!target?.closest("[data-accounts-center-drag-handle]")) return;
              accountsCenterDragRef.current = {
                pointerId: e.pointerId,
                startY: e.clientY - accountsCenterDragY,
                dragging: true,
              };
              setAccountsCenterDragging(true);
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerMove={e => {
              const d = accountsCenterDragRef.current;
              if (!d.dragging || d.pointerId !== e.pointerId) return;
              const dy = Math.max(0, e.clientY - d.startY);
              setAccountsCenterDragY(dy);
            }}
            onPointerUp={e => {
              const d = accountsCenterDragRef.current;
              if (!d.dragging || d.pointerId !== e.pointerId) return;
              d.dragging = false;
              setAccountsCenterDragging(false);
              if (accountsCenterDragY > 140) {
                setAccountsCenterOpen(false);
              } else {
                setAccountsCenterDragY(0);
              }
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerCancel={e => {
              const d = accountsCenterDragRef.current;
              if (d.pointerId !== e.pointerId) return;
              d.dragging = false;
              setAccountsCenterDragging(false);
              setAccountsCenterDragY(0);
            }}
          >
            <div
              data-accounts-center-drag-handle
              className="sticky top-0 z-10 shrink-0 border-b border-border bg-background px-4 pb-3 pt-[max(1.1rem,var(--sat))]"
            >
              <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-muted-foreground/30" />
              <div className="relative text-center">
                <button
                  type="button"
                  className="absolute start-0 top-0 flex items-center gap-1 rounded-full p-2 text-foreground hover:bg-accent"
                  onClick={() => {
                    setAccountsCenterOpen(false);
                    setSubViewReturnToAccountsCenter(false);
                  }}
                  aria-label="رجوع"
                >
                  <ArrowRight size={20} />
                  <span className="text-xs font-medium">رجوع</span>
                </button>
                <p className="text-sm font-semibold text-muted-foreground">ريتويت</p>
                <h3 className="mt-2.5 text-[34px] font-bold leading-tight text-foreground">إدارة الحساب</h3>
                <p className="mx-auto mt-3 max-w-[92%] text-sm leading-6 text-muted-foreground">
                  إدارة التجارب المتصلة وإعدادات الحساب عبر ريتويت.
                </p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-[max(1.75rem,var(--sab))]">
              <div className={accountsCenterCardClass}>
                <AccountsCenterRow
                  icon={UserCircle}
                  label="الملفات الشخصية والتفاصيل"
                  subtitle="٢ ملفات شخصية"
                  onClick={() => openSubViewFromAccountsCenter("accountInfo")}
                />
              </div>

              <div className={`mt-3 ${accountsCenterCardClass}`}>
                <AccountsCenterRow
                  icon={ShieldCheck}
                  label="كلمة المرور والأمان"
                  onClick={() =>
                    openSubViewFromAccountsCenter(apiBackendEnabled() ? "security" : "changePwd")
                  }
                />
                <AccountsCenterRow
                  icon={UsersRound}
                  label="التجارب المتصلة"
                  onClick={() => openSubViewFromAccountsCenter("closeFriends")}
                />
                <AccountsCenterRow
                  icon={Info}
                  label="معلوماتك والأذونات"
                  onClick={() => openSubViewFromAccountsCenter("accountInfo")}
                />
                <AccountsCenterRow
                  icon={Bell}
                  label="تفضيلات الإعلانات"
                  onClick={() => openSubViewFromAccountsCenter("notifications")}
                />
                <AccountsCenterRow
                  icon={Bookmark}
                  label="ريتويت باي"
                  onClick={() => openSubViewFromAccountsCenter("saved")}
                />
                <AccountsCenterRow
                  icon={BadgeCheck}
                  label="الاشتراكات"
                  onClick={() => openVerificationFlow(true)}
                />
              </div>

              {onOpenAccounts ? (
                <div className={`mt-3 ${accountsCenterCardClass}`}>
                  <AccountsCenterRow
                    icon={Users}
                    label="إدارة الحسابات"
                    onClick={() => {
                      setAccountsCenterOpen(false);
                      setSubViewReturnToAccountsCenter(false);
                      onOpenAccounts();
                    }}
                  />
                </div>
              ) : null}

              <p className="mt-6 text-[26px] font-bold leading-none text-foreground">المزيد من ريتويت</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-border bg-card px-4 py-5 text-start transition-colors active:bg-accent"
                  onClick={() => openVerificationFlow(true)}
                >
                  <BadgeCheck size={24} className="mb-3 text-blue-400" />
                  <div className="text-sm font-semibold text-foreground">توثيق ريتويت</div>
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-border bg-card px-4 py-5 text-start transition-colors active:bg-accent"
                  onClick={() => openSubViewFromAccountsCenter("timeManagement")}
                >
                  <Globe size={24} className="mb-3 text-sky-300" />
                  <div className="text-sm font-semibold text-foreground">نظارات الذكاء</div>
                </button>
              </div>

              {isAdmin || isModerator ? (
                <div className={`mt-4 ${accountsCenterCardClass}`}>
                  {isAdmin ? (
                    <AccountsCenterRow
                      icon={BadgeCheck}
                      label="لوحة طلبات التوثيق"
                      onClick={() => openSubViewFromAccountsCenter("adminVerify")}
                    />
                  ) : null}
                  {isModerator ? (
                    <AccountsCenterRow
                      icon={Shield}
                      label="لوحة الإشراف والبلاغات"
                      onClick={() => openSubViewFromAccountsCenter("adminModeration")}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <SectionGap />
      <SectionTitle>{t("howYouUseApp")}</SectionTitle>
      <SettingsCard>
        <SettingsRow icon={Bookmark} label={t("saved")} chevron onClick={() => setSubView("saved")} />
        <SettingsRow icon={Archive} label={t("archive")} chevron onClick={() => setSubView("archive")} />
        <SettingsRow icon={Clock} label={t("timeManagement")} chevron onClick={() => setSubView("timeManagement")} />
      </SettingsCard>

      <SectionGap />
      <SectionTitle>{t("whoCanSee")}</SectionTitle>
      <SettingsCard>
        <SettingsRow icon={UsersRound} label={t("closeFriends")} chevron onClick={() => setSubView("closeFriends")} />
      </SettingsCard>

      <SectionGap />
      <SectionTitle>{t("preferences")}</SectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={state.theme === "dark" ? Moon : Sun}
          label={t("darkMode")}
          right={<IgToggle on={state.theme === "dark"} onToggle={() => setTheme(state.theme === "dark" ? "light" : "dark")} />}
        />
        <SettingsRow
          icon={Globe}
          label={t("language")}
          right={
            <select
              value={state.language}
              onChange={e => setLang(e.target.value as "ar" | "en")}
              className="bg-transparent text-sm text-muted-foreground outline-none"
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          }
        />
        <SettingsRow icon={Bell} label={t("notifications")} chevron onClick={() => setSubView("notifications")} />
      </SettingsCard>

      <SectionGap />
      <SectionTitle>{t("privacy")}</SectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={Lock}
          label={t("private")}
          right={<IgToggle on={me.isPrivate} onToggle={togglePrivate} />}
        />
        <SettingsRow
          icon={MessageCircle}
          label={t("allowStoryReplies")}
          right={
            <IgToggle
              on={me.allowStoryReplies !== false}
              onToggle={() => updateProfile({ allowStoryReplies: me.allowStoryReplies === false })}
            />
          }
        />
        <SettingsRow
          icon={UsersRound}
          label={t("hideFollowLists")}
          right={<IgToggle on={!!me.hideFollowListsFromOthers} onToggle={() => updateProfile({ hideFollowListsFromOthers: !me.hideFollowListsFromOthers })} />}
        />
        <SettingsRow
          icon={Heart}
          label={t("showLikesOnProfile")}
          right={
            <IgToggle
              on={me.showLikesAndFavoritesOnProfile !== false}
              onToggle={() => {
                const v = me.showLikesAndFavoritesOnProfile !== false;
                updateProfile({ showLikesAndFavoritesOnProfile: !v });
              }}
            />
          }
        />
        <SettingsRow
          icon={Shield}
          label={t("privacyPolicy")}
          chevron
          onClick={() => {
            window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer");
          }}
        />
        {apiBackendEnabled() && currentUser && !isGuestUserId(currentUser.id) ? (
          <SettingsRow
            icon={Trash2}
            label={t("deleteAccount")}
            chevron
            onClick={() => setSubView("deleteAccount")}
          />
        ) : null}
      </SettingsCard>

      <SectionGap />
      <SectionTitle>{t("blockedAccounts")}</SectionTitle>
      <SettingsCard>
        {blockedUsers.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{t("noBlockedAccounts")}</p>
        ) : (
          blockedUsers.map(u => (
            <div key={u.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
              <RSocialAvatar name={u.username} src={u.avatar} size={40} />
              <span className="flex-1 truncate text-[15px] text-foreground">@{u.username}</span>
              <button
                type="button"
                onClick={() => setUnblockTarget({ id: u.id, username: u.username })}
                className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground"
              >
                {t("unblockUser")}
              </button>
            </div>
          ))
        )}
      </SettingsCard>

      <SectionGap />
      <SectionTitle>{t("support")}</SectionTitle>
      <SettingsCard>
        {apiBackendEnabled() && currentUser && !isGuestUserId(currentUser.id) ? (
          <SettingsRow
            icon={Archive}
            label={resyncBusy ? "جاري الاستعادة…" : "استعادة البيانات من الخادم"}
            onClick={() => {
              if (resyncBusy) return;
              setResyncBusy(true);
              setResyncMsg(null);
              void hardResyncFromServer().then(r => {
                setResyncBusy(false);
                setResyncMsg(r.ok ? "تمت الاستعادة من الخادم بنجاح" : r.error || "فشلت الاستعادة");
              });
            }}
          />
        ) : null}
        <SettingsRow icon={HelpCircle} label={t("help")} chevron />
        <SettingsRow icon={Info} label={t("about")} chevron />
      </SettingsCard>
      {resyncMsg ? (
        <p className="mx-4 mt-2 text-center text-sm text-muted-foreground">{resyncMsg}</p>
      ) : null}

      <div className="mx-4 mt-6 mb-2">
        <button
          type="button"
          onClick={() => {
            logout();
            onBack();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3.5 text-[15px] font-semibold text-red-500 active:bg-accent dark:text-red-400"
        >
          <LogOut size={18} />
          {t("logout")}
        </button>
      </div>
      </SettingsScreenRoot>

      {unblockTarget && (
        <BlockConfirmSheet
          open
          onClose={() => setUnblockTarget(null)}
          username={unblockTarget.username}
          mode="unblock"
          onConfirm={() => toggleBlockWithSync(unblockTarget.id)}
        />
      )}

      <VerificationSubscriptionSheet
        open={subscriptionSheetOpen}
        onClose={closeSubscriptionSheet}
        onSubscribed={() => {
          setSubscriptionSheetOpen(false);
          subscriptionReturnToAccountsCenterRef.current = false;
          setSubView("verify");
        }}
      />
    </>
  );
}
