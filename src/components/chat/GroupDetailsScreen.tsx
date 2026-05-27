import { useMemo, useRef, useState } from "react";
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
  MoreHorizontal,
  Palette,
  Search,
  Shield,
  Smile,
  UserPlus,
  Users,
} from "lucide-react";
import { SlideDismissBackButton, SlideDismissShell } from "../SlideDismissShell";
import { Avatar } from "../Avatar";
import { useApp, userById } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Chat, Message } from "@/lib/types";
import { apiBackendEnabled, apiUploadMedia, getApiToken } from "@/lib/apiBackend";
import { resolveMediaUrl } from "@/lib/mediaUrl";

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
  const slice = memberUsers.slice(0, 3);
  if (slice.length === 0) {
    return <Avatar name={chat.name || "مجموعة"} src={chat.avatar} size={size} className="mx-auto" />;
  }
  if (slice.length === 1) {
    return <Avatar name={slice[0].username} src={slice[0].avatar} size={size} className="mx-auto" />;
  }
  const cell = Math.round(size * 0.58);
  const overlap = Math.round(cell * 0.42);
  const totalW = cell + overlap * (slice.length - 1);
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

function sharedMediaFromMessages(messages: Message[]) {
  return messages.filter(
    m =>
      (m.type === "image" && m.content.startsWith("data:")) ||
      (m.type === "video" && !m.viewOnce) ||
      m.type === "shared_post",
  );
}

export function GroupDetailsScreen({
  chat,
  messages,
  onBack,
  onOpenProfile,
  onOpenStickers,
}: {
  chat: Chat;
  messages: Message[];
  onBack: () => void;
  onOpenProfile: (id: string) => void;
  onOpenStickers?: () => void;
}) {
  const {
    state,
    setState,
    currentUser,
    renameGroup,
    updateGroupAvatar,
    toggleGroupAdmin,
    kickMember,
    toggleHost,
    leaveChat,
    addGroupMembers,
    setGroupNickname,
    sendMessage,
    setGroupPublic,
    respondGroupJoinRequest,
    toggleChatMute,
  } = useApp();
  const t = useT();
  const me = currentUser!;
  const [name, setName] = useState(chat.name || "");
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [myNickname, setMyNickname] = useState(chat.groupNicknames?.[me.id] || "");
  const [showNicknames, setShowNicknames] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [pickIds, setPickIds] = useState<string[]>([]);
  const [kickTarget, setKickTarget] = useState<{ id: string; username: string } | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [editNameImage, setEditNameImage] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = chat.admins.includes(me.id);
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
  const mediaItems = useMemo(() => sharedMediaFromMessages(messages).slice(-30).reverse(), [messages]);

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
        const body =
          m.type === "text"
            ? m.content
            : m.shareText || m.content || "";
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

  const actionBtn = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[4.5rem] flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium text-foreground hover:bg-secondary/80"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">{icon}</span>
      {label}
    </button>
  );

  const menuRow = (icon: React.ReactNode, title: string, subtitle: string | undefined, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-3.5 text-start last:border-0 hover:bg-secondary/50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span> : null}
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
    setShowPeople(false);
    setShowMessageSearch(false);
  };

  return (
    <SlideDismissShell
      onDismiss={onBack}
      variant="inline"
      className="flex-1 bg-background"
      blocked={!!kickTarget || showAddMembers}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <SlideDismissBackButton onDismiss={onBack}>
            <ArrowRight />
          </SlideDismissBackButton>
          <h2 className="flex-1 text-center text-base font-semibold pe-10">
            {chat.isChannel ? t("channel") : t("group")}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="px-4 pt-6 pb-4 text-center">
            <div className="relative mx-auto mb-3" style={{ width: 96, height: 96 }}>
              <GroupStackedAvatars chat={chat} memberUsers={memberUsers} size={96} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">{chat.name || t("group")}</h1>
            {isAdmin && (
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-[#0095f6]"
                onClick={() => setEditNameImage(v => !v)}
              >
                {t("groupChangeNameImage")}
              </button>
            )}
            {editNameImage && isAdmin && (
              <div className="mt-4 space-y-2 text-start">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-2xl bg-input px-4 py-2.5 text-sm outline-none"
                  placeholder={t("groupName")}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-2xl bg-secondary py-2 text-sm font-semibold"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {t("groupChangeNameImage")}
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-2xl bg-primary py-2 text-sm font-semibold text-primary-foreground"
                    onClick={() => {
                      renameGroup(chat.id, name);
                      setEditNameImage(false);
                    }}
                  >
                    {t("save")}
                  </button>
                </div>
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
            )}
          </div>

          <div className="flex justify-center gap-1 border-b border-border/60 px-2 pb-4">
            {!chat.isChannel && actionBtn(<UserPlus size={22} />, t("groupAdd"), openAddMembers)}
            {actionBtn(<Search size={22} />, t("groupSearch"), () => {
              setShowMessageSearch(true);
              setShowPeople(false);
              setMemberSearch("");
            })}
            {actionBtn(
              isMuted ? <Bell size={22} /> : <BellOff size={22} />,
              t("groupMute"),
              () => toggleChatMute(chat.id),
            )}
            {actionBtn(<MoreHorizontal size={22} />, t("groupOptions"), () => setShowOptions(true))}
          </div>

          <div className="mt-1">
            {menuRow(<Palette size={18} />, t("groupTheme"), undefined, () => onOpenStickers?.())}
            {menuRow(
              <Link2 size={18} />,
              t("groupInviteLink"),
              inviteUrl ? "…" + chat.inviteCode?.slice(-6) : undefined,
              () => setShowInvite(true),
            )}
            {menuRow(
              <Users size={18} />,
              t("groupPeople"),
              `${chat.members.length} ${t("members")}`,
              () => setShowPeople(true),
            )}
            {menuRow(<AtSign size={18} />, t("groupNicknames"), chat.groupNicknames?.[me.id] || undefined, () =>
              setShowNicknames(true),
            )}
            {menuRow(<Shield size={18} />, t("groupPrivacySafety"), undefined, () => setShowPrivacy(true))}
          </div>

          {mediaItems.length > 0 && (
            <div className="mt-6 px-1">
              <h3 className="mb-2 px-3 text-sm font-semibold">{t("groupSharedMedia")}</h3>
              <div className="grid grid-cols-3 gap-0.5">
                {mediaItems.map(m => {
                  const thumb =
                    m.type === "image"
                      ? m.content
                      : m.type === "video"
                        ? m.content
                        : null;
                  return (
                    <div
                      key={m.id}
                      className="relative aspect-square overflow-hidden bg-muted"
                    >
                      {thumb && (thumb.startsWith("data:") || thumb.startsWith("http") || thumb.startsWith("/")) ? (
                        m.type === "video" ? (
                          <video src={resolveMediaUrl(thumb)} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          <img src={resolveMediaUrl(thumb)} alt="" className="h-full w-full object-cover" />
                        )
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xs text-white/70">
                          {m.type === "shared_post" ? "▶" : "·"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showMessageSearch && (
            <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-input px-3 py-2">
                <Search size={16} className="shrink-0 opacity-60" />
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="ابحث في رسائل المجموعة…"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {memberSearch.trim() && messageSearchHits.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">لا نتائج</p>
                )}
                {messageSearchHits.map(m => {
                  const sender = userById(state, m.senderId);
                  const label = chat.groupNicknames?.[m.senderId] || sender?.username || "?";
                  const preview =
                    m.type === "text" ? m.content : m.shareText || `[${m.type}]`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 rounded-2xl bg-secondary/60 p-2.5 text-start hover:bg-secondary"
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
                      <span className="text-xs font-semibold text-primary">{label}</span>
                      <span className="line-clamp-2 text-sm text-foreground">{preview}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showNicknames && (
            <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-3 space-y-2">
              <p className="text-sm font-semibold">{t("groupNicknames")}</p>
              <p className="text-xs text-muted-foreground">اسمك في هذه المحادثة فقط (حتى 30 حرفاً)</p>
              <input
                value={myNickname}
                maxLength={30}
                onChange={e => setMyNickname(e.target.value)}
                className="w-full rounded-2xl bg-input px-4 py-2.5 text-sm outline-none"
                placeholder="اللقب"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-2xl bg-secondary py-2 text-sm font-semibold"
                  onClick={() => setShowNicknames(false)}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-2xl bg-primary py-2 text-sm font-semibold text-primary-foreground"
                  onClick={() => {
                    setGroupNickname(chat.id, myNickname);
                    setShowNicknames(false);
                  }}
                >
                  {t("save")}
                </button>
              </div>
            </div>
          )}

          {showPeople && (
            <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-3">
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {filteredMembers.map(u => {
                  const admin = chat.admins.includes(u.id);
                  const host = (chat.hosts || []).includes(u.id);
                  return (
                    <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-secondary/60 p-2">
                      <button type="button" onClick={() => onOpenProfile(u.id)}>
                        <Avatar name={u.username} src={u.avatar} size={40} />
                      </button>
                      <div className="min-w-0 flex-1 text-start text-sm">
                        @{u.username}
                        {admin && <span className="ms-1 text-xs text-muted-foreground">(مشرف)</span>}
                        {host && chat.isChannel && <span className="ms-1 text-xs text-primary">(مساهم)</span>}
                      </div>
                      {isAdmin && u.id !== me.id && (
                        <>
                          {chat.isChannel && (
                            <button
                              type="button"
                              onClick={() => toggleHost(chat.id, u.id)}
                              className="rounded-full bg-background px-2 py-1 text-xs"
                            >
                              {host ? t("removeHost") : t("inviteHost")}
                            </button>
                          )}
                          {!chat.isChannel && (
                            <button
                              type="button"
                              onClick={() => toggleGroupAdmin(chat.id, u.id)}
                              className="rounded-full bg-background px-2 py-1 text-xs"
                            >
                              {admin ? "إزالة مشرف" : "تعيين مشرف"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setKickTarget({ id: u.id, username: u.username })}
                            className="text-xs text-destructive"
                          >
                            طرد
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showInvite && isAdmin && !chat.isChannel && (
            <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-3 space-y-2">
              <p className="text-sm font-semibold">{t("groupInviteLink")}</p>
              {inviteUrl ? (
                <p className="break-all text-xs text-muted-foreground dir-ltr text-start">{inviteUrl}</p>
              ) : (
                <p className="text-xs text-muted-foreground">لا يوجد رابط بعد</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!inviteUrl}
                  className="flex-1 rounded-xl bg-secondary py-2 text-sm font-semibold disabled:opacity-50"
                  onClick={() => {
                    if (!inviteUrl) return;
                    void navigator.clipboard.writeText(inviteUrl);
                    alert("تم نسخ الرابط");
                  }}
                >
                  نسخ
                </button>
                <button
                  type="button"
                  disabled={!chat.inviteCode}
                  className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  onClick={() => {
                    if (!chat.inviteCode) return;
                    sendMessage(chat.id, { type: "shared_group", content: chat.inviteCode });
                    alert("تم الإرسال في المحادثة");
                  }}
                >
                  مشاركة
                </button>
                {!inviteUrl && isAdmin && (
                  <button
                    type="button"
                    disabled={inviteBusy}
                    className="w-full rounded-xl border border-border py-2 text-sm font-semibold"
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
                          alert("تم إنشاء رابط الدعوة");
                        } else {
                          alert(res.error || "فشل إنشاء الرابط");
                        }
                      })();
                    }}
                  >
                    {inviteBusy ? "…" : "إنشاء رابط دعوة"}
                  </button>
                )}
                {inviteUrl && (
                  <p className="text-center text-xs text-muted-foreground">
                    الرابط ثابت — شاركه لدعوة أعضاء جدد
                  </p>
                )}
              </div>
            </div>
          )}

          {showPrivacy && isAdmin && !chat.isChannel && (
            <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">مجموعة عامة (انضمام بالرابط)</span>
                <input
                  type="checkbox"
                  checked={chat.isPublicGroup === true}
                  onChange={e => setGroupPublic(chat.id, e.target.checked)}
                  className="h-5 w-5"
                />
              </label>
            </div>
          )}

          {(chat.joinRequests || []).length > 0 && isAdmin && !chat.isChannel && (
            <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-3 space-y-2">
              <p className="text-sm font-semibold">طلبات انضمام</p>
              {(chat.joinRequests || []).map(req => {
                const u = userById(state, req.userId);
                return (
                  <div key={req.userId} className="flex items-center gap-2">
                    <Avatar name={u?.username || "?"} src={u?.avatar} size={32} />
                    <span className="flex-1 text-sm">@{u?.username || "?"}</span>
                    <button
                      type="button"
                      className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
                      onClick={() => respondGroupJoinRequest(chat.id, req.userId, "accept")}
                    >
                      {t("accept")}
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-secondary px-3 py-1 text-xs"
                      onClick={() => respondGroupJoinRequest(chat.id, req.userId, "reject")}
                    >
                      {t("cancel")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {showOptions && (
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0"
              onClick={() => setShowOptions(false)}
            >
              <div
                className="w-full max-w-md rounded-t-3xl bg-background p-4 pb-8 animate-in slide-in-from-bottom duration-200"
                onClick={e => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 hover:bg-secondary"
                  onClick={() => {
                    setShowOptions(false);
                    onOpenStickers?.();
                  }}
                >
                  <Smile size={20} />
                  {t("groupTheme")}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-destructive hover:bg-destructive/10"
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

          <div className="mx-4 mt-8">
            <button
              type="button"
              onClick={() => {
                leaveChat(chat.id);
                onBack();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 font-semibold text-destructive"
            >
              <LogOut size={16} />
              {chat.isChannel ? t("leave") : "مغادرة المجموعة"}
            </button>
          </div>
        </div>
      </div>

      {showAddMembers && isAdmin && !chat.isChannel && (
        <div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 p-0"
          onClick={() => setShowAddMembers(false)}
        >
          <div
            className="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col rounded-t-3xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] animate-in slide-in-from-bottom duration-200"
            data-no-dismiss-drag
            onClick={e => e.stopPropagation()}
          >
            <p className="mb-3 text-center text-sm font-semibold">{t("addMembers")}</p>
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-input px-3 py-2">
              <Search size={16} className="shrink-0 opacity-60" />
              <input
                value={addMemberSearch}
                onChange={e => setAddMemberSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
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
                  className="flex w-full touch-manipulation items-center gap-3 rounded-2xl p-2.5 hover:bg-secondary active:bg-secondary/80"
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
                className="flex-1 rounded-2xl bg-secondary py-2.5 text-sm font-semibold"
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

      {kickTarget && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setKickTarget(null)}
        >
          <div className="w-full max-w-sm rounded-3xl bg-background p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-center text-lg font-bold">تأكيد الطرد</h3>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              هل تريد طرد @{kickTarget.username}؟
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" className="flex-1 rounded-2xl bg-secondary py-2.5 text-sm font-semibold" onClick={() => setKickTarget(null)}>
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
    </SlideDismissShell>
  );
}
