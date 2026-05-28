import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  AtSign,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Link2,
  LogOut,
  MessageCirclePlus,
  MessageCircleWarning,
  MoreHorizontal,
  Search,
  Shield,
  ShieldCheck,
  Smile,
  MicOff,
  Lock,
  Copy,
  Send,
  QrCode,
  Share2,
  RotateCcw,
  UserPlus,
  Users,
} from "lucide-react";
import { GroupRolesSheet } from "@/components/group/GroupRolesSheet";
import { GroupSettingsSheet } from "@/components/group/GroupSettingsSheet";
import { GroupInviteQr } from "@/components/group/GroupInviteQr";
import { ReportFlowSheet } from "@/components/moderation/ReportFlowSheet";
import { canGroup } from "@/lib/groupRbac";
import { SlideDismissBackButton, SlideDismissShell } from "../SlideDismissShell";
import { Avatar } from "../Avatar";
import { useApp, userById } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Chat, Message } from "@/lib/types";
import { apiBackendEnabled, apiUploadMedia, getApiToken } from "@/lib/apiBackend";
import { resolveMediaUrl } from "@/lib/mediaUrl";
import { appThemeScopeStyle } from "@/lib/appThemeScope";
import {
  chatWallpaperLabel,
  getChatWallpaperTheme,
  loadChatWallpaperForChat,
} from "@/lib/chatWallpaperThemes";

type SubView = "editName" | "search" | "people" | "requests" | "nicknames" | "invite" | "privacy" | null;

function isDefaultGroupName(name: string | undefined) {
  const n = name?.trim() || "";
  return !n || n === "مجموعة" || n.startsWith("👥");
}

function groupIgTitle(chat: Chat, memberUsers: { username: string }[]) {
  if (!isDefaultGroupName(chat.name)) return chat.name!.trim();
  return memberUsers.map(u => u.username).join(", ") || chat.name || "";
}

function GroupStackedAvatars({
  chat,
  memberUsers,
  size = 96,
}: {
  chat: Chat;
  memberUsers: { id: string; username: string; avatar?: string }[];
  size?: number;
}) {
  if (chat.avatar && !chat.avatar.startsWith("👥") && chat.avatar.length > 4) {
    return <Avatar name={chat.name || "مجموعة"} src={chat.avatar} size={size} className="mx-auto" />;
  }
  const slice = memberUsers.slice(0, 2);
  if (slice.length === 0) {
    return <Avatar name={chat.name || "مجموعة"} src={chat.avatar} size={size} className="mx-auto" />;
  }
  if (slice.length === 1) {
    return <Avatar name={slice[0].username} src={slice[0].avatar} size={size} className="mx-auto" />;
  }
  const cell = Math.round(size * 0.58);
  const overlap = Math.round(cell * 0.42);
  const totalW = cell + overlap;
  return (
    <div className="relative mx-auto" style={{ width: totalW, height: size }}>
      {slice.map((u, i) => (
        <div
          key={u.id}
          className="absolute rounded-full ring-[3px] ring-background"
          style={{ width: cell, height: cell, insetInlineStart: i * overlap, zIndex: slice.length - i }}
        >
          <Avatar name={u.username} src={u.avatar} size={cell} />
        </div>
      ))}
    </div>
  );
}

const headerIconBtn =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/60 text-foreground hover:bg-secondary active:bg-secondary/80";

function IgSubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 pt-[max(0.5rem,var(--sat))]">
      <SlideDismissBackButton navScope="local" onDismiss={onBack} className={headerIconBtn} aria-label="رجوع">
        <ArrowRight size={22} strokeWidth={1.75} />
      </SlideDismissBackButton>
      <h2 className="flex-1 truncate text-center text-[17px] font-semibold text-foreground">{title}</h2>
      <span className="w-10 shrink-0" aria-hidden />
    </div>
  );
}

function PeopleSubHeader({
  title,
  onBack,
  onAdd,
  showAdd,
}: {
  title: string;
  onBack: () => void;
  onAdd?: () => void;
  showAdd?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 pt-[max(0.5rem,var(--sat))]">
      <SlideDismissBackButton navScope="local" onDismiss={onBack} className={headerIconBtn} aria-label="رجوع">
        <ArrowRight size={22} strokeWidth={1.75} />
      </SlideDismissBackButton>
      <h2 className="flex-1 truncate text-center text-[17px] font-bold text-foreground">{title}</h2>
      {showAdd ? (
        <button type="button" onClick={onAdd} className={headerIconBtn} aria-label="إضافة عضو">
          <UserPlus size={22} strokeWidth={1.75} />
        </button>
      ) : (
        <span className="w-10 shrink-0" aria-hidden />
      )}
    </div>
  );
}

function IgToggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={
        "relative h-[30px] w-[50px] shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-50 " +
        (on ? "bg-[#0095F6]" : "bg-muted-foreground/40")
      }
    >
      <span
        className={
          "block h-[26px] w-[26px] rounded-full bg-white shadow transition-transform dark:bg-zinc-100 " +
          (on ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-0")
        }
      />
    </button>
  );
}

function PeopleSectionLabel({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-1 pt-5 text-[13px] font-normal text-muted-foreground">{children}</p>;
}

const ThemeGradientIcon = () => (
  <span
    className="block h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-[#a855f7] via-[#ec4899] to-[#3b82f6]"
    aria-hidden
  />
);

export function GroupDetailsScreen({
  chat,
  messages,
  onBack,
  onOpenProfile,
  onOpenStickers,
  onOpenChatTheme,
  onCreateNewGroup,
  embeddedInChatStack = false,
}: {
  chat: Chat;
  messages: Message[];
  onBack: () => void;
  onOpenProfile: (id: string) => void;
  onOpenStickers?: () => void;
  onOpenChatTheme?: () => void;
  onCreateNewGroup?: () => void;
  /** فوق غرفة المحادثة — بدون SlideDismissShell لتجنب شاشة فارغة بعد الرجوع */
  embeddedInChatStack?: boolean;
}) {
  const {
    state,
    setState,
    currentUser,
    renameGroup,
    updateGroupAvatar,
    toggleGroupAdmin,
    kickMember,
    muteGroupMember,
    toggleHost,
    leaveChat,
    addGroupMembers,
    setGroupNickname,
    sendMessage,
    setGroupPublic,
    respondGroupJoinRequest,
    toggleChatMute,
    toggleFollow,
  } = useApp();
  const t = useT();
  const me = currentUser!;
  const [name, setName] = useState(chat.name || "");
  const [subView, setSubView] = useState<SubView>(null);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [myNickname, setMyNickname] = useState(chat.groupNicknames?.[me.id] || "");
  const [showRoles, setShowRoles] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [kickTarget, setKickTarget] = useState<{ id: string; username: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [selectedJoinRequestIds, setSelectedJoinRequestIds] = useState<string[]>([]);
  const [bulkApproveBusy, setBulkApproveBusy] = useState(false);
  const [memberMenuTarget, setMemberMenuTarget] = useState<{ id: string; username: string } | null>(null);
  const [muteTarget, setMuteTarget] = useState<{ id: string; username: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = chat.admins.includes(me.id);
  const canManageRoles = canGroup(chat, me.id, "roles.assign_admin") || canGroup(chat, me.id, "roles.demote_any_admin");
  const canEditSettings = canGroup(chat, me.id, "group.edit_settings");
  const isMuted = !!(me.mutedChatIds || []).includes(chat.id);
  const inviteUrl =
    typeof window !== "undefined" && chat.inviteCode
      ? `${window.location.origin}/app/?group=${encodeURIComponent(chat.inviteCode)}`
      : "";
  const memberSet = new Set(chat.members);
  const addCandidates = state.users.filter(
    u => u.id !== me.id && !memberSet.has(u.id) && !me.blocked.includes(u.id) && !u.blocked.includes(me.id),
  );
  const memberUsers = chat.members
    .map(id => userById(state, id))
    .filter((u): u is NonNullable<typeof u> => !!u);
  const displayTitle = groupIgTitle(chat, memberUsers);
  const peopleSubtitle = memberUsers.map(u => u.username).join(", ");
  const reportPeer = memberUsers.find(u => u.id !== me.id);
  const otherMembers = memberUsers.filter(u => u.id !== me.id);
  const requireJoinApproval = chat.isPublicGroup !== true;
  const meRow = userById(state, me.id) || me;
  const meDisplayName =
    chat.groupNicknames?.[me.id]?.trim() || meRow.displayName?.trim() || meRow.username || "?";
  const isFollowingUser = (userId: string) => (me.following || []).includes(userId);

  const filteredMembers = memberUsers.filter(
    u => !memberSearch.trim() || u.username.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );

  const filteredAddCandidates = addCandidates.filter(
    u =>
      !addMemberSearch.trim() ||
      u.username.toLowerCase().includes(addMemberSearch.trim().toLowerCase()) ||
      (u.displayName || "").toLowerCase().includes(addMemberSearch.trim().toLowerCase()),
  );

  const messageSearchHits = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];
    return messages
      .filter(m => {
        const sender = userById(state, m.senderId);
        const body = m.type === "text" ? m.content : m.shareText || m.content || "";
        const nick = chat.groupNicknames?.[m.senderId] || sender?.username || "";
        return (
          body.toLowerCase().includes(q) ||
          nick.toLowerCase().includes(q) ||
          (sender?.username || "").toLowerCase().includes(q)
        );
      })
      .slice(-40)
      .reverse();
  }, [messages, memberSearch, state, chat.groupNicknames]);

  const uploadAvatar = (f: File) => {
    void (async () => {
      const token = getApiToken();
      if (apiBackendEnabled() && token) {
        const up = await apiUploadMedia(token, f);
        if (up.ok) {
          updateGroupAvatar(chat.id, up.url);
          return;
        }
        alert(up.error || "فشل رفع الصورة");
        return;
      }
      const r = new FileReader();
      r.onload = () => updateGroupAvatar(chat.id, String(r.result));
      r.readAsDataURL(f);
    })();
  };

  const closeSub = () => setSubView(null);

  const themeSubtitle = chatWallpaperLabel(
    getChatWallpaperTheme(loadChatWallpaperForChat(chat, currentUser?.id ?? "")),
    state.language,
  );

  const actionBtn = (icon: ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[4.25rem] flex-1 flex-col items-center gap-2 px-1 py-1 text-[11px] font-medium text-foreground"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-foreground">{icon}</span>
      {label}
    </button>
  );

  const menuRow = (icon: ReactNode, title: string, subtitle: string | undefined, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-start last:border-0 hover:bg-secondary/50 active:bg-secondary/80"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-normal text-foreground">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground rtl:rotate-180" />
    </button>
  );

  const openAddMembers = () => {
    if (!isAdmin || chat.isChannel) {
      alert("فقط مشرف المجموعة يمكنه إضافة أعضاء");
      return;
    }
    setPickIds([]);
    setAddMemberSearch("");
    setShowAddMembers(true);
  };

  const mainList = (
    <>
      <div className="px-4 pb-2 pt-2 text-center">
        <div className="relative mx-auto mb-4" style={{ width: 96, height: 96 }}>
          <GroupStackedAvatars chat={chat} memberUsers={memberUsers} size={96} />
        </div>
        <h1 className="text-xl font-bold leading-snug text-foreground">{displayTitle}</h1>
        {isAdmin && !chat.isChannel && (
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-[#0095f6]"
            onClick={() => setSubView("editName")}
          >
            {t("groupChangeNameImage")}
          </button>
        )}
      </div>

      <div className="flex justify-between px-4 pb-5 pt-1">
        {!chat.isChannel && actionBtn(<UserPlus size={24} strokeWidth={1.5} />, t("groupAdd"), openAddMembers)}
        {actionBtn(
          <Search size={24} strokeWidth={1.5} />,
          t("groupSearch"),
          () => {
            setMemberSearch("");
            setSubView("search");
          },
        )}
        {actionBtn(
          isMuted ? <BellOff size={24} strokeWidth={1.5} /> : <Bell size={24} strokeWidth={1.5} />,
          t("groupMute"),
          () => toggleChatMute(chat.id),
        )}
        {actionBtn(
          <MoreHorizontal size={24} strokeWidth={1.5} />,
          t("groupOptions"),
          () => setShowOptions(true),
        )}
      </div>

      <div>
        {menuRow(<ThemeGradientIcon />, t("groupTheme"), themeSubtitle, () => (onOpenChatTheme ?? onOpenStickers)?.())}
        {!chat.isChannel &&
          menuRow(
            <Link2 size={20} strokeWidth={1.75} />,
            t("groupInviteLink"),
            inviteUrl || undefined,
            () => setSubView("invite"),
          )}
        {menuRow(
          <Users size={20} strokeWidth={1.75} />,
          t("groupPeople"),
          peopleSubtitle || undefined,
          () => setSubView("people"),
        )}
        {menuRow(
          <AtSign size={20} strokeWidth={1.75} />,
          t("groupNicknames"),
          chat.groupNicknames?.[me.id] || undefined,
          () => setSubView("nicknames"),
        )}
        {menuRow(
          <Shield size={20} strokeWidth={1.75} />,
          t("groupPrivacySafety"),
          undefined,
          () => setSubView("privacy"),
        )}
        {!chat.isChannel &&
          menuRow(
            <MessageCirclePlus size={20} strokeWidth={1.75} />,
            t("groupCreateNew"),
            undefined,
            () => onCreateNewGroup?.(),
          )}
        {menuRow(
          <MessageCircleWarning size={20} strokeWidth={1.75} />,
          t("groupSomethingNotWorking"),
          undefined,
          () => {
            if (reportPeer) setShowReport(true);
            else alert(t("comingSoonPanel"));
          },
        )}
      </div>
    </>
  );

  const renderSubView = () => {
    switch (subView) {
      case "editName":
        return (
          <>
            <IgSubHeader title={t("groupChangeNameImage")} onBack={closeSub} />
            <div className="space-y-4 px-4 py-6">
              <div className="flex justify-center">
                <button type="button" onClick={() => avatarInputRef.current?.click()} className="relative">
                  <GroupStackedAvatars chat={chat} memberUsers={memberUsers} size={88} />
                </button>
              </div>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl bg-input px-4 py-3 text-sm text-foreground outline-none"
                placeholder={t("groupName")}
              />
              <button
                type="button"
                className="w-full rounded-xl bg-secondary py-3 text-sm font-semibold text-foreground"
                onClick={() => avatarInputRef.current?.click()}
              >
                {t("groupChangeNameImage")}
              </button>
              <button
                type="button"
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
                onClick={() => {
                  renameGroup(chat.id, name);
                  closeSub();
                }}
              >
                {t("save")}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadAvatar(f);
                }}
              />
            </div>
          </>
        );
      case "search":
        return (
          <>
            <IgSubHeader title={t("groupSearch")} onBack={closeSub} />
            <div className="px-4 py-3">
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-input px-3 py-2.5">
                <Search size={18} className="shrink-0 text-muted-foreground" />
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="ابحث في رسائل المجموعة…"
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                {memberSearch.trim() && messageSearchHits.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">لا نتائج</p>
                )}
                {messageSearchHits.map(m => {
                  const sender = userById(state, m.senderId);
                  const label = chat.groupNicknames?.[m.senderId] || sender?.username || "?";
                  const preview = m.type === "text" ? m.content : m.shareText || `[${m.type}]`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 rounded-xl bg-secondary p-3 text-start active:bg-secondary/80"
                      onClick={() => {
                        onBack();
                        try {
                          window.dispatchEvent(
                            new CustomEvent("retweet-scroll-chat-message", {
                              detail: { messageId: m.id },
                            }),
                          );
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      <span className="text-xs font-semibold text-[#0095f6]">{label}</span>
                      <span className="line-clamp-2 text-sm text-foreground">{preview}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        );
      case "people": {
        const renderMemberRow = (
          u: { id: string; username: string; avatar?: string; displayName?: string },
          opts?: { subtitle?: string; showActions?: boolean },
        ) => {
          const admin = chat.admins.includes(u.id);
          const host = (chat.hosts || []).includes(u.id);
          const following = isFollowingUser(u.id);
          const showActions = opts?.showActions !== false && u.id !== me.id;
          return (
            <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
              <button type="button" onClick={() => onOpenProfile(u.id)} className="shrink-0">
                <Avatar name={u.username} src={u.avatar} size={56} />
              </button>
              <button
                type="button"
                onClick={() => onOpenProfile(u.id)}
                className="min-w-0 flex-1 text-start"
              >
                <p className="truncate text-[15px] font-semibold leading-snug text-foreground">
                  {u.displayName?.trim() || u.username}
                </p>
                {opts?.subtitle ? (
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{opts.subtitle}</p>
                ) : null}
                {!opts?.subtitle && host && chat.isChannel ? (
                  <p className="mt-0.5 text-[13px] text-[#0095f6]">مساهم</p>
                ) : null}
              </button>
              {showActions && (
                <div className="flex shrink-0 items-center gap-2">
                  {isAdmin && !chat.isChannel && (
                    <button
                      type="button"
                      aria-label="خيارات"
                      onClick={() => setMemberMenuTarget({ id: u.id, username: u.username })}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-secondary/80"
                    >
                      <MoreHorizontal size={22} strokeWidth={1.75} />
                    </button>
                  )}
                  {!following ? (
                    <button
                      type="button"
                      onClick={() => toggleFollow(u.id)}
                      className="rounded-lg bg-[#0095F6] px-4 py-1.5 text-[13px] font-semibold text-white"
                    >
                      {t("groupFollow")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleFollow(u.id)}
                      className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-[13px] font-semibold text-foreground"
                    >
                      {t("groupFollowing")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <>
            <PeopleSubHeader
              title={t("groupPeople")}
              onBack={closeSub}
              showAdd={isAdmin && !chat.isChannel}
              onAdd={openAddMembers}
            />

            {isAdmin && !chat.isChannel && (
              <button
                type="button"
                onClick={() => {
                  setSelectedJoinRequestIds([]);
                  setSubView("requests");
                }}
                className="flex w-full items-center justify-between border-b border-border/60 px-4 py-3.5 text-start hover:bg-secondary/40"
              >
                <span className="text-[15px] font-medium text-foreground">Requests</span>
                <span className="text-[14px] font-semibold text-[#0095F6]">
                  {(chat.joinRequests || []).length}
                </span>
              </button>
            )}

            <PeopleSectionLabel>{t("groupYou")}</PeopleSectionLabel>
            {renderMemberRow(
              {
                id: me.id,
                username: meRow.username,
                avatar: meRow.avatar,
                displayName: meDisplayName,
              },
              {
                subtitle: isAdmin
                  ? `${t("groupAdmin")} · ${meRow.username}`
                  : meRow.username,
                showActions: false,
              },
            )}

            {(chat.joinRequests || []).length > 0 && isAdmin && !chat.isChannel && (
              <>
                <PeopleSectionLabel>
                  {t("groupPendingJoin")} ({(chat.joinRequests || []).length})
                </PeopleSectionLabel>
                {(chat.joinRequests || []).map(req => {
                  const u = userById(state, req.userId);
                  if (!u) return null;
                  return (
                    <div key={req.userId} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar name={u.username} src={u.avatar} size={56} />
                      <div className="min-w-0 flex-1 text-start">
                        <p className="truncate text-[15px] font-semibold text-foreground">{u.username}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-[#0095F6] px-3 py-1.5 text-[13px] font-semibold text-white"
                          onClick={() => respondGroupJoinRequest(chat.id, req.userId, "accept")}
                        >
                          {t("accept")}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-semibold text-foreground"
                          onClick={() => respondGroupJoinRequest(chat.id, req.userId, "reject")}
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {otherMembers.length > 0 && (
              <>
                <PeopleSectionLabel>
                  {t("groupInvited")} ({otherMembers.length})
                </PeopleSectionLabel>
                {otherMembers.map(u =>
                  renderMemberRow(u, {
                    subtitle: chat.admins.includes(u.id) ? `${t("groupAdmin")} · ${u.username}` : undefined,
                  }),
                )}
              </>
            )}
          </>
        );
      }
      case "nicknames":
        return (
          <>
            <IgSubHeader title={t("groupNicknames")} onBack={closeSub} />
            <div className="space-y-3 px-4 py-6">
              <p className="text-sm text-muted-foreground">اسمك في هذه المحادثة فقط (حتى 30 حرفاً)</p>
              <input
                value={myNickname}
                maxLength={30}
                onChange={e => setMyNickname(e.target.value)}
                className="w-full rounded-xl bg-input px-4 py-3 text-sm text-foreground outline-none"
                placeholder="اللقب"
              />
              <button
                type="button"
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
                onClick={() => {
                  setGroupNickname(chat.id, myNickname);
                  closeSub();
                }}
              >
                {t("save")}
              </button>
            </div>
          </>
        );
      case "invite":
        return (
          <>
            <IgSubHeader title={t("groupInviteLink")} onBack={closeSub} />
            <div className="space-y-0 px-0 pb-[max(1rem,var(--sab))]">
              <div className="border-b border-border/70 px-4 py-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[17px] font-semibold text-foreground">Invite link</p>
                    {inviteUrl ? (
                      <p className="mt-1 break-all text-sm text-[#8ea2ff] dir-ltr">{inviteUrl}</p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">No invite link yet</p>
                    )}
                  </div>
                  {isAdmin && !chat.isChannel ? (
                    <IgToggle
                      on={chat.isPublicGroup !== true}
                      onToggle={() => setGroupPublic(chat.id, chat.isPublicGroup !== true)}
                    />
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {chat.isPublicGroup === true
                    ? "عند إيقاف الزر: المجموعة عامة وتظهر في البحث ويمكن الانضمام مباشرة."
                    : "عند تشغيل الزر: المجموعة خاصة، الدخول عبر الرابط أو الطلبات فقط."}
                </p>
                {inviteUrl && (
                  <div className="mt-4 flex justify-center">
                    <GroupInviteQr chat={chat} size={156} />
                  </div>
                )}
              </div>
              <div className="border-b border-border/70 py-1">
                <button
                  type="button"
                  disabled={!inviteUrl}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start text-[16px] text-foreground disabled:opacity-40"
                  onClick={() => {
                    if (!inviteUrl) return;
                    void navigator.clipboard.writeText(inviteUrl);
                    alert("Copied");
                  }}
                >
                  <Copy size={20} />
                  Copy
                </button>
                <button
                  type="button"
                  disabled={!chat.inviteCode}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start text-[16px] text-foreground disabled:opacity-40"
                  onClick={() => {
                    if (!chat.inviteCode) return;
                    sendMessage(chat.id, { type: "shared_group", content: chat.inviteCode });
                    alert("Sent");
                  }}
                >
                  <Send size={20} />
                  Send in Instagram
                </button>
                <button
                  type="button"
                  disabled={!inviteUrl}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start text-[16px] text-foreground disabled:opacity-40"
                  onClick={() => {
                    if (!inviteUrl) return;
                    setTimeout(() => {
                      alert("QR code is shown above.");
                    }, 0);
                  }}
                >
                  <QrCode size={20} />
                  QR code
                </button>
                <button
                  type="button"
                  disabled={!inviteUrl}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start text-[16px] text-foreground disabled:opacity-40"
                  onClick={() => {
                    if (!inviteUrl) return;
                    if (navigator.share) {
                      void navigator.share({ title: chat.name || "Group Invite", url: inviteUrl }).catch(() => {});
                      return;
                    }
                    void navigator.clipboard.writeText(inviteUrl);
                    alert("Copied for sharing");
                  }}
                >
                  <Share2 size={20} />
                  Share
                </button>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={inviteBusy}
                  className="mt-1 flex w-full items-center gap-3 px-4 py-3 text-start text-[16px] text-rose-500 disabled:opacity-40"
                  onClick={() => {
                    const token = getApiToken();
                    if (!token || !apiBackendEnabled()) return;
                    setInviteBusy(true);
                    void (async () => {
                      const { apiPatchGroup } = await import("@/lib/apiBackend");
                      const res = await apiPatchGroup(token, chat.id, {});
                      setInviteBusy(false);
                      if (res.ok && res.chat?.inviteCode) {
                        setState(s => ({
                          ...s,
                          chats: s.chats.map(c =>
                            c.id === chat.id ? { ...c, inviteCode: res.chat!.inviteCode } : c,
                          ),
                        }));
                        alert("Invite link reset");
                      } else {
                        alert(res.error || "فشل إنشاء الرابط");
                      }
                    })();
                  }}
                >
                  <RotateCcw size={19} />
                  {inviteBusy ? "Resetting..." : "Reset link"}
                </button>
              )}
            </div>
          </>
        );
      case "requests": {
        const requests = (chat.joinRequests || [])
          .map(req => ({ ...req, user: userById(state, req.userId) }))
          .filter((row): row is { userId: string; at: number; user: NonNullable<typeof meRow> } => !!row.user);
        const selectedCount = selectedJoinRequestIds.length;
        const allSelected = requests.length > 0 && selectedCount === requests.length;
        return (
          <>
            <PeopleSubHeader title="Requests" onBack={closeSub} />
            <div className="border-b border-border/60 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                اختر الحسابات ثم اضغط قبول لإدخالهم إلى القروب.
              </p>
              {requests.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedJoinRequestIds(allSelected ? [] : requests.map(row => row.userId))
                  }
                  className="mt-2 text-sm font-semibold text-[#0095F6]"
                >
                  {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                </button>
              )}
            </div>
            <div className="divide-y divide-border/50">
              {requests.map(({ userId, user }) => {
                const selected = selectedJoinRequestIds.includes(userId);
                return (
                  <button
                    key={userId}
                    type="button"
                    onClick={() =>
                      setSelectedJoinRequestIds(prev =>
                        prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId],
                      )
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-secondary/40"
                  >
                    <Avatar name={user.username} src={user.avatar} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-foreground">
                        @{user.username}
                      </p>
                      {user.displayName ? (
                        <p className="truncate text-[13px] text-muted-foreground">{user.displayName}</p>
                      ) : null}
                    </div>
                    <span
                      className={
                        "flex h-6 w-6 items-center justify-center rounded-full border " +
                        (selected
                          ? "border-[#0095F6] bg-[#0095F6] text-white"
                          : "border-border bg-background text-transparent")
                      }
                    >
                      <Check size={14} />
                    </span>
                  </button>
                );
              })}
              {requests.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  لا توجد طلبات حالياً
                </p>
              )}
            </div>
            <div className="sticky bottom-0 border-t border-border bg-background/95 p-3 backdrop-blur">
              <button
                type="button"
                disabled={selectedCount === 0 || bulkApproveBusy}
                onClick={() => {
                  if (selectedCount === 0) return;
                  setBulkApproveBusy(true);
                  try {
                    selectedJoinRequestIds.forEach(id =>
                      respondGroupJoinRequest(chat.id, id, "accept"),
                    );
                    setSelectedJoinRequestIds([]);
                  } finally {
                    setBulkApproveBusy(false);
                  }
                }}
                className="w-full rounded-xl bg-[#0095F6] py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {bulkApproveBusy
                  ? "جاري القبول..."
                  : selectedCount > 0
                    ? `قبول (${selectedCount})`
                    : "قبول"}
              </button>
            </div>
          </>
        );
      }
      case "privacy":
        return (
          <>
            <IgSubHeader title={t("groupPrivacySafety")} onBack={closeSub} />
            <div className="px-4 py-4">
              {canEditSettings && !chat.isChannel && (
                <label className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-border">
                  <div>
                    <p className="text-sm font-semibold text-foreground">كتم جماعي للكتابة</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">عند التشغيل: فقط الأدمن يكتب</p>
                  </div>
                  <IgToggle
                    on={(chat.groupSettings?.whoCanSendMessages || "everyone") === "admins"}
                    onToggle={() => {
                      const lockOn = (chat.groupSettings?.whoCanSendMessages || "everyone") !== "admins";
                      const nextWhoCanSend = lockOn ? "admins" : "everyone";
                      setState(s => ({
                        ...s,
                        chats: s.chats.map(c =>
                          c.id === chat.id
                            ? {
                                ...c,
                                groupSettings: {
                                  ...(c.groupSettings || {}),
                                  whoCanSendMessages: nextWhoCanSend,
                                },
                              }
                            : c,
                        ),
                      }));
                      if (apiBackendEnabled()) {
                        void import("@/lib/groupApi").then(({ apiPatchGroupSettings }) => {
                          void apiPatchGroupSettings(chat.id, { whoCanSendMessages: nextWhoCanSend });
                        });
                      }
                    }}
                  />
                </label>
              )}
              {isAdmin && !chat.isChannel ? (
                <label className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-4 ring-1 ring-border">
                  <span className="text-sm text-foreground">مجموعة عامة (انضمام بالرابط)</span>
                  <input
                    type="checkbox"
                    checked={chat.isPublicGroup === true}
                    onChange={e => setGroupPublic(chat.id, e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">إعدادات الخصوصية للمشرف فقط</p>
              )}
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const themeScopeStyle = appThemeScopeStyle(state.theme);

  const panel = (
      <div
        className="group-details-screen-root flex min-h-0 flex-1 flex-col"
        style={themeScopeStyle}
        data-app-theme={state.theme}
      >
        {subView == null ? (
          <div className="shrink-0 px-3 pt-[max(0.5rem,var(--sat))]">
            <SlideDismissBackButton
              navScope="local"
              onDismiss={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-secondary/80"
              aria-label="رجوع"
            >
              <ArrowRight size={22} strokeWidth={1.75} />
            </SlideDismissBackButton>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[max(1.5rem,var(--sab))]">
          {subView == null ? mainList : renderSubView()}
        </div>

      {showOptions && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0"
          onClick={() => setShowOptions(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-background p-2 pb-[max(1rem,var(--sab))] animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
              onClick={() => {
                setShowOptions(false);
                (onOpenChatTheme ?? onOpenStickers)?.();
              }}
            >
              <Smile size={22} />
              {t("groupTheme")}
            </button>
            {!chat.isChannel && canManageRoles && (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
                onClick={() => {
                  setShowOptions(false);
                  setShowRoles(true);
                }}
              >
                <ShieldCheck size={22} />
                الأدوار والصلاحيات
              </button>
            )}
            {!chat.isChannel && canEditSettings && (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
                onClick={() => {
                  setShowOptions(false);
                  setShowAdvancedSettings(true);
                }}
              >
                <Shield size={22} />
                إعدادات متقدمة
              </button>
            )}
            <button
              type="button"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-destructive hover:bg-destructive/10"
              onClick={() => {
                setShowOptions(false);
                leaveChat(chat.id);
                onBack();
              }}
            >
              <LogOut size={18} />
              {chat.isChannel ? t("leave") : "مغادرة المجموعة"}
            </button>
          </div>
        </div>
      )}

      {showAddMembers && isAdmin && !chat.isChannel && (
        <div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-black/60 p-0"
          onClick={() => setShowAddMembers(false)}
        >
          <div
            className="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col rounded-t-3xl bg-background p-4 pb-[max(1rem,var(--sab))] text-foreground animate-in slide-in-from-bottom duration-200"
            data-no-dismiss-drag
            onClick={e => e.stopPropagation()}
          >
            <p className="mb-3 text-center text-sm font-semibold">{t("addMembers")}</p>
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-input px-3 py-2">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <input
                value={addMemberSearch}
                onChange={e => setAddMemberSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                autoFocus
              />
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain">
              {filteredAddCandidates.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">لا يوجد حسابات إضافية</p>
              )}
              {filteredAddCandidates.map(u => (
                <button
                  key={u.id}
                  type="button"
                  data-no-dismiss-drag
                  onClick={() =>
                    setPickIds(ids => (ids.includes(u.id) ? ids.filter(x => x !== u.id) : [...ids, u.id]))
                  }
                  className="flex w-full touch-manipulation items-center gap-3 rounded-2xl p-2.5 hover:bg-secondary/50"
                >
                  <Avatar name={u.username} src={u.avatar} size={36} />
                  <span className="flex-1 text-start text-sm">@{u.username}</span>
                  {pickIds.includes(u.id) && <Check className="shrink-0 text-primary" />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex shrink-0 gap-2">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-secondary py-2.5 text-sm font-semibold text-foreground"
                onClick={() => setShowAddMembers(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={pickIds.length === 0}
                className="flex-1 rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                onClick={() => {
                  addGroupMembers(chat.id, pickIds);
                  setShowAddMembers(false);
                  setPickIds([]);
                }}
              >
                {t("groupAdd")} ({pickIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {memberMenuTarget && isAdmin && (
        <div
          className="fixed inset-0 z-[72] flex items-end justify-center bg-black/60 p-0"
          onClick={() => setMemberMenuTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-background p-2 pb-[max(1rem,var(--sab))] animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
              onClick={() => {
                onOpenProfile(memberMenuTarget.id);
                setMemberMenuTarget(null);
              }}
            >
              عرض الملف الشخصي
            </button>
            {!chat.isChannel && (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
                  onClick={() => {
                    toggleGroupAdmin(chat.id, memberMenuTarget.id);
                    setMemberMenuTarget(null);
                  }}
                >
                  {chat.admins.includes(memberMenuTarget.id) ? "إزالة مشرف" : "تعيين مشرف"}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setKickTarget(memberMenuTarget);
                    setMemberMenuTarget(null);
                  }}
                >
                  طرد من المجموعة
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
                  onClick={() => {
                    setMuteTarget(memberMenuTarget);
                    setMemberMenuTarget(null);
                  }}
                >
                  <MicOff size={18} className="shrink-0" />
                  كتم العضو
                </button>
              </>
            )}
            {chat.isChannel && (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] text-foreground hover:bg-secondary/50"
                onClick={() => {
                  toggleHost(chat.id, memberMenuTarget.id);
                  setMemberMenuTarget(null);
                }}
              >
                {(chat.hosts || []).includes(memberMenuTarget.id) ? t("removeHost") : t("inviteHost")}
              </button>
            )}
          </div>
        </div>
      )}

      {kickTarget && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setKickTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-background p-5 text-foreground shadow-xl ring-1 ring-border"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-center text-lg font-bold">تأكيد الطرد</h3>
            <p className="mt-3 text-center text-sm text-muted-foreground">هل تريد طرد @{kickTarget.username}؟</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-secondary py-2.5 text-sm font-semibold text-foreground"
                onClick={() => setKickTarget(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
                onClick={() => {
                  kickMember(chat.id, kickTarget.id);
                  setKickTarget(null);
                }}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {muteTarget && (
        <div
          className="fixed inset-0 z-[82] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setMuteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-background p-5 text-foreground shadow-xl ring-1 ring-border"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-center text-lg font-bold">كتم @{muteTarget.username}</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">حدد مدة الكتم:</p>
            <div className="mt-4 space-y-2">
              {[
                { label: "5 دقائق", value: 5 },
                { label: "10 دقائق", value: 10 },
                { label: "ساعة", value: 60 },
                { label: "للأبد", value: null as number | null },
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:bg-secondary"
                  onClick={() => {
                    muteGroupMember(chat.id, muteTarget.id, item.value);
                    setMuteTarget(null);
                  }}
                >
                  <span>{item.label}</span>
                  <Lock size={16} className="text-muted-foreground" />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-secondary py-2.5 text-sm font-semibold text-foreground"
              onClick={() => setMuteTarget(null)}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {showReport && reportPeer && (
        <ReportFlowSheet
          open={showReport}
          onClose={() => setShowReport(false)}
          reportedUserId={reportPeer.id}
          reportedUsername={reportPeer.username}
          targetType="user"
        />
      )}

      {showRoles && !chat.isChannel && <GroupRolesSheet chat={chat} onClose={() => setShowRoles(false)} />}
      {showAdvancedSettings && !chat.isChannel && (
        <GroupSettingsSheet chat={chat} onClose={() => setShowAdvancedSettings(false)} />
      )}
      </div>
  );

  if (embeddedInChatStack) return panel;

  return (
    <SlideDismissShell
      onDismiss={onBack}
      variant="inline"
      className="flex-1"
      blocked={!!kickTarget || !!muteTarget || showAddMembers || showReport || !!memberMenuTarget}
    >
      {panel}
    </SlideDismissShell>
  );
}
