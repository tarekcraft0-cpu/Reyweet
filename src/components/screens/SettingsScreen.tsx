import React, { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useApp, userById } from "@/lib/store";
import type { User } from "@/lib/types";
import { ensureApiTokenMatchesUser } from "@/lib/accountSessions";
import { isGuestUserId } from "@/lib/guestUser";
import {
  apiBackendEnabled,
  apiPatchProfile,
  ensureApiRuntimeConfig,
  getApiToken,
  pushRemoteAppState,
} from "@/lib/apiBackend";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import { apiAdminMe } from "@/lib/verificationApi";
import { VerificationSubscriptionScreen } from "../verification/VerificationSubscriptionScreen";
import { VerificationRequestPanel } from "../verification/VerificationRequestPanel";
import { VerificationBadgeColorPicker } from "../verification/VerificationBadgeColorPicker";
import { AdminVerificationPanel } from "../verification/AdminVerificationPanel";
import { ModerationDashboard } from "../admin/ModerationDashboard";
import { apiAdminModerationMe } from "@/lib/moderationApi";
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
  Sun,
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
  | "subscription"
  | "adminVerify"
  | "adminModeration"
  | "saved"
  | "archive"
  | "timeManagement"
  | "closeFriends"
  | "notifications";

function SectionGap() {
  return <div className="h-2 shrink-0 bg-background" aria-hidden />;
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
}: {
  title: string;
  onBack: () => void;
  /** shell = إغلاق الإعدادات بانزلاق؛ local = رجوع داخل القائمة فقط */
  navScope?: "shell" | "local";
}) {
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-30 flex flex-row items-center gap-3 border-b border-border bg-background px-2 py-3 pt-[max(0.5rem,var(--sat))] [padding-inline-start:max(0.5rem,var(--sal))] [padding-inline-end:max(0.5rem,var(--sar))]"
    >
      <SlideDismissBackButton
        navScope={navScope}
        onDismiss={onBack}
        className="relative z-40 shrink-0 rounded-full p-2 text-foreground active:bg-accent"
        aria-label="رجوع"
      >
        <ArrowRight size={24} strokeWidth={1.75} />
      </SlideDismissBackButton>
      <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold text-foreground px-2">{title}</h1>
      <span className="w-10 shrink-0" aria-hidden />
    </div>
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
    toggleBlock,
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
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const blockedUsers = state.users.filter(u => (me.blocked ?? []).includes(u.id));

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
    setSubView(null);
    setOldP("");
    setNewP("");
  };

  const subTitle = (k: SubView): string => {
    if (k === "adminModeration") return "لوحة الإشراف";
    const map: Record<Exclude<SubView, null | "adminModeration">, TKey> = {
      accountInfo: "accountInfo",
      changePwd: "changePwd",
      verify: "verifyAccount",
      subscription: "verifyAccount",
      adminVerify: "verifyAccount",
      saved: "saved",
      archive: "archive",
      timeManagement: "timeManagement",
      closeFriends: "closeFriends",
      notifications: "notificationsSettings",
    };
    return k && k in map ? t(map[k as keyof typeof map]) : "";
  };

  if (subView === "saved") {
    return <PlaceholderPanel title={t("saved")} hint={t("savedHint")} onBack={() => setSubView(null)} />;
  }
  if (subView === "archive") {
    return <StoriesArchiveScreen onBack={() => setSubView(null)} />;
  }
  if (subView === "timeManagement") {
    return <PlaceholderPanel title={t("timeManagement")} hint={t("timeMgmtHint")} onBack={() => setSubView(null)} />;
  }
  if (subView === "notifications") {
    return <PlaceholderPanel title={t("notificationsSettings")} hint={t("comingSoonPanel")} onBack={() => setSubView(null)} />;
  }

  if (subView === "subscription") {
    return (
      <VerificationSubscriptionScreen
        onBack={() => setSubView("verify")}
        onSubscribed={() => setSubView("verify")}
      />
    );
  }

  if (subView) {
    return (
      <div className="settings-screen-root min-h-full w-full overflow-x-hidden bg-background pb-10" dir="rtl">
        <SettingsHeader title={subTitle(subView)} onBack={() => setSubView(null)} navScope="local" />

        {subView === "accountInfo" && (
          <AccountInfoPanel me={me} updateProfile={updateProfile} onSaved={() => setSubView(null)} />
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
                  setSubView(null);
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
              <VerificationRequestPanel onNeedSubscription={() => setSubView("subscription")} />
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
      </div>
    );
  }

  return (
    <div className="settings-screen-root min-h-full w-full max-w-full overflow-x-hidden bg-background pb-10" dir="rtl">
      <SettingsHeader title={t("settingsActivity")} onBack={onBack} navScope="local" />

      {/* مركز الحسابات */}
      <div dir="rtl" className="mx-4 mt-2 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-4 text-start">
          <h2 className="text-[15px] font-semibold text-foreground">{t("accountsCenter")}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{t("accountsCenterDesc")}</p>
        </div>
        <div className="divide-y divide-border">
          {onOpenAccounts ? (
            <SettingsRow icon={Users} label={t("activeAccountsAdd")} chevron onClick={onOpenAccounts} />
          ) : null}
          {getUserEntitlements(me).isVerified ? (
            <SettingsRow
              icon={BadgeCheck}
              label={t("verifiedAccount")}
              chevron
              onClick={() => setSubView("verify")}
            />
          ) : (
            <SettingsRow
              icon={BadgeCheck}
              label="Get Verified"
              chevron
              onClick={() => setSubView("verify")}
            />
          )}
          <SettingsRow icon={UserCircle} label={t("accountInfo")} chevron onClick={() => setSubView("accountInfo")} />
          <SettingsRow icon={KeyRound} label={t("changePwd")} chevron onClick={() => setSubView("changePwd")} />
          {isAdmin ? (
            <SettingsRow
              icon={BadgeCheck}
              label="لوحة طلبات التوثيق"
              chevron
              onClick={() => setSubView("adminVerify")}
            />
          ) : null}
          {isModerator ? (
            <SettingsRow
              icon={Shield}
              label="لوحة الإشراف والبلاغات"
              chevron
              onClick={() => setSubView("adminModeration")}
            />
          ) : null}
        </div>
      </div>

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
                onClick={() => toggleBlock(u.id)}
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

      <div className="mx-4 mt-6">
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
    </div>
  );
}
