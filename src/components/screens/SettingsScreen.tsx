import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useApp, userById } from "@/lib/store";
import { apiBackendEnabled, apiPatchProfile, ensureApiRuntimeConfig, getApiToken } from "@/lib/apiBackend";
import { useT, type TKey } from "@/lib/i18n";
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
  Sun,
  UserCircle,
  Users,
  UsersRound,
} from "lucide-react";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { RSocialAvatar } from "../rsocial/RSocialAvatar";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { writeDeviceTheme } from "@/lib/deviceTheme";

type SubView =
  | null
  | "accountInfo"
  | "changePwd"
  | "verify"
  | "saved"
  | "archive"
  | "timeManagement"
  | "closeFriends"
  | "notifications";

function SectionGap() {
  return <div className="h-2 shrink-0 bg-black dark:bg-black" aria-hidden />;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{children}</p>
  );
}

function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      className="mx-4 overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-900/95 divide-y divide-zinc-800/90"
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
        "relative h-[30px] w-[50px] shrink-0 rounded-full p-0.5 transition-colors " + (on ? "bg-[#0095F6]" : "bg-zinc-600")
      }
    >
      <span
        className={
          "block h-[26px] w-[26px] rounded-full bg-white shadow transition-transform " +
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
        <Icon size={22} strokeWidth={1.5} className="text-zinc-100" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-normal leading-snug text-zinc-50">{label}</span>
      {(right || chevron) && (
        <span className="flex shrink-0 items-center gap-2">
          {right}
          {chevron && !right && (
            <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-zinc-500 rtl:rotate-180" aria-hidden />
          )}
        </span>
      )}
    </>
  );
  const className =
    "flex w-full min-h-[52px] flex-row items-center gap-3 px-4 py-3 text-start transition-colors active:bg-zinc-800/60";
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
    <div className="min-h-full bg-black pb-8">
      <SettingsHeader title={title} onBack={onBack} />
      <div className="px-6 pt-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
          <Info size={28} className="text-zinc-500" />
        </div>
        <p className="text-sm leading-relaxed text-zinc-400">{hint}</p>
        <p className="mt-3 text-xs text-zinc-600">{t("comingSoonPanel")}</p>
      </div>
    </div>
  );
}

function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-10 flex flex-row items-center gap-3 border-b border-zinc-900 bg-black px-2 py-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <SlideDismissBackButton
        navScope="local"
        onDismiss={onBack}
        className="shrink-0 rounded-full p-2 text-zinc-50 active:bg-zinc-900"
        aria-label="رجوع"
      >
        <ArrowRight size={24} strokeWidth={1.75} />
      </SlideDismissBackButton>
      <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold text-zinc-50 px-2">{title}</h1>
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
  const { state, setState, currentUser, logout, updateProfile, toggleBlock, toggleCloseFriend, changeOwnPassword } = useApp();
  const t = useT();
  const me = currentUser!;
  const [subView, setSubView] = useState<SubView>(null);
  const [oldP, setOldP] = useState("");
  const [newP, setNewP] = useState("");
  const blockedUsers = state.users.filter(u => me.blocked.includes(u.id));

  const followingUsers = useMemo(
    () =>
      me.following
        .map(id => userById(state, id))
        .filter((u): u is NonNullable<typeof u> => !!u && u.id !== me.id),
    [me.following, state.users, me.id],
  );

  const setTheme = (th: "light" | "dark") => {
    writeDeviceTheme(th);
    setState(s => ({ ...s, theme: th }));
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
    setState(s => ({ ...s, language: l }));
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
    const map: Record<Exclude<SubView, null>, TKey> = {
      accountInfo: "accountInfo",
      changePwd: "changePwd",
      verify: "verifyAccount",
      saved: "saved",
      archive: "archive",
      timeManagement: "timeManagement",
      closeFriends: "closeFriends",
      notifications: "notificationsSettings",
    };
    return subView ? t(map[subView]) : "";
  };

  if (subView === "saved") {
    return <PlaceholderPanel title={t("saved")} hint={t("savedHint")} onBack={() => setSubView(null)} />;
  }
  if (subView === "archive") {
    return <PlaceholderPanel title={t("archive")} hint={t("archiveHint")} onBack={() => setSubView(null)} />;
  }
  if (subView === "timeManagement") {
    return <PlaceholderPanel title={t("timeManagement")} hint={t("timeMgmtHint")} onBack={() => setSubView(null)} />;
  }
  if (subView === "notifications") {
    return <PlaceholderPanel title={t("notificationsSettings")} hint={t("comingSoonPanel")} onBack={() => setSubView(null)} />;
  }

  if (subView) {
    return (
      <div className="min-h-full bg-black pb-10" dir="rtl">
        <SettingsHeader title={subTitle(subView)} onBack={() => setSubView(null)} />

        {subView === "accountInfo" && (
          <div className="mx-4 mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
              <RSocialAvatar name={me.username} src={me.avatar} size={56} />
              <div className="min-w-0">
                <div className="font-semibold text-zinc-50 truncate">@{me.username}</div>
                <div className="text-xs text-zinc-500 truncate">{me.email}</div>
              </div>
            </div>
            <div className="flex justify-between gap-2 text-zinc-400">
              <span>المعرّف</span>
              <span className="text-zinc-300 font-mono text-xs truncate max-w-[60%]">{me.id}</span>
            </div>
          </div>
        )}

        {subView === "changePwd" && (
          <div className="mx-4 mt-4 space-y-3">
            <input
              value={oldP}
              onChange={e => setOldP(e.target.value)}
              type="password"
              placeholder={t("pwdCurrent")}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-50 placeholder:text-zinc-600"
            />
            <input
              value={newP}
              onChange={e => setNewP(e.target.value)}
              type="password"
              placeholder={t("pwdNew")}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-50 placeholder:text-zinc-600"
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

        {subView === "verify" && !me.verified && (
          <div className="mx-4 mt-4 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm leading-relaxed text-zinc-400">{t("verifyHint")}</p>
            <div className="space-y-2 rounded-lg bg-zinc-950 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">اليوزر</span>
                <span className="text-zinc-200">@{me.username}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">البريد</span>
                <span className="text-zinc-200 truncate">{me.email}</span>
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-xl bg-[#0095F6] py-3 text-sm font-semibold text-white"
              onClick={() => {
                void (async () => {
                  await ensureApiRuntimeConfig();
                  const token = getApiToken();
                  if (token && apiBackendEnabled()) {
                    const r = await apiPatchProfile(token, { verified: true });
                    if (!r.ok) {
                      try {
                        alert(r.error || "تعذر حفظ التوثيق");
                      } catch {
                        /* ignore */
                      }
                      return;
                    }
                    updateProfile(
                      {
                        verified: r.user.verified === true,
                        founderVerified: r.user.founderVerified === true,
                      },
                      { commitRemote: false },
                    );
                  } else {
                    updateProfile({ verified: true }, { commitRemote: true });
                  }
                  setSubView(null);
                })();
              }}
            >
              {t("confirmVerify")}
            </button>
          </div>
        )}

        {subView === "closeFriends" && (
          <div className="mt-2">
            <p className="px-4 pb-3 text-xs leading-relaxed text-zinc-500">{t("closeFriendsHint")}</p>
            {followingUsers.length === 0 ? (
              <p className="px-4 text-sm text-zinc-600">{t("closeFriendsEmpty")}</p>
            ) : (
              <SettingsCard>
                {followingUsers.map(u => {
                  const isClose = me.closeFriends.includes(u.id);
                  return (
                    <div key={u.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                      <RSocialAvatar name={u.username} src={u.avatar} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] text-zinc-50">@{u.username}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCloseFriend(u.id)}
                        className={
                          "rounded-lg px-3 py-1.5 text-xs font-semibold " +
                          (isClose ? "bg-zinc-700 text-zinc-100" : "bg-[#0095F6] text-white")
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
    <div className="min-h-full bg-black pb-10" dir="rtl">
      <SettingsHeader title={t("settingsActivity")} onBack={onBack} />

      {/* مركز الحسابات */}
      <div dir="rtl" className="mx-4 mt-2 overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/95">
        <div className="border-b border-zinc-800/90 px-4 py-4 text-start">
          <h2 className="text-[15px] font-semibold text-zinc-50">{t("accountsCenter")}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{t("accountsCenterDesc")}</p>
        </div>
        <div className="divide-y divide-zinc-800/90">
          {onOpenAccounts ? (
            <SettingsRow icon={Users} label={t("activeAccountsAdd")} chevron onClick={onOpenAccounts} />
          ) : null}
          {me.verified ? (
            <div className="flex min-h-[52px] flex-row items-center gap-3 px-4 py-3 text-start">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                <VerifiedMarkForUser user={me} size={22} />
              </span>
              <span className="min-w-0 flex-1 text-[15px] text-zinc-50">{t("verifiedAccount")}</span>
              <span className="shrink-0 text-sm text-[#0095F6]">✓</span>
            </div>
          ) : (
            <SettingsRow icon={BadgeCheck} label={t("verifyAccount")} chevron onClick={() => setSubView("verify")} />
          )}
          <SettingsRow icon={UserCircle} label={t("accountInfo")} chevron onClick={() => setSubView("accountInfo")} />
          <SettingsRow icon={KeyRound} label={t("changePwd")} chevron onClick={() => setSubView("changePwd")} />
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
              className="bg-transparent text-sm text-zinc-400 outline-none"
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
          <p className="px-4 py-4 text-sm text-zinc-600">{t("noBlockedAccounts")}</p>
        ) : (
          blockedUsers.map(u => (
            <div key={u.id} className="flex min-h-[52px] items-center gap-3 px-4 py-2">
              <RSocialAvatar name={u.username} src={u.avatar} size={40} />
              <span className="flex-1 truncate text-[15px] text-zinc-50">@{u.username}</span>
              <button
                type="button"
                onClick={() => toggleBlock(u.id)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200"
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
        <SettingsRow icon={HelpCircle} label={t("help")} chevron />
        <SettingsRow icon={Info} label={t("about")} chevron />
      </SettingsCard>

      <div className="mx-4 mt-6">
        <button
          type="button"
          onClick={() => {
            logout();
            onBack();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 py-3.5 text-[15px] font-semibold text-red-400 active:bg-zinc-800"
        >
          <LogOut size={18} />
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
