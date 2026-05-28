import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Music,
  Search,
  Send,
  Sparkles,
  Star,
  Sticker,
  Type,
  X,
} from "lucide-react";
import { Avatar } from "../Avatar";
import { VerifiedBadge } from "../VerifiedBadge";
import { notifyCameraClose, notifyCameraOpen } from "@/lib/camera/cameraEvents";
import type { CameraComposeDraft } from "../chat/ChatCameraComposeModal";
import { useApp, userById } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";

type FlowScreen = "preview" | "share" | "message";

type ShareTarget = "all" | "close";

function SideEditBtn({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white shadow-lg backdrop-blur-md active:scale-95"
    >
      {children}
    </button>
  );
}

export function CameraCaptureShareScreen({
  draft,
  onClose,
  language = "ar",
  mode = "default",
  onSendToChat,
}: {
  draft: CameraComposeDraft | null;
  onClose: () => void;
  language?: string;
  mode?: "default" | "chat";
  onSendToChat?: (payload: { type: "image" | "video"; content: string; shareText?: string }) => void;
}) {
  const ar = language === "ar";
  const { state, currentUser, addStory, openOrCreateChat, sendMessage, isGuest } = useApp();
  const me = currentUser;

  const [screen, setScreen] = useState<FlowScreen>("preview");
  const [caption, setCaption] = useState("");
  const [shareTarget, setShareTarget] = useState<ShareTarget>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);

  const mediaUrl = draft?.dataUrl ?? "";
  const isVideo = draft?.kind === "video";

  useEffect(() => {
    if (!draft) return;
    setScreen("preview");
    notifyCameraOpen();
    return () => notifyCameraClose();
  }, [draft, mode]);

  const closeAll = useCallback(() => {
    notifyCameraClose();
    onClose();
  }, [onClose]);

  const friends = useMemo(() => {
    if (!me) return [];
    const ids = new Set<string>([...me.following, ...state.chats.map(c => c.members.find(m => m !== me.id)).filter(Boolean) as string[]]);
    return [...ids]
      .map(id => userById(state, id))
      .filter((u): u is NonNullable<typeof u> => !!u && u.id !== me.id)
      .filter(u => !me.blocked.includes(u.id) && !u.blocked.includes(me.id));
  }, [me, state.chats, state.users]);

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      u => u.username.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q),
    );
  }, [friends, search]);

  const publishStory = useCallback(
    async (audience: ShareTarget) => {
      if (!draft || !me || isGuest) {
        if (isGuest) notifyGuestActionBlocked();
        return;
      }
      setBusy(true);
      const r = isVideo
        ? await addStory("", audience, undefined, draft.dataUrl)
        : await addStory(draft.dataUrl, audience);
      setBusy(false);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      closeAll();
    },
    [addStory, closeAll, draft, isGuest, isVideo, me],
  );

  const sendToUser = useCallback(
    (otherId: string) => {
      if (!draft || isGuest) {
        if (isGuest) notifyGuestActionBlocked();
        return;
      }
      const chat = openOrCreateChat(otherId);
      if (!chat) {
        alert(ar ? "تعذّر فتح المحادثة" : "Could not open chat");
        return;
      }
      const note = caption.trim();
      sendMessage(chat.id, {
        type: draft.kind,
        content: draft.dataUrl,
        ...(note ? { shareText: note } : {}),
      });
      closeAll();
    },
    [ar, caption, closeAll, draft, isGuest, openOrCreateChat, sendMessage],
  );

  if (!draft || typeof document === "undefined" || !me) return null;

  const t = {
    yourStory: ar ? "ستوريك" : "Your story",
    closeFriends: ar ? "الأصدقاء المقرّبون" : "Close Friends",
    addPeople: ar ? "إضافة أشخاص" : "Add people",
    sharingOptions: ar ? "خيارات المشاركة" : "Sharing options",
    message: ar ? "رسالة" : "Message",
    share: ar ? "مشاركة" : "Share",
    search: ar ? "بحث" : "Search",
    send: ar ? "إرسال" : "Send",
    captionPh: ar ? "أضف تعليقاً…" : "Add a caption…",
    text: ar ? "نص" : "Text",
    sticker: ar ? "ملصق" : "Sticker",
    music: ar ? "موسيقى" : "Music",
    effects: ar ? "تأثيرات" : "Effects",
    soon: ar ? "قريباً" : "Coming soon",
    sendToChat: ar ? "إرسال للمحادثة" : "Send to chat",
  };

  const sendDirectToChat = useCallback(() => {
    if (!draft || !onSendToChat || busy || isGuest) {
      if (isGuest) notifyGuestActionBlocked();
      return;
    }
    const note = caption.trim();
    onSendToChat({
      type: draft.kind,
      content: draft.dataUrl,
      ...(note ? { shareText: note } : {}),
    });
    closeAll();
  }, [busy, caption, closeAll, draft, isGuest, onSendToChat]);

  const previewLayer = (
    <>
      {isVideo ? (
        <video src={mediaUrl} className="absolute inset-0 h-full w-full object-cover" playsInline autoPlay loop muted />
      ) : (
        <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent" />

      <button
        type="button"
        onClick={closeAll}
        className="absolute start-4 z-30 flex h-11 w-11 items-center justify-center text-white drop-shadow-lg active:scale-95"
        style={{ top: "max(12px, var(--sat, env(safe-area-inset-top, 0px)))" }}
        aria-label={ar ? "حذف" : "Discard"}
      >
        <X size={30} strokeWidth={2.5} />
      </button>

      <div
        className="absolute end-3 z-30 flex flex-col items-center gap-2.5"
        style={{ top: "max(56px, calc(var(--sat, 0px) + 44px))" }}
      >
        {toolsOpen && (
          <>
            <SideEditBtn label={t.text} onClick={() => alert(t.soon)}>
              <Type size={22} strokeWidth={2} />
            </SideEditBtn>
            <SideEditBtn label={t.sticker} onClick={() => alert(t.soon)}>
              <Sticker size={22} strokeWidth={2} />
            </SideEditBtn>
            <SideEditBtn label={t.music} onClick={() => alert(t.soon)}>
              <Music size={22} strokeWidth={2} />
            </SideEditBtn>
            <SideEditBtn label={t.effects} onClick={() => alert(t.soon)}>
              <Sparkles size={22} strokeWidth={2} />
            </SideEditBtn>
          </>
        )}
        <button
          type="button"
          onClick={() => setToolsOpen(o => !o)}
          className="flex h-9 w-9 items-center justify-center text-white/90 drop-shadow-md"
          aria-hidden
        >
          <ChevronDown size={24} className={"transition " + (toolsOpen ? "" : "rotate-180")} />
        </button>
      </div>

      <div
        className="absolute inset-x-0 z-30 px-4"
        style={{ bottom: "calc(max(88px, var(--sab, 0px)) + 56px)" }}
      >
        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder={t.captionPh}
          className="w-full bg-transparent text-[15px] text-white placeholder:text-white/55 outline-none drop-shadow-md"
        />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 px-3"
        style={{ paddingBottom: "max(14px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
      >
        {mode === "chat" ? (
          <>
            <div className="min-w-0 flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={sendDirectToChat}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0095f6] text-white shadow-lg active:scale-95 disabled:opacity-50"
              aria-label={t.sendToChat}
            >
              <ArrowRight size={24} strokeWidth={2.5} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void publishStory("all")}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/45 py-2.5 pe-3 ps-2 backdrop-blur-md active:scale-[0.98] disabled:opacity-50"
            >
              <Avatar name={me.username} src={me.avatar} size={32} className="ring-2 ring-white/30" />
              <span className="truncate text-[13px] font-semibold text-white">{t.yourStory}</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void publishStory("close")}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/45 px-3 py-2.5 backdrop-blur-md active:scale-[0.98] disabled:opacity-50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#41d27d]">
                <Star size={14} className="fill-white text-white" />
              </span>
              <span className="max-w-[5.5rem] truncate text-[12px] font-semibold text-white">{t.closeFriends}</span>
            </button>

            <button
              type="button"
              onClick={() => setScreen("share")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0095f6] text-white shadow-lg active:scale-95"
              aria-label={t.share}
            >
              <ArrowRight size={24} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>
    </>
  );

  const shareSheet = (
    <div className="absolute inset-0 z-40 flex flex-col bg-black/92">
      <div className="flex shrink-0 justify-center pt-3 pb-2" style={{ paddingTop: "max(8px, var(--sat, 0px))" }}>
        <div className="h-1 w-10 rounded-full bg-white/30" />
      </div>
      <div className="flex shrink-0 justify-center px-6 pb-3">
        <div className="h-[38vh] max-h-[320px] w-[42%] min-w-[120px] overflow-hidden rounded-xl bg-zinc-900 shadow-2xl ring-1 ring-white/10">
          {isVideo ? (
            <video src={mediaUrl} className="h-full w-full object-cover" playsInline muted />
          ) : (
            <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      </div>

      <div className="mt-auto flex min-h-0 flex-1 flex-col rounded-t-3xl bg-[#121212]">
        <div className="relative flex items-center justify-center py-4">
          <button
            type="button"
            onClick={() => setScreen("preview")}
            className="absolute start-3 p-2 text-white active:opacity-70"
            aria-label={ar ? "رجوع" : "Back"}
          >
            <ArrowLeft size={22} className="rtl:rotate-180" />
          </button>
          <h2 className="text-[17px] font-bold text-white">{t.share}</h2>
        </div>

        <button
          type="button"
          onClick={() => setShareTarget("all")}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-start active:bg-white/5"
        >
          <Avatar name={me.username} src={me.avatar} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{t.yourStory}</p>
            <p className="text-sm text-zinc-400">{t.sharingOptions} ›</p>
          </div>
          <span
            className={
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 " +
              (shareTarget === "all" ? "border-white" : "border-zinc-500")
            }
          >
            {shareTarget === "all" && <span className="h-3 w-3 rounded-full bg-white" />}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShareTarget("close")}
          className="flex w-full items-center gap-3 px-5 py-3.5 text-start active:bg-white/5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#41d27d]">
            <Star size={22} className="fill-white text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{t.closeFriends}</p>
            <p className="text-sm text-zinc-400">{t.addPeople} ›</p>
          </div>
          <span
            className={
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 " +
              (shareTarget === "close" ? "border-white" : "border-zinc-500")
            }
          >
            {shareTarget === "close" && <span className="h-3 w-3 rounded-full bg-white" />}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setScreen("message")}
          className="flex w-full items-center gap-3 border-b border-white/10 px-5 py-3.5 text-start active:bg-white/5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <Send size={28} className="text-white" />
          </span>
          <p className="flex-1 font-semibold text-white">{t.message}</p>
          <ChevronRight size={22} className="text-zinc-400 rtl:rotate-180" />
        </button>

        <div className="p-4" style={{ paddingBottom: "max(16px, var(--sab, 0px))" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void publishStory(shareTarget)}
            className="w-full rounded-xl bg-[#0095f6] py-3.5 text-[15px] font-bold text-white active:opacity-90 disabled:opacity-50"
          >
            {t.share}
          </button>
        </div>
      </div>
    </div>
  );

  const messageScreen = (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#121212]">
      <div
        className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3"
        style={{ paddingTop: "max(8px, var(--sat, 0px))" }}
      >
        <button type="button" onClick={() => setScreen("share")} className="p-2 text-white active:opacity-70">
          <ArrowLeft size={24} className="rtl:rotate-180" />
        </button>
        <h2 className="flex-1 text-center text-[17px] font-bold text-white">{t.message}</h2>
        <div className="w-10" />
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl bg-zinc-800/90 px-3 py-2.5">
          <Search size={18} className="shrink-0 text-zinc-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.search}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-4">
        {filteredFriends.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">{ar ? "لا يوجد مستخدمون" : "No users"}</p>
        )}
        {filteredFriends.map(u => (
          <div key={u.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 active:bg-white/5">
            <Avatar name={u.username} src={u.avatar} size={48} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate font-semibold text-white">
                {u.name || u.username}
                {u.verified && <VerifiedBadge size={14} />}
              </p>
              <p className="truncate text-sm text-zinc-400">@{u.username}</p>
            </div>
            <button
              type="button"
              onClick={() => sendToUser(u.id)}
              className="shrink-0 rounded-lg bg-[#0095f6] px-5 py-1.5 text-[14px] font-semibold text-white active:opacity-90"
            >
              {t.send}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const body = (
    <div className="fixed inset-0 z-[425] mx-auto max-w-md bg-black" role="dialog" aria-modal="true">
      {previewLayer}
      {screen === "share" && shareSheet}
      {screen === "message" && messageScreen}
    </div>
  );

  return createPortal(body, document.body);
}
