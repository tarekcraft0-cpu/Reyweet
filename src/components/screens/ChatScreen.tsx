import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { QURAN_CHANNEL_ID, useApp, userById, visibleChatMessages } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ChatStickerPicker } from "../chat/ChatStickerPicker";
import { ChatCameraComposeModal, ViewOnceMediaOverlay, type CameraComposeDraft } from "../chat/ChatCameraComposeModal";
import { ChatSharedFeedOverlay, type ChatShareFeedItem } from "../chat/ChatSharedFeedOverlay";
import { SharedPostPreview, SharedStoryChatPreview } from "../SharedPostPreview";
import { ProfileNoteReplySheet } from "../ProfileNoteReplySheet";
import { EXTENDED_REACTION_EMOJIS } from "@/lib/reactionEmojiGrid";
import { isStickerImageContent, isStickerVideoContent } from "@/lib/stickerUtils";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";
import { Mic, Image as ImageIcon, Smile, Sticker, Phone, Video, MicOff, MonitorUp, X, Plus, ArrowRight, Settings as SettingsIcon, Check, Camera, Search, Square, Megaphone, Users, LogOut, AtSign, MoreVertical, ChevronLeft, Reply, Forward, Copy, Trash2, Flag, MoreHorizontal, ChevronRight, Pin, Play, Pause, Star, Bell, BellOff, Mail } from "lucide-react";
import type { AppState, Chat, Message } from "@/lib/types";

const PREVIEW_MAX = 96;
/** عرض عمود التطبيق (مثل max-w-md) للمعاينة والسحب */
const APP_COLUMN_MAX_PX = 448;

function viewOnceOpenedForViewer(m: Message, viewerId: string) {
  return !!(m.viewOnce && (m.viewOnceOpenedByUserIds || []).includes(viewerId));
}

function viewOncePillActiveClass(mine: boolean, isQuran: boolean): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1.5 text-xs font-semibold shadow-none ring-0 outline-none transition active:scale-[0.97]";
  if (isQuran) {
    return base + (mine ? " bg-zinc-700/90 text-zinc-50" : " bg-zinc-800/90 text-zinc-100");
  }
  if (mine) {
    return base + " bg-primary/20 text-foreground dark:bg-primary/35 dark:text-primary-foreground";
  }
  return base + " bg-background/85 text-foreground dark:bg-muted/75";
}

function viewOncePillDoneClass(mine: boolean, isQuran: boolean): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1.5 text-xs font-medium shadow-none ring-0 outline-none";
  if (isQuran) return base + " bg-zinc-800/40 text-zinc-300";
  if (mine) return base + " bg-muted/55 text-muted-foreground dark:bg-zinc-800/50 dark:text-zinc-300";
  return base + " bg-muted/50 text-muted-foreground";
}

const QUICK_REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

function formatMsgContextTime(createdAt: number, lang: string) {
  try {
    return new Date(createdAt).toLocaleString(lang === "en" ? "en-US" : "ar-SA", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function aggregateReactions(reactions: { emoji: string; userId: string }[]) {
  const map = new Map<string, number>();
  for (const r of reactions) {
    map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
  }
  return Array.from(map.entries());
}

function chatForwardLabel(state: AppState, c: Chat, meId: string): string {
  if (c.isGroup || c.isChannel) return c.name || (c.isChannel ? "قناة" : "مجموعة");
  const oid = c.members.find(x => x !== meId);
  const u = oid ? userById(state, oid) : null;
  return u ? "@" + u.username : "?";
}

function ForwardChatSheet({
  currentChat,
  message,
  me,
  onClose,
}: {
  currentChat: Chat;
  message: Message;
  me: { id: string };
  onClose: () => void;
}) {
  const { state, forwardMessage, currentUser } = useApp();
  const t = useT();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const filtered = state.chats
      .filter(c => c.id !== currentChat.id)
      .filter(c => c.members.includes(me.id))
      .filter(c => !c.request)
      .filter(c => {
        if (!qq) return true;
        return chatForwardLabel(state, c, me.id).toLowerCase().includes(qq);
      });
    const meFull = currentUser;
    if (!meFull || meFull.id !== me.id) return filtered;
    const pins = meFull.pinnedChatIds || [];
    const lastActivityAt = (c: Chat) => {
      const vis = visibleChatMessages(c, me.id);
      const last = vis[vis.length - 1];
      return last?.createdAt ?? 0;
    };
    return [...filtered].sort((a, b) => {
      const ia = pins.indexOf(a.id);
      const ib = pins.indexOf(b.id);
      const aPin = ia >= 0;
      const bPin = ib >= 0;
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      if (aPin && bPin) return ia - ib;
      return lastActivityAt(b) - lastActivityAt(a);
    });
  }, [state.chats, state.users, currentChat.id, me.id, q, currentUser]);

  return (
    <div className="fixed inset-0 z-[400] flex justify-center bg-black/50" role="presentation" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 mx-auto max-w-md rounded-t-3xl border border-border bg-background p-4 shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-2 font-semibold">{t("forwardPickChat")}</h3>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="mb-2 w-full rounded-2xl bg-input px-3 py-2 text-sm outline-none"
        />
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("forwardEmpty")}</p>
          ) : (
            rows.map(c => {
              const label = chatForwardLabel(state, c, me.id);
              const av =
                c.isGroup || c.isChannel ? c.avatar : userById(state, c.members.find(x => x !== me.id) || "")?.avatar;
              return (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-2xl p-2 text-start hover:bg-secondary"
                  onClick={() => {
                    forwardMessage(currentChat.id, c.id, message.id);
                    onClose();
                  }}
                >
                  <Avatar name={label} src={av} size={40} />
                  <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                </button>
              );
            })
          )}
        </div>
        <button type="button" className="mt-3 w-full py-2 text-sm text-muted-foreground hover:text-foreground" onClick={onClose}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function truncateText(s: string, max = PREVIEW_MAX) {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

function lastMessagePreview(last: Message | undefined): string {
  if (!last) return "—";
  if (last.type === "text") return truncateText(last.content);
  if (last.type === "sticker") return (isStickerImageContent(last.content) || isStickerVideoContent(last.content)) ? "ملصق" : truncateText(last.content, 24);
  if (last.type === "image") return last.viewOnce ? "صورة (مرة واحدة)" : "صورة";
  if (last.type === "video") return last.viewOnce ? "فيديو (مرة واحدة)" : "فيديو";
  if (last.type === "voice") return "رسالة صوتية";
  if (last.type === "shared_post") return "منشور";
  if (last.type === "shared_story") return "ستوري";
  return `[${last.type}]`;
}

function fmtVoiceTime(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** مشغّل صوتي بدون شريط المتصفح الأسود — تشغيل + 🎙️ + تقدم */
function InlineVoicePlayer({ src, durationSec, isQuran }: { src: string; durationSec?: number; isQuran: boolean }) {
  const isVideo = src.startsWith("data:video");
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const el = (isVideo ? videoRef.current : audioRef.current) as HTMLMediaElement | null;
    if (!el) return;
    const onT = () => setCur(el.currentTime);
    const onMeta = () => {
      const d = el.duration;
      setDur(d && isFinite(d) && d > 0 ? d : durationSec || 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCur(0);
    };
    el.addEventListener("timeupdate", onT);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onT);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [src, isVideo, durationSec]);

  const toggle = async () => {
    const el = (isVideo ? videoRef.current : audioRef.current) as HTMLMediaElement | null;
    if (!el) return;
    try {
      if (el.paused) await el.play();
      else el.pause();
    } catch {
      /* ignore */
    }
  };

  const total = dur || durationSec || 0;
  const pct = total > 0 ? Math.min(100, (cur / total) * 100) : 0;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      {isVideo ? (
        <video ref={videoRef} src={src} preload="metadata" className="hidden" playsInline />
      ) : (
        <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      )}
      <div
        className={
          "flex w-full min-w-0 max-w-full items-center gap-2 rounded-full py-1 ps-1 pe-2.5 " +
          (isQuran ? "bg-zinc-800/90 text-zinc-100" : "bg-black/[0.06] dark:bg-white/10")
        }
      >
        <button
          type="button"
          onClick={toggle}
          className={
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
            (isQuran ? "bg-zinc-600 text-zinc-50" : "bg-primary text-primary-foreground")
          }
          aria-label={playing ? "إيقاف" : "تشغيل"}
        >
          {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="ms-0.5 fill-current" />}
        </button>
        <span className="shrink-0 select-none text-lg leading-none" aria-hidden>
          🎙️
        </span>
        <div className="relative h-1 min-w-[40px] flex-1 rounded-full bg-black/10 dark:bg-white/15">
          <div
            className={"absolute inset-y-0 start-0 rounded-full " + (isQuran ? "bg-zinc-300" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={"shrink-0 text-[10px] tabular-nums opacity-80 " + (isQuran ? "text-zinc-300" : "")}>
          {fmtVoiceTime(cur)} / {fmtVoiceTime(total)}
        </span>
      </div>
    </div>
  );
}

function peekMessageLine(m: Message): string {
  if (m.type === "text") return truncateText(m.content, 220);
  if (m.type === "sticker") return truncateText(m.content, 48);
  if (m.type === "image") return m.viewOnce ? "صورة · مرة واحدة" : "صورة";
  if (m.type === "video") return m.viewOnce ? "فيديو · مرة واحدة" : "فيديو";
  if (m.type === "voice") return "رسالة صوتية";
  if (m.type === "shared_post") return "منشور";
  if (m.type === "shared_story") return "ستوري";
  return `[${m.type}]`;
}

/** محتوى رسالة في معاينة السحب — عرض ثابت كالشات حتى لا يلتف النص داخل شريط ضيق */
function ChatPeekMessageBody({
  m,
  isQuran = false,
  viewerId,
  bubbleMine,
}: {
  m: Message;
  isQuran?: boolean;
  viewerId: string;
  bubbleMine: boolean;
}) {
  if (m.type === "text")
    return (
      <span className="block whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:break-word] [word-break:normal]">
        {m.content}
      </span>
    );
  if (m.type === "shared_post") {
    return (
      <div className="max-w-[min(96vw,360px)]">
        {m.shareText && <p className="mb-1 line-clamp-2 text-[11px] opacity-80">{m.shareText}</p>}
        <SharedPostPreview postId={m.content} variant="chat" />
      </div>
    );
  }
  if (m.type === "shared_story") {
    return (
      <div className="max-w-[min(96vw,360px)]">
        {m.shareText && <p className="mb-1 line-clamp-2 text-[11px] opacity-80">{m.shareText}</p>}
        <SharedStoryChatPreview storyId={m.content} />
      </div>
    );
  }
  if (m.type === "voice" && m.content.startsWith("data:")) {
    return <InlineVoicePlayer src={m.content} durationSec={m.durationSec} isQuran={isQuran} />;
  }
  if (m.type === "voice" && !m.content.startsWith("data:")) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xl">🎙️</span>
        <span>{m.content}</span>
      </span>
    );
  }
  if (m.type === "sticker" && isStickerImageContent(m.content)) {
    return (
      <img
        src={m.content}
        alt=""
        className="block h-auto max-h-[260px] w-auto max-w-[240px] border-0 bg-transparent object-contain outline-none ring-0 rounded-none"
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (m.type === "sticker" && isStickerVideoContent(m.content)) {
    return (
      <video
        src={m.content}
        className="block h-auto max-h-[260px] w-auto max-w-[240px] border-0 bg-transparent object-contain outline-none ring-0 rounded-none"
        autoPlay
        loop
        muted
        playsInline
        controls={false}
        preload="metadata"
      />
    );
  }
  if (m.type === "sticker") {
    return (
      <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-[18px] bg-secondary/40 text-2xl leading-none select-none">
        {m.content}
      </span>
    );
  }
  if (m.type === "image" && m.viewOnce) {
    if (viewOnceOpenedForViewer(m, viewerId)) {
      return <span className={viewOncePillDoneClass(bubbleMine, isQuran)}>صورة · تمت</span>;
    }
    return (
      <span className={viewOncePillActiveClass(bubbleMine, isQuran)}>
        <Play size={12} className="shrink-0 fill-current opacity-90" />
        صورة
      </span>
    );
  }
  if (m.type === "video" && m.viewOnce) {
    if (viewOnceOpenedForViewer(m, viewerId)) {
      return <span className={viewOncePillDoneClass(bubbleMine, isQuran)}>فيديو · تمت</span>;
    }
    return (
      <span className={viewOncePillActiveClass(bubbleMine, isQuran)}>
        <Play size={12} className="shrink-0 fill-current opacity-90" />
        فيديو
      </span>
    );
  }
  if (m.type === "image") {
    return <img src={m.content} alt="" className="block max-h-80 w-full max-w-[28rem] border-0 object-cover outline-none ring-0 rounded-none" />;
  }
  if (m.type === "video") {
    return <video src={m.content} controls className="max-h-80 w-full max-w-[28rem] border-0 object-cover outline-none ring-0 rounded-none" preload="metadata" />;
  }
  return <span className="text-sm leading-relaxed [overflow-wrap:break-word] [word-break:normal]">{peekMessageLine(m)}</span>;
}

/** سحب من جهة أيقونة الكاميرا نحو عرض المحادثة (معاينة مثل السناب) */
function ChatListRowWithPeek({
  chat: c,
  me,
  onOpenChat,
}: {
  chat: Chat;
  me: { id: string };
  onOpenChat: (id: string) => void;
}) {
  const { state, openOrCreateChat, sendMessage, toggleChatListPin, toggleChatMute, deleteChat, isGuest } = useApp();
  const t = useT();
  const [peekPx, setPeekPx] = useState(0);
  const [cameraDraft, setCameraDraft] = useState<CameraComposeDraft | null>(null);
  const peekRef = useRef(0);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const capWidth = () => (typeof window !== "undefined" ? Math.min(window.innerWidth, APP_COLUMN_MAX_PX) : APP_COLUMN_MAX_PX);

  const otherId = c.isGroup || c.isChannel ? null : c.members.find(id => id !== me.id);
  const other = otherId ? userById(state, otherId) : null;
  const meUser = userById(state, me.id);
  const isListPinned = !!(meUser?.pinnedChatIds || []).includes(c.id);
  const isMuted = !!(meUser?.mutedChatIds || []).includes(c.id);
  const peekMessages = useMemo(() => visibleChatMessages(c, me.id), [c.messages, c.hiddenMessageIdsByUser, me.id]);
  const last = peekMessages[peekMessages.length - 1];
  const readId = c.lastReadMessageIdByUser?.[me.id];
  const hasUnread = !!(last && last.senderId !== me.id && last.id !== readId);
  const displayName = (c.isGroup || c.isChannel) ? c.name || "?" : other?.username || "?";
  const avatarSrc = (c.isGroup || c.isChannel) ? c.avatar : other?.avatar;
  const isQuranPeek = c.id === QURAN_CHANNEL_ID;
  const titlePeek = (c.isGroup || c.isChannel) ? c.name || "…" : "@" + (other?.username || "");
  const peekScrollRef = useRef<HTMLDivElement>(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const skipAvatarClickRef = useRef(false);
  const cameraLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraPeekArmedRef = useRef(false);
  const cameraDownRef = useRef<{ x0: number; y0: number; pointerId: number; downAt: number } | null>(null);
  const peekPivotXRef = useRef(0);
  const lastPtrRef = useRef({ x: 0, y: 0 });
  const cameraBtnRef = useRef<HTMLButtonElement | null>(null);

  const clearLongPressTimerOnly = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearAvatarLongPress = useCallback(() => {
    clearLongPressTimerOnly();
    longPressStartRef.current = null;
  }, [clearLongPressTimerOnly]);

  const openRowMenuAt = useCallback((clientX: number, clientY: number) => {
    const pad = 12;
    const menuW = 220;
    const menuH = 200;
    let x = clientX;
    let y = clientY;
    if (typeof window !== "undefined") {
      x = Math.min(Math.max(menuW / 2 + pad, x), window.innerWidth - menuW / 2 - pad);
      y = Math.min(Math.max(pad + 40, y), window.innerHeight - menuH - pad);
    }
    setRowMenu({ x, y });
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }, []);

  const onAvatarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clearLongPressTimerOnly();
      longPressStartRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        skipAvatarClickRef.current = true;
        window.setTimeout(() => {
          skipAvatarClickRef.current = false;
        }, 450);
        openRowMenuAt(e.clientX, e.clientY);
      }, 480);
    },
    [clearLongPressTimerOnly, openRowMenuAt],
  );

  const onAvatarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressStartRef.current || !longPressTimerRef.current) return;
      const dx = e.clientX - longPressStartRef.current.x;
      const dy = e.clientY - longPressStartRef.current.y;
      if (dx * dx + dy * dy > 100) {
        clearLongPressTimerOnly();
        longPressStartRef.current = null;
      }
    },
    [clearLongPressTimerOnly],
  );

  const onAvatarPointerEnd = useCallback(() => {
    clearAvatarLongPress();
  }, [clearAvatarLongPress]);

  useEffect(() => {
    if (!rowMenu) return;
    let close: ((ev: PointerEvent) => void) | null = null;
    const t = window.setTimeout(() => {
      close = (ev: PointerEvent) => {
        const node = ev.target as HTMLElement | null;
        if (node?.closest?.("[data-chat-row-menu]")) return;
        setRowMenu(null);
      };
      document.addEventListener("pointerdown", close, true);
    }, 80);
    return () => {
      clearTimeout(t);
      if (close) document.removeEventListener("pointerdown", close, true);
    };
  }, [rowMenu]);

  useLayoutEffect(() => {
    if (peekPx <= 0) return;
    const el = peekScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [peekPx, peekMessages.length, c.id]);

  const onCameraFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const kind = f.type.startsWith("video") ? "video" : "image";
    const r = new FileReader();
    r.onload = () => {
      setCameraDraft({ kind, dataUrl: String(r.result) });
    };
    r.readAsDataURL(f);
  };

  const clearCameraLongPress = useCallback(() => {
    if (cameraLongPressTimerRef.current) {
      window.clearTimeout(cameraLongPressTimerRef.current);
      cameraLongPressTimerRef.current = null;
    }
  }, []);

  const finishCameraGesture = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      clearCameraLongPress();
      const down = cameraDownRef.current;
      cameraDownRef.current = null;
      const armed = cameraPeekArmedRef.current;
      cameraPeekArmedRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      if (armed) {
        const px = peekRef.current;
        const cap = capWidth();
        peekRef.current = 0;
        setPeekPx(0);
        if (px >= cap * 0.97) onOpenChat(c.id);
        return;
      }
      if (!down) return;
      const duration = Date.now() - down.downAt;
      const distSq = (e.clientX - down.x0) ** 2 + (e.clientY - down.y0) ** 2;
      if (duration < 450 && distSq < 200) {
        cameraInputRef.current?.click();
      }
    },
    [clearCameraLongPress, onOpenChat, c.id],
  );

  const onCameraPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    cameraBtnRef.current = e.currentTarget;
    cameraDownRef.current = { x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, downAt: Date.now() };
    cameraPeekArmedRef.current = false;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    clearCameraLongPress();
    cameraLongPressTimerRef.current = window.setTimeout(() => {
      cameraLongPressTimerRef.current = null;
      cameraPeekArmedRef.current = true;
      peekPivotXRef.current = lastPtrRef.current.x;
      const btn = cameraBtnRef.current;
      const d = cameraDownRef.current;
      if (btn && d) {
        try {
          btn.setPointerCapture(d.pointerId);
        } catch {
          /* ignore */
        }
      }
    }, 450);
  };

  const onCameraPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    const down = cameraDownRef.current;
    if (!down) return;
    const dx = e.clientX - down.x0;
    const dy = e.clientY - down.y0;
    if (!cameraPeekArmedRef.current) {
      if (dx * dx + dy * dy > 140) clearCameraLongPress();
      return;
    }
    const rtl = typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
    const pullDx = rtl ? e.clientX - peekPivotXRef.current : peekPivotXRef.current - e.clientX;
    const cap = capWidth();
    const v = Math.max(0, Math.min(cap, pullDx));
    peekRef.current = v;
    setPeekPx(v);
  };

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={onCameraFile}
      />
      {peekPx > 0 && (
        <>
          <div className="fixed inset-0 z-[75] flex justify-center pointer-events-none" aria-hidden>
            <div className="h-full w-full max-w-md bg-black/25" />
          </div>
          <div className="fixed inset-0 z-[76] flex justify-center pointer-events-none">
            <div className="relative h-full w-full max-w-md pointer-events-auto">
              <div
                className="absolute top-0 bottom-0 end-0 overflow-hidden border-s border-border bg-background shadow-xl"
                style={{ width: Math.round(Math.min(peekPx, capWidth())) }}
              >
                <div
                  className={
                    "flex h-full min-h-0 flex-col ms-auto " +
                    (isQuranPeek ? "bg-black text-white" : "bg-background text-foreground")
                  }
                  style={{ width: capWidth(), minWidth: capWidth() }}
                >
                  <div
                    className={
                      "flex shrink-0 items-center justify-between gap-2 border-b p-3 " +
                      (isQuranPeek ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-border bg-background")
                    }
                  >
                    <div className="shrink-0 p-2 opacity-60" aria-hidden>
                      <ChevronLeft size={22} />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2 text-start">
                      <Avatar name={displayName} src={avatarSrc} size={36} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 truncate text-sm font-semibold">
                          {c.isChannel && <Megaphone size={14} />}
                          {titlePeek}
                        </div>
                        {(c.isGroup || c.isChannel) && (
                          <div className={"truncate text-xs " + (isQuranPeek ? "text-zinc-400" : "text-muted-foreground")}>
                            {c.members.length} {t("members")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={"flex shrink-0 items-center gap-2 " + (isQuranPeek ? "text-zinc-300" : "text-muted-foreground")}>
                      {!isQuranPeek && !c.isChannel && (
                        <>
                          <Phone size={20} />
                          <Video size={20} />
                        </>
                      )}
                      {!c.isGroup && !c.isChannel && <MoreVertical size={20} />}
                      {(c.isGroup || c.isChannel) && <SettingsIcon size={20} />}
                    </div>
                  </div>

                  <div
                    ref={peekScrollRef}
                    className={
                      "min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain p-3 " +
                      (isQuranPeek ? "bg-zinc-950" : "")
                    }
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {peekMessages.length === 0 && (
                      <p className={"py-16 text-center text-sm opacity-70 " + (isQuranPeek ? "text-zinc-400" : "text-muted-foreground")}>لا رسائل</p>
                    )}
                    {peekMessages.map(m => {
                      const mine = m.senderId === me.id;
                      const sender = userById(state, m.senderId);
                      const bareSticker = m.type === "sticker" && (isStickerImageContent(m.content) || isStickerVideoContent(m.content));
                      const bareImage = m.type === "image" && m.content.startsWith("data:") && !m.viewOnce;
                      const bareViewOnceMedia =
                        (m.type === "image" || m.type === "video") && !!m.viewOnce && m.content.startsWith("data:");
                      const colClass =
                        bareImage ? "w-full max-w-[28rem]" : bareSticker || bareViewOnceMedia ? "max-w-[17.5rem]" : "max-w-[22rem]";
                      const bubbleClass =
                        bareSticker || bareImage || bareViewOnceMedia
                          ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible"
                          : "rounded-2xl px-3 py-2 text-sm " +
                            (isQuranPeek
                              ? mine
                                ? "bg-zinc-800 text-zinc-100"
                                : "bg-zinc-700 text-zinc-50"
                              : mine
                                ? "bg-primary/20 text-foreground"
                                : "bg-secondary");
                      return (
                        <div key={m.id} className={"flex " + (mine ? "justify-start" : "justify-end")}>
                          <div className={"flex flex-col gap-0.5 " + colClass + " " + (mine ? "items-start" : "items-end")}>
                            <div className={bubbleClass}>
                              {(c.isGroup || c.isChannel) && !mine && (
                                <div className={"mb-0.5 text-[10px] opacity-70 " + (isQuranPeek ? "text-zinc-300" : "")}>@{sender?.username}</div>
                              )}
                              <ChatPeekMessageBody m={m} isQuran={isQuranPeek} viewerId={me.id} bubbleMine={mine} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className={
                      "pointer-events-none flex shrink-0 items-center gap-2 border-t p-3 " +
                      (isQuranPeek ? "border-zinc-700 bg-zinc-900 text-zinc-200" : "border-border bg-background")
                    }
                  >
                    <Sticker size={22} />
                    <ImageIcon size={22} />
                    <Camera size={22} />
                    <Smile size={22} />
                    <div
                      className={
                        "flex-1 rounded-full px-3 py-2 text-start text-xs " +
                        (isQuranPeek ? "bg-zinc-800 text-zinc-400" : "bg-input text-muted-foreground")
                      }
                    >
                      {t("typeMessage")}
                    </div>
                    <Mic size={22} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="relative rounded-2xl overflow-visible">
        <div className="relative z-20 flex items-center gap-1 rounded-2xl bg-background">
          <div
            className="flex min-w-0 flex-1 items-stretch rounded-2xl hover:bg-secondary/80 touch-manipulation"
            title={t("chatRowLongPressHint")}
            onPointerDown={onAvatarPointerDown}
            onPointerMove={onAvatarPointerMove}
            onPointerUp={onAvatarPointerEnd}
            onPointerLeave={onAvatarPointerEnd}
            onPointerCancel={onAvatarPointerEnd}
          >
            <div
              className="relative flex shrink-0 cursor-pointer items-center justify-center rounded-s-2xl p-2 ps-3 outline-none"
              onClick={e => {
                e.stopPropagation();
                if (skipAvatarClickRef.current) return;
                onOpenChat(c.id);
              }}
            >
              <Avatar name={displayName} src={avatarSrc} />
              {hasUnread && <span className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 ring-2 ring-background" aria-hidden />}
            </div>
            <button
              type="button"
              onClick={() => {
                if (skipAvatarClickRef.current) return;
                onOpenChat(c.id);
              }}
              className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-3 pe-3 text-start outline-none"
            >
              <div className="font-semibold text-sm flex min-w-0 items-center gap-1">
                {c.isChannel && <Megaphone size={12} className="shrink-0" aria-hidden />}
                <span className="min-w-0 truncate">
                  {c.isGroup || c.isChannel ? c.name : "@" + (other?.username || "")}
                </span>
                {isListPinned && (
                  <span className="inline-flex shrink-0" title={t("pinnedBar")}>
                    <Pin size={12} className="fill-amber-400/35 text-amber-600 dark:text-amber-400" aria-hidden />
                  </span>
                )}
              </div>
              <div className={"text-xs truncate flex items-center gap-1.5 " + (hasUnread ? "text-foreground font-medium" : "text-muted-foreground")}>
                {hasUnread && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" aria-hidden />}
                <span className="truncate">{lastMessagePreview(last)}</span>
              </div>
            </button>
          </div>
          <button
            type="button"
            ref={cameraBtnRef}
            className="shrink-0 flex items-center justify-center rounded-xl border border-border/60 bg-secondary/50 hover:bg-secondary p-2.5 text-muted-foreground touch-manipulation select-none active:scale-[0.97]"
            aria-label="التقاط صورة بالكاميرا؛ اضغط مطوّلاً ثم اسحب لمعاينة المحادثة"
            style={{ touchAction: "none" }}
            onPointerDown={onCameraPointerDown}
            onPointerMove={onCameraPointerMove}
            onPointerUp={finishCameraGesture}
            onPointerCancel={finishCameraGesture}
          >
            <Camera size={20} />
          </button>
        </div>
      </div>

      {rowMenu && (
        <>
          <div className="fixed inset-0 z-[84] bg-black/25" aria-hidden onClick={() => setRowMenu(null)} />
          <div
            data-chat-row-menu
            role="menu"
            className="fixed z-[85] w-[min(calc(100vw-24px),240px)] overflow-hidden rounded-2xl border border-border bg-card py-1 text-sm shadow-2xl"
            style={{ left: rowMenu.x, top: rowMenu.y, transform: "translate(-50%, 4px)" }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-secondary"
              onClick={() => {
                toggleChatListPin(c.id);
                setRowMenu(null);
              }}
            >
              <Pin size={18} className={"shrink-0 " + (isListPinned ? "text-amber-500 fill-current" : "opacity-90")} />
              {isListPinned ? t("chatListUnpin") : t("chatListPin")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-secondary"
              onClick={() => {
                toggleChatMute(c.id);
                setRowMenu(null);
              }}
            >
              {isMuted ? <Bell size={18} className="shrink-0 opacity-90" /> : <BellOff size={18} className="shrink-0 opacity-90" />}
              {isMuted ? t("chatMenuUnmute") : t("chatMenuMute")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-start font-medium text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (typeof window !== "undefined" && window.confirm(t("chatMenuDeleteConfirm"))) deleteChat(c.id);
                setRowMenu(null);
              }}
            >
              <Trash2 size={18} className="shrink-0" />
              {t("chatMenuDelete")}
            </button>
          </div>
        </>
      )}

      {cameraDraft && (
        <ChatCameraComposeModal
          draft={cameraDraft}
          senderName={meUser?.username}
          senderAvatar={meUser?.avatar}
          onClose={() => setCameraDraft(null)}
          onSend={({ type, content, viewOnce }) => {
            const payload: Parameters<typeof sendMessage>[1] = {
              type,
              content,
              ...(viewOnce ? { viewOnce: true } : {}),
            };
            if (c.isGroup || c.isChannel) {
              sendMessage(c.id, payload);
              onOpenChat(c.id);
            } else if (otherId) {
              const ch = openOrCreateChat(otherId);
              if (!ch) {
                if (isGuest) notifyGuestActionBlocked();
                else window.alert("تعذّر فتح المحادثة.");
                setCameraDraft(null);
                return;
              }
              sendMessage(ch.id, payload);
              onOpenChat(ch.id);
            }
            setCameraDraft(null);
          }}
        />
      )}
    </>
  );
}

interface Props {
  onOpenProfile: (id: string) => void;
  initialChatId?: string | null;
  onConsumedInitialChat?: () => void;
  onThreadOpen?: (open: boolean) => void;
  onActiveChatChange?: (chatId: string | null) => void;
}

export function ChatScreen({ onOpenProfile, initialChatId, onConsumedInitialChat, onThreadOpen, onActiveChatChange }: Props) {
  const { state, currentUser, openOrCreateChat, setNote, sendMessage, isGuest } = useApp();
  const [profileNoteReply, setProfileNoteReply] = useState<{ userId: string; note: string } | null>(null);
  const t = useT();
  const me = currentUser!;
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [showCreate, setShowCreate] = useState<null | "menu" | "group" | "channel">(null);
  const [showCall, setShowCall] = useState<string | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [search, setSearch] = useState("");
  const [noteInput, setNoteInput] = useState(me.note || "");
  const [editingNote, setEditingNote] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [gameType, setGameType] = useState<"billiards" | "football">("billiards");
  useEffect(() => {
    if (!initialChatId) return;
    setOpenChat(initialChatId);
    onConsumedInitialChat?.();
  }, [initialChatId, onConsumedInitialChat]);

  useEffect(() => {
    onThreadOpen?.(!!openChat);
  }, [openChat, onThreadOpen]);
  useEffect(() => {
    onActiveChatChange?.(openChat);
  }, [openChat, onActiveChatChange]);

  const myChats = state.chats.filter(c => c.members.includes(me.id) && !c.request);
  const requests = state.chats.filter(c => c.members.includes(me.id) && c.request);
  const messageRequests = useMemo(
    () =>
      requests.filter(
        c => !c.isGroup && !c.isChannel && !c.messages.some(m => m.senderId === me.id),
      ),
    [requests, me.id],
  );

  // نوتك + نوتات من تتابعهم (وليس شرط تبادل متابعة)
  const noteUsers = [
    me,
    ...state.users.filter(
      u =>
        u.id !== me.id &&
        u.note &&
        me.following.includes(u.id) &&
        !me.blocked.includes(u.id) &&
        !u.blocked.includes(me.id),
    ),
  ];

  const filteredChats = myChats.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (c.isGroup) return (c.name || "").toLowerCase().includes(q);
    const otherId = c.members.find(id => id !== me.id);
    const other = otherId ? userById(state, otherId) : null;
    return other?.username.toLowerCase().includes(q);
  });

  /** المثبتة أولاً (حسب ترتيب التثبيت)، ثم الباقي بآخر نشاط رسالة (الأحدث فوق) */
  const sortedFilteredChats = useMemo(() => {
    const pins = me.pinnedChatIds || [];
    const lastActivityAt = (c: Chat) => {
      const vis = visibleChatMessages(c, me.id);
      const last = vis[vis.length - 1];
      return last?.createdAt ?? 0;
    };
    return [...filteredChats].sort((a, b) => {
      const ia = pins.indexOf(a.id);
      const ib = pins.indexOf(b.id);
      const aPin = ia >= 0;
      const bPin = ib >= 0;
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      if (aPin && bPin) return ia - ib;
      return lastActivityAt(b) - lastActivityAt(a);
    });
  }, [filteredChats, me.id, me.pinnedChatIds, state.chats]);

  if (showCall) return <CallScreen chatId={showCall} onClose={() => setShowCall(null)} />;
  if (openChat) {
    const chat = state.chats.find(c => c.id === openChat);
    if (!chat) { setOpenChat(null); return null; }
    if (showGroupSettings && (chat.isGroup || chat.isChannel)) return <GroupSettings chat={chat} onBack={() => setShowGroupSettings(false)} onOpenProfile={onOpenProfile} />;
    return <ChatRoom chat={chat} onBack={() => setOpenChat(null)} onCall={() => setShowCall(chat.id)} onOpenSettings={() => setShowGroupSettings(true)} onOpenProfile={onOpenProfile} />;
  }
  if (showRequests) return <RequestsList chats={messageRequests} onBack={() => setShowRequests(false)} onOpen={(id) => { setShowRequests(false); setOpenChat(id); }} onOpenProfile={onOpenProfile} />;
  if (showCreate === "group" || showCreate === "channel") return <CreateGroup mode={showCreate} onBack={() => setShowCreate(null)} onCreated={(id) => { setShowCreate(null); setOpenChat(id); }} />;

  return (
    <div className="p-4 space-y-4">
      {isGuest && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-950 dark:text-amber-100">
          وضع الزائر: يمكنك تصفّح القوائم فقط. سجّل الدخول من تبويب «أنا» لإرسال رسائل أو فتح محادثات.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t("chat")}</h2>
        <div className="flex items-center gap-2">
          <button type="button" disabled={isGuest} onClick={() => !isGuest && setShowGames(true)} className="flex items-center gap-1 text-sm bg-secondary px-3 py-1.5 rounded-full disabled:opacity-40">
            🎮
          </button>
          <button type="button" disabled={isGuest} onClick={() => !isGuest && setShowCreate("menu")} className="flex items-center gap-1 text-sm bg-secondary px-3 py-1.5 rounded-full disabled:opacity-40">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-input rounded-full px-4 py-2">
        <Search size={16} className="text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="flex-1 bg-transparent outline-none text-sm" />
      </div>

      {/* شريط النوتات ثم طلبات الرسائل تحته */}
      <div className="flex w-full flex-col gap-2">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 w-full">
          {noteUsers.map((u: any) => {
            const isMine = u.id === me.id;
            return (
              <div key={u.id} className="shrink-0 flex flex-col items-center gap-1">
                {u.note ? (
                  isMine ? (
                    <button
                      type="button"
                      onClick={() => setEditingNote(true)}
                      className="text-[10px] bg-secondary rounded-2xl px-2 py-1 max-w-28 truncate font-ios-emoji text-start hover:bg-secondary/80"
                    >
                      {u.note}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setProfileNoteReply({ userId: u.id, note: u.note })}
                      className="text-[10px] bg-secondary rounded-2xl px-2 py-1 max-w-28 truncate font-ios-emoji text-start hover:bg-secondary/80 active:scale-[0.98]"
                      title="رد على النوت"
                    >
                      {u.note}
                    </button>
                  )
                ) : (
                  isMine && (
                    <button onClick={() => setEditingNote(true)} className="text-[10px] bg-primary/20 text-primary rounded-2xl px-2 py-1">
                      {t("addNote")}
                    </button>
                  )
                )}
                <button type="button" onClick={() => isMine ? setEditingNote(true) : startTransition(() => onOpenProfile(u.id))}>
                  <Avatar name={u.username} src={u.avatar} size={56} />
                </button>
                <span className="text-xs">{isMine ? "أنت" : u.username}</span>
              </div>
            );
          })}
        </div>
        <div className="flex w-full justify-start rtl:justify-end">
          <button
            type="button"
            onClick={() => setShowRequests(true)}
            className="inline-flex max-w-[calc(100%-0.5rem)] shrink-0 items-center gap-1.5 rounded-full border border-border bg-secondary/80 py-1 pe-2.5 ps-1.5 text-[11px] font-semibold touch-manipulation hover:bg-secondary active:scale-[0.98]"
            title={t("requests")}
            aria-label={t("requests")}
          >
            <span className="relative inline-flex shrink-0 rounded-full p-0.5">
              <Mail className="text-sky-600 dark:text-sky-400" size={14} strokeWidth={2} />
              {messageRequests.length > 0 && (
                <span className="absolute -top-0.5 -end-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold leading-none text-destructive-foreground">
                  {messageRequests.length > 9 ? "9+" : messageRequests.length}
                </span>
              )}
            </span>
            <span className="truncate">{t("requests")}</span>
          </button>
        </div>
      </div>

      {editingNote && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingNote(false)}>
          <div className="bg-background rounded-3xl p-4 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-center">{t("addNote")}</h3>
            <input value={noteInput} onChange={e => setNoteInput(e.target.value)} maxLength={60} placeholder="..." className="w-full bg-input rounded-2xl px-4 py-3 outline-none text-center font-ios-emoji" />
            <button onClick={() => { setNote(noteInput); setEditingNote(false); }} className="w-full bg-primary text-primary-foreground py-2 rounded-2xl font-semibold">{t("save")}</button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {sortedFilteredChats.map(c => (
          <ChatListRowWithPeek key={c.id} chat={c} me={me} onOpenChat={setOpenChat} />
        ))}
        {sortedFilteredChats.length === 0 && <p className="text-center text-muted-foreground py-6">{t("noChats")}</p>}
      </div>

      {showCreate === "menu" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowCreate(null)}>
          <div className="bg-background w-full rounded-t-3xl p-4 max-w-md mx-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate("group")} className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl"><Users /> {t("newGroup")}</button>
            <button onClick={() => setShowCreate("channel")} className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl"><Megaphone /> {t("newChannel")}</button>
          </div>
        </div>
      )}
      {profileNoteReply && (
        <ProfileNoteReplySheet
          target={profileNoteReply}
          onClose={() => setProfileNoteReply(null)}
          onSent={chatId => {
            setProfileNoteReply(null);
            setOpenChat(chatId);
          }}
        />
      )}

      {showGames && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowGames(false)}>
          <div className="bg-background w-full rounded-t-3xl p-4 max-w-md mx-auto max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-center mb-3">دعوة لعبة</h3>
            <div className="flex gap-2 mb-3">
              <button className={"flex-1 py-2 rounded-2xl " + (gameType === "billiards" ? "bg-primary text-primary-foreground" : "bg-secondary")} onClick={() => setGameType("billiards")}>🎱 بلياردو</button>
              <button className={"flex-1 py-2 rounded-2xl " + (gameType === "football" ? "bg-primary text-primary-foreground" : "bg-secondary")} onClick={() => setGameType("football")}>⚽ كرة</button>
            </div>
            <div className="space-y-1">
              {state.users.filter(u => u.id !== me.id).map(u => (
                <button
                  key={u.id}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-secondary text-start"
                  onClick={() => {
                    const ch = openOrCreateChat(u.id);
                    if (!ch) {
                      if (isGuest) notifyGuestActionBlocked();
                      else window.alert("تعذّر فتح المحادثة.");
                      return;
                    }
                    const label = gameType === "billiards" ? "🎱 بلياردو" : "⚽ كرة";
                    sendMessage(ch.id, { type: "text", content: `دعوة لعبة ${label}\nاضغط للبدء: /game/${gameType}?host=${me.id}` });
                    setShowGames(false);
                    setOpenChat(ch.id);
                  }}
                >
                  <span className="font-semibold">@{u.username}</span>
                  <span className="text-xs text-muted-foreground">إرسال دعوة</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground text-center mt-3">نسخة أولية: ترسل دعوة داخل الشات، وسيتم تطوير اللعب اللحظي كاملًا لاحقًا.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestsList({
  chats,
  onBack,
  onOpen,
  onOpenProfile,
}: {
  chats: Chat[];
  onBack: () => void;
  onOpen: (id: string) => void;
  onOpenProfile: (id: string) => void;
}) {
  const { state, currentUser, acceptRequest, deleteChat } = useApp();
  const t = useT();
  const me = currentUser!;
  const [detail, setDetail] = useState<{ chatId: string; messageId: string } | null>(null);

  const resolvedDetail = useMemo(() => {
    if (!detail) return null;
    const c = state.chats.find(x => x.id === detail.chatId);
    if (!c) return null;
    const vis = visibleChatMessages(c, me.id);
    const msg = vis.find(m => m.id === detail.messageId);
    if (!msg) return null;
    return { chat: c, msg };
  }, [detail, state.chats, me.id]);

  useEffect(() => {
    if (detail && !resolvedDetail) setDetail(null);
  }, [detail, resolvedDetail]);

  return (
    <div className="flex min-h-[50vh] flex-col p-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={onBack} className="rounded-full p-2 hover:bg-secondary" aria-label={t("close")}>
          <ArrowRight />
        </button>
        <h2 className="font-bold">{t("requests")}</h2>
      </div>
      {chats.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("noChats")}</p>}
      <div className="space-y-1">
        {chats.map(c => {
          const otherId = c.members.find(id => id !== me.id)!;
          const other = userById(state, otherId);
          const vis = visibleChatMessages(c, me.id);
          const last = vis[vis.length - 1];
          return (
            <div key={c.id} className="rounded-2xl border border-border bg-card/40 p-3">
              <button
                type="button"
                className="flex w-full items-center gap-3 text-start touch-manipulation rounded-xl py-1 hover:bg-secondary/50"
                onClick={() => startTransition(() => onOpenProfile(otherId))}
              >
                <Avatar name={other?.username || "?"} src={other?.avatar} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">@{other?.username || "?"}</div>
                  <div className="truncate text-xs text-muted-foreground">{other?.bio?.trim() ? other.bio : t("message")}</div>
                </div>
              </button>
              {last && (
                <button
                  type="button"
                  className="mt-2 w-full rounded-2xl bg-secondary/80 px-3 py-2.5 text-start text-sm hover:bg-secondary"
                  onClick={() => setDetail({ chatId: c.id, messageId: last.id })}
                >
                  <span className="text-muted-foreground text-xs">{t("msgRequestOpenMessage")}</span>
                  <div className="mt-0.5 truncate font-medium">{lastMessagePreview(last)}</div>
                </button>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    acceptRequest(c.id);
                    onOpen(c.id);
                  }}
                  className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
                >
                  {t("msgRequestAcceptOpen")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteChat(c.id);
                    if (detail?.chatId === c.id) setDetail(null);
                  }}
                  className="flex-1 rounded-full bg-secondary py-2 text-sm font-semibold text-destructive"
                >
                  {t("msgRequestDecline")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {resolvedDetail && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-modal
            className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-background shadow-xl sm:rounded-3xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="font-semibold">{t("msgRequestOpenMessage")}</p>
              <button type="button" className="rounded-full p-2 hover:bg-secondary" onClick={() => setDetail(null)} aria-label={t("close")}>
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[min(50vh,420px)] overflow-y-auto p-4">
              <div
                className={
                  "inline-block max-w-full rounded-2xl px-3 py-2 text-sm " +
                  (resolvedDetail.msg.senderId === me.id ? "bg-primary/20 text-foreground" : "bg-secondary")
                }
              >
                <ChatPeekMessageBody
                  m={resolvedDetail.msg}
                  isQuran={resolvedDetail.chat.id === QURAN_CHANNEL_ID}
                  viewerId={me.id}
                  bubbleMine={resolvedDetail.msg.senderId === me.id}
                />
              </div>
            </div>
            <div className="flex gap-2 border-t border-border p-4">
              <button
                type="button"
                className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                onClick={() => {
                  acceptRequest(resolvedDetail.chat.id);
                  setDetail(null);
                  onOpen(resolvedDetail.chat.id);
                }}
              >
                {t("msgRequestAcceptOpen")}
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-secondary py-2.5 text-sm font-semibold text-destructive"
                onClick={() => {
                  deleteChat(resolvedDetail.chat.id);
                  setDetail(null);
                }}
              >
                {t("msgRequestDecline")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateGroup({ mode, onBack, onCreated }: { mode: "group" | "channel"; onBack: () => void; onCreated: (id: string) => void }) {
  const { state, currentUser, createGroup, createChannel } = useApp();
  const t = useT();
  const me = currentUser!;
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(mode === "channel" ? "📢" : "👥");
  const [selected, setSelected] = useState<string[]>([]);
  const others = state.users.filter(u => u.id !== me.id && !me.blocked.includes(u.id));

  const create = () => {
    if (mode === "group" && selected.length < 2) { alert("اختر شخصين على الأقل"); return; }
    const c = mode === "group" ? createGroup(name || "مجموعة", avatar, selected) : createChannel(name || "قناة", avatar, selected);
    if (c) onCreated(c.id);
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4"><button onClick={onBack}><ArrowRight /></button><h2 className="font-bold">{mode === "group" ? t("newGroup") : t("newChannel")}</h2></div>
      {step === 1 ? (
        <div className="space-y-3">
          <div className="flex justify-center">
            <select value={avatar} onChange={e => setAvatar(e.target.value)} className="text-5xl bg-secondary rounded-full w-24 h-24 text-center">
              {(mode === "channel" ? ["📢","📰","📚","🕌","⭐","🎙️"] : ["👥","🎉","🚀","💬","🌟","❤️","🔥","🎨"]).map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={mode === "group" ? t("groupName") : t("channelName")} className="w-full bg-input rounded-2xl px-4 py-3 outline-none" />
          <button onClick={() => { if (!name.trim()) return alert("اكتب اسم"); setStep(2); }} className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-semibold">{t("next")}</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{mode === "group" ? t("addMembers") : "اختر الأعضاء (اختياري)"}</p>
          {others.map(u => (
            <button key={u.id} onClick={() => setSelected(s => s.includes(u.id) ? s.filter(x => x !== u.id) : [...s, u.id])} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-secondary">
              <Avatar name={u.username} src={u.avatar} />
              <div className="flex-1 text-start">@{u.username}</div>
              {selected.includes(u.id) && <Check className="text-primary" />}
            </button>
          ))}
          <button onClick={create} className="w-full bg-primary text-primary-foreground py-3 rounded-2xl font-semibold mt-3">{t("create_")} ({selected.length})</button>
        </div>
      )}
    </div>
  );
}

function ChatRoom({ chat, onBack, onCall, onOpenSettings, onOpenProfile }: { chat: Chat; onBack: () => void; onCall: () => void; onOpenSettings: () => void; onOpenProfile: (id: string) => void }) {
  const {
    state,
    currentUser,
    sendMessage,
    markViewOnceOpened,
    markChatOpened,
    markChatRead,
    joinChannel,
    hideMessageForMe,
    addMessageReaction,
    pinChatMessage,
    unpinChatMessage,
    addFavoriteStickerContent,
    addCreatedStickerContent,
  } = useApp();
  const t = useT();
  const me = currentUser!;
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [theme, setTheme] = useState<"default" | "blue" | "pink">("default");
  const [recording, setRecording] = useState(false);
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [hideReadStatus, setHideReadStatus] = useState(false);
  const [hideTypingStatus, setHideTypingStatus] = useState(false);
  const [isTyping] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const otherId = chat.isGroup || chat.isChannel ? null : chat.members.find(id => id !== me.id);
  const other = otherId ? userById(state, otherId) : null;
  const title = chat.isGroup || chat.isChannel ? chat.name : "@" + (other?.username || "");
  const isMember = chat.members.includes(me.id);
  const canPost = !chat.isChannel || (chat.hosts || []).includes(me.id);
  const visibleMessages = useMemo(() => visibleChatMessages(chat, me.id), [chat.messages, chat.hiddenMessageIdsByUser, me.id]);
  const [messageContext, setMessageContext] = useState<Message | null>(null);
  const [moreReactionEmoji, setMoreReactionEmoji] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [cameraCompose, setCameraCompose] = useState<CameraComposeDraft | null>(null);
  const [viewOnceOverlay, setViewOnceOverlay] = useState<Message | null>(null);
  const [shareFeedOpen, setShareFeedOpen] = useState<null | { items: ChatShareFeedItem[]; initialIndex: number }>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const cameraCaptureRef = useRef<HTMLInputElement>(null);
  const messageElRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const lpTimerRef = useRef<number | null>(null);
  const lpStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressStartRef = useRef<{ x: number; y: number; mid: string } | null>(null);
  const longPressActivatedRef = useRef(false);

  const scrollToMessageId = useCallback((id: string) => {
    setMoreReactionEmoji(false);
    setMessageContext(null);
    const el = messageElRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const openShareFeedFromMessage = useCallback(
    (m: Message) => {
      const chain = visibleMessages.filter(x => x.type === "shared_post" || x.type === "shared_story");
      const idx = chain.findIndex(x => x.id === m.id);
      if (idx < 0) return;
      const items: ChatShareFeedItem[] = chain.map(x => ({
        messageId: x.id,
        kind: x.type === "shared_story" ? "story" : "post",
        targetId: x.content,
        shareText: x.shareText,
      }));
      setShareFeedOpen({ items, initialIndex: idx });
    },
    [visibleMessages],
  );

  const clearLongPress = useCallback(() => {
    if (lpTimerRef.current != null) {
      window.clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
    lpStartRef.current = null;
  }, []);

  const onMsgPointerDown = useCallback(
    (e: React.PointerEvent, m: Message) => {
      if (messageContext || forwardingMessage || e.button !== 0) return;
      longPressActivatedRef.current = false;
      pressStartRef.current = { x: e.clientX, y: e.clientY, mid: m.id };
      lpStartRef.current = { x: e.clientX, y: e.clientY };
      lpTimerRef.current = window.setTimeout(() => {
        lpTimerRef.current = null;
        lpStartRef.current = null;
        longPressActivatedRef.current = true;
        setMessageContext(m);
        try {
          (navigator as unknown as { vibrate?: (p: number | number[]) => void }).vibrate?.(15);
        } catch {
          /* ignore */
        }
      }, 480);
    },
    [messageContext, forwardingMessage],
  );

  const onMsgPointerMove = useCallback((e: React.PointerEvent) => {
    const s = lpStartRef.current;
    if (!s || !lpTimerRef.current) return;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 14) {
      window.clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
      lpStartRef.current = null;
      pressStartRef.current = null;
    }
  }, []);

  const onMsgPointerUp = useCallback(
    (e: React.PointerEvent, m: Message) => {
      clearLongPress();
      if (longPressActivatedRef.current) {
        longPressActivatedRef.current = false;
        pressStartRef.current = null;
        return;
      }
      const st = pressStartRef.current;
      pressStartRef.current = null;
      if (!st || st.mid !== m.id) return;
      const dx = e.clientX - st.x;
      const dy = e.clientY - st.y;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) {
        const mine = m.senderId === me.id;
        if (mine && dx < -44) startTransition(() => setReplyingTo(m));
        else if (!mine && dx > 44) startTransition(() => setReplyingTo(m));
      }
    },
    [clearLongPress, me.id],
  );

  useEffect(() => {
    if (chat.isGroup || chat.isChannel) return;
    markChatOpened(chat.id);
  }, [chat.id, chat.isGroup, chat.isChannel, markChatOpened]);

  useEffect(() => {
    markChatRead(chat.id);
  }, [chat.id, chat.messages.length, markChatRead]);

  useEffect(() => {
    setMoreReactionEmoji(false);
  }, [messageContext?.id]);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const run = () => {
      el.scrollTop = el.scrollHeight;
    };
    run();
    const id = requestAnimationFrame(run);
    const t = window.setTimeout(run, 180);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [chat.id]);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || messageContext) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 100) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, messageContext]);

  // NOTE: Disable fake typing indicator; only real-time typing should appear.

  const isQuranChannel = chat.id === QURAN_CHANNEL_ID;
  const themeBg = isQuranChannel
    ? "bg-black text-white"
    : theme === "blue" ? "bg-blue-50 dark:bg-blue-950" : theme === "pink" ? "bg-pink-50 dark:bg-pink-950" : "bg-background";

  const onFile = (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => sendMessage(chat.id, { type, content: String(r.result) });
    r.readAsDataURL(f);
  };

  const startRecording = async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      window.alert("التسجيل الصوتي غير متاح في هذا المتصفّح.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      window.alert("المتصفّح لا يدعم تسجيل الصوت. جرّب متصفّحاً محدّثاً أو حدّث النظام.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeCandidates = [
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ];
      const mime = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m));
      let rec: MediaRecorder;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        rec = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        if (blob.size < 64) {
          window.alert("التسجيل قصير جداً أو فارغ — اضغط الميكروفون ثم «إيقاف» بعد ثانية على الأقل.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          sendMessage(chat.id, {
            type: "voice",
            content: String(reader.result),
            durationSec: Math.max(1, Math.round((Date.now() - (recordStartRef.current || Date.now())) / 1000)),
          });
        reader.readAsDataURL(blob);
      };
      try {
        rec.start(250);
      } catch {
        rec.start();
      }
      recRef.current = rec;
      setRecording(true);
      recordStartRef.current = Date.now();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const low = msg.toLowerCase();
      window.alert(
        low.includes("notallowed") || low.includes("permission") || low.includes("denied")
          ? "يُرفض الميكروفون — من إعدادات المتصفّح أو التطبيق اسمح بالميكروفون لهذا الموقع ثم أعد المحاولة."
          : "لم يُسمح بالميكروفون أو تعذّر التسجيل.",
      );
    }
  };
  const stopRecording = () => {
    const rec = recRef.current;
    if (rec && rec.state === "recording") {
      try {
        rec.requestData();
      } catch {
        /* ignore */
      }
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recRef.current = null;
    setRecording(false);
    recordStartRef.current = 0;
  };

  const renderText = (txt: string) => {
    const capped = txt.length > 8000 ? txt.slice(0, 8000) + "…" : txt;
    return renderMentionHashtagNodes(capped, {
      renderMention: (uname, key) => {
        const u = state.users.find((x) => x.username === uname);
        if (u) {
          return (
            <button
              key={key}
              type="button"
              onClick={() => startTransition(() => onOpenProfile(u.id))}
              className="text-primary underline"
            >
              <AtSign size={12} className="inline" />
              {uname}
            </button>
          );
        }
        return <span key={key}>@{uname}</span>;
      },
      renderHashtag: (h, key) => (
        <span key={key} className="text-primary">
          {h}
        </span>
      ),
    });
  };

  const renderBubbleContent = (m: Message, mine: boolean) => {
    const sender = userById(state, m.senderId);
    return (
      <>
        {m.forwardedFrom && (
          <div
            className={
              "mb-1.5 pb-1 text-[10px] font-medium " +
              (isQuranChannel ? "text-zinc-300" : "text-muted-foreground")
            }
          >
            ↩ <span className="font-semibold">{t("msgForwardedFrom")}</span>{" "}
            <span className="opacity-95">{m.forwardedFrom.sourceChatLabel}</span>
          </div>
        )}
        {(chat.isGroup || chat.isChannel) && !mine && <div className="text-[10px] opacity-70 mb-0.5">@{sender?.username}</div>}
        {m.replyTo && (
          <div className={"text-[10px] mb-1 ps-2 opacity-90 line-clamp-2 " + (mine ? "text-primary-foreground/90" : "text-foreground/80")}>
            {m.replyTo.type === "text"
              ? truncateText(m.replyTo.content, 120)
              : m.replyTo.type === "sticker" && isStickerImageContent(m.replyTo.content)
                ? "[ملصق]"
                : truncateText(m.replyTo.content || `[${m.replyTo.type}]`, 80)}
          </div>
        )}
        {m.type === "text" && (
          <span dir="auto" className="break-words [word-break:normal]">
            {renderText(m.content)}
          </span>
        )}
        {m.type === "shared_post" && (
          <button
            type="button"
            className="m-0 max-w-[min(96vw,360px)] border-0 bg-transparent p-0 text-start outline-none ring-0"
            onClick={e => {
              e.stopPropagation();
              openShareFeedFromMessage(m);
            }}
          >
            {m.shareText && <span className="mb-1 block whitespace-pre-wrap text-xs opacity-90">{m.shareText}</span>}
            <SharedPostPreview postId={m.content} variant="chat" />
          </button>
        )}
        {m.type === "shared_story" && (
          <button
            type="button"
            className="m-0 max-w-[min(96vw,360px)] border-0 bg-transparent p-0 text-start outline-none ring-0"
            onClick={e => {
              e.stopPropagation();
              openShareFeedFromMessage(m);
            }}
          >
            {m.shareText && <span className="mb-1 block whitespace-pre-wrap text-xs opacity-90">{m.shareText}</span>}
            <SharedStoryChatPreview storyId={m.content} />
          </button>
        )}
        {m.type === "voice" && m.content.startsWith("data:") && (
          <InlineVoicePlayer src={m.content} durationSec={m.durationSec} isQuran={isQuranChannel} />
        )}
        {m.type === "voice" && !m.content.startsWith("data:") && (
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎙️</span>
            <span>{m.content}</span>
          </div>
        )}
        {m.type === "sticker" && isStickerImageContent(m.content) && (
          <img
            src={m.content}
            alt=""
            className="block w-auto h-auto max-w-[min(88vw,240px)] max-h-[min(42vh,260px)] object-contain align-middle rounded-none border-0 bg-transparent outline-none ring-0"
            loading="lazy"
            decoding="async"
          />
        )}
        {m.type === "sticker" && isStickerVideoContent(m.content) && (
          <video
            src={m.content}
            className="block w-auto h-auto max-w-[min(88vw,240px)] max-h-[min(42vh,260px)] object-contain align-middle rounded-none border-0 bg-transparent outline-none ring-0"
            autoPlay
            loop
            muted
            playsInline
            controls={false}
            preload="metadata"
          />
        )}
        {m.type === "sticker" && !isStickerImageContent(m.content) && !isStickerVideoContent(m.content) && (
          <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-[18px] bg-secondary/40 text-2xl leading-none select-none" title="ملصق">
            {m.content}
          </span>
        )}
        {m.type === "image" && m.viewOnce && (
          viewOnceOpenedForViewer(m, me.id) ? (
            <div className={viewOncePillDoneClass(mine, isQuranChannel)}>صورة · تمت المشاهدة</div>
          ) : (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setViewOnceOverlay(m);
              }}
              className={viewOncePillActiveClass(mine, isQuranChannel)}
            >
              <Play size={12} className="shrink-0 fill-current opacity-90" />
              صورة
            </button>
          )
        )}
        {m.type === "image" && !m.viewOnce && (
          <img src={m.content} alt="" className="block w-full max-h-[min(78vh,720px)] border-0 object-cover align-middle outline-none ring-0 rounded-none" />
        )}
        {m.type === "video" && m.viewOnce && (
          viewOnceOpenedForViewer(m, me.id) ? (
            <div className={viewOncePillDoneClass(mine, isQuranChannel)}>فيديو · تمت المشاهدة</div>
          ) : (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setViewOnceOverlay(m);
              }}
              className={viewOncePillActiveClass(mine, isQuranChannel)}
            >
              <Play size={12} className="shrink-0 fill-current opacity-90" />
              فيديو
            </button>
          )
        )}
        {m.type === "video" && !m.viewOnce && (
          <div className="flex flex-col gap-2">
            <video src={m.content} controls className="max-h-[min(78vh,720px)] w-full border-0 object-cover outline-none ring-0 rounded-none" preload="metadata" />
            <div className="text-[10px] opacity-70 flex items-center gap-1">
              <span>🎬 فيديو</span>
            </div>
          </div>
        )}
      </>
    );
  };

  const replyPreview = (m: Message) => {
    if (m.type === "text") return truncateText(m.content, 100);
    if (m.type === "sticker") return (isStickerImageContent(m.content) || isStickerVideoContent(m.content)) ? "[ملصق]" : truncateText(m.content, 40);
    if (m.type === "image" && m.viewOnce) return "[صورة مرة واحدة]";
    if (m.type === "video" && m.viewOnce) return "[فيديو مرة واحدة]";
    if (m.type === "image") return "[صورة]";
    if (m.type === "video") return "[فيديو]";
    if (m.type === "voice") return "[صوت]";
    if (m.type === "shared_post") return "[منشور]";
    if (m.type === "shared_story") return "[ستوري]";
    return `[${m.type}]`;
  };

  const pickSticker = useCallback(
    (content: string, meta?: { createdFromImage?: boolean }) => {
      sendMessage(chat.id, { type: "sticker", content });
      if (meta?.createdFromImage) addCreatedStickerContent(content);
      setShowStickers(false);
    },
    [chat.id, sendMessage, addCreatedStickerContent],
  );

  const toggleStickerPanel = useCallback(() => {
    startTransition(() => setShowStickers(s => !s));
  }, []);

  let seenFooter: string | null = null;
  if (!chat.isGroup && !chat.isChannel && otherId) {
    const otherLastOpen = chat.lastOpenAtByUser?.[otherId] ?? 0;
    const myOutgoing = visibleMessages.filter(m => m.senderId === me.id);
    const lastMine = myOutgoing[myOutgoing.length - 1];
    if (lastMine && otherLastOpen >= lastMine.createdAt) {
      const otherRepliedAfter = visibleMessages.some(m => m.senderId === otherId && m.createdAt >= lastMine.createdAt);
      const lang = state.language;
      if (!otherRepliedAfter) {
        const mins = Math.max(0, Math.floor((Date.now() - otherLastOpen) / 60000));
        seenFooter = mins === 0
          ? (lang === "en" ? "Seen" : "تمت القراءة")
          : (lang === "en" ? `Seen · ${mins}m` : `تمت القراءة · منذ ${mins} د`);
      } else {
        seenFooter = lang === "en" ? "Seen" : "تمت القراءة";
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[200] box-border flex justify-center overflow-hidden bg-background pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <div
        className={
          "relative flex h-full max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden " + themeBg
        }
      >
      <div className={"flex items-center justify-between p-3 border-b border-border " + (isQuranChannel ? "bg-zinc-900 text-zinc-100 border-zinc-700" : "bg-background")}>
        {/* Left side - Back button */}
        <button type="button" onClick={onBack} className="p-2 rounded-full hover:bg-secondary" aria-label="رجوع">
          <ChevronLeft size={22} />
        </button>
        
        {/* Center - User info */}
        <button type="button" onClick={() => (chat.isGroup || chat.isChannel) ? onOpenSettings() : (otherId && startTransition(() => onOpenProfile(otherId)))} className="flex items-center gap-2 flex-1 min-w-0 text-start justify-start me-2">
          <Avatar name={chat.isGroup ? chat.name! : other?.username || "?"} src={chat.isGroup ? chat.avatar : other?.avatar} size={36} />
          <div className="min-w-0">
            <div className="font-semibold text-sm flex items-center gap-1 truncate">{chat.isChannel && <Megaphone size={14} />}{title}</div>
            {isTyping && !hideTypingStatus && !chat.isGroup && !chat.isChannel && (
              <div className="text-xs text-blue-500 font-medium">يكتب...</div>
            )}
            {(chat.isGroup || chat.isChannel) && <div className={"text-xs " + (isQuranChannel ? "text-zinc-400" : "text-muted-foreground")}>{chat.members.length} {t("members")}</div>}
          </div>
        </button>
        
        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {!isQuranChannel && !chat.isChannel && (
            <>
              <button type="button" onClick={onCall}><Phone size={20} /></button>
              <button type="button" onClick={onCall}><Video size={20} /></button>
            </>
          )}
          {!chat.isGroup && !chat.isChannel && (
            <div className="relative">
              <button type="button" onClick={() => setShowPrivacyMenu(!showPrivacyMenu)} className="p-1 rounded-full hover:bg-secondary">
                <MoreVertical size={20} />
              </button>
              {showPrivacyMenu && (
                <div className="absolute left-0 top-8 bg-background border border-border rounded-lg shadow-lg w-48 z-50">
                  <button 
                    onClick={() => { setHideReadStatus(!hideReadStatus); setShowPrivacyMenu(false); }}
                    className="w-full text-right px-4 py-3 hover:bg-secondary flex items-center justify-between"
                  >
                    <span>إخفاء حالة القراءة</span>
                    {hideReadStatus && <Check size={16} />}
                  </button>
                  <button 
                    onClick={() => { setHideTypingStatus(!hideTypingStatus); setShowPrivacyMenu(false); }}
                    className="w-full text-right px-4 py-3 hover:bg-secondary flex items-center justify-between"
                  >
                    <span>إخفاء حالة الكتابة</span>
                    {hideTypingStatus && <Check size={16} />}
                  </button>
                </div>
              )}
            </div>
          )}
          {(chat.isGroup || chat.isChannel) && <button type="button" onClick={onOpenSettings}><SettingsIcon size={20} /></button>}
          {!isQuranChannel && !chat.isGroup && !chat.isChannel && (
            <select value={theme} onChange={e => setTheme(e.target.value as any)} className="text-xs bg-secondary rounded-full px-2 py-1">
              <option value="default">ثيم</option><option value="blue">أزرق</option><option value="pink">وردي</option>
            </select>
          )}
        </div>
      </div>

      {(chat.pinnedMessageIds || []).some(mid => chat.messages.some(x => x.id === mid)) && (
        <div
          className={
            "no-scrollbar flex shrink-0 flex-nowrap gap-2 overflow-x-scroll overflow-y-hidden overscroll-x-contain border-b px-2 py-1.5 touch-pan-x [-webkit-overflow-scrolling:touch] snap-x snap-mandatory " +
            (isQuranChannel ? "border-zinc-700 bg-zinc-900/95" : "border-border bg-muted/45")
          }
        >
          {(chat.pinnedMessageIds || [])
            .filter(mid => chat.messages.some(x => x.id === mid))
            .map(mid => {
              const pm = chat.messages.find(x => x.id === mid)!;
              return (
                <button
                  key={mid}
                  type="button"
                  onClick={() => scrollToMessageId(mid)}
                  className={
                    "flex max-w-[200px] min-w-[118px] shrink-0 snap-start items-center gap-2 rounded-xl border px-2.5 py-1.5 text-start text-xs " +
                    (isQuranChannel ? "border-zinc-600 bg-zinc-800/80 text-zinc-100" : "border-border bg-background/90")
                  }
                >
                  <Pin size={14} className="shrink-0 opacity-90" />
                  <span className="min-w-0 flex-1 truncate font-medium">{replyPreview(pm)}</span>
                </button>
              );
            })}
        </div>
      )}

      {chat.isChannel && !isMember && (
        <div className={"px-3 py-3 border-b border-border flex items-center gap-2 shrink-0 " + (isQuranChannel ? "bg-zinc-900 text-zinc-100 border-zinc-700" : "bg-muted/50")}>
          <p className="text-sm flex-1">انضم للقناة للمتابعة والتفاعل</p>
          <button
            type="button"
            onClick={() => joinChannel(chat.id)}
            className="shrink-0 bg-primary text-primary-foreground px-4 py-2 rounded-2xl text-sm font-semibold"
          >
            انضمام
          </button>
        </div>
      )}

      <div
          ref={messagesScrollRef}
          className={"min-h-0 flex-1 overflow-y-auto p-3 space-y-2 " + (isQuranChannel ? "bg-zinc-950" : "")}
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
        {visibleMessages.map(m => {
          const mine = m.senderId === me.id;
          const bareSticker = m.type === "sticker" && (isStickerImageContent(m.content) || isStickerVideoContent(m.content));
          const bareImage = m.type === "image" && m.content.startsWith("data:") && !m.viewOnce;
          const bareViewOnceMedia =
            (m.type === "image" || m.type === "video") && !!m.viewOnce && m.content.startsWith("data:");
          const colClass = bareImage ? "max-w-[min(96vw,560px)] w-full" : bareSticker || bareViewOnceMedia ? "max-w-[min(90vw,280px)]" : "max-w-[78%]";
          const bubbleClass =
            bareSticker || bareImage || bareViewOnceMedia
              ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible"
              : "rounded-2xl px-3 py-2 text-sm " +
                (isQuranChannel
                  ? mine
                    ? "bg-zinc-800 text-zinc-100"
                    : "bg-zinc-700 text-zinc-50"
                  : mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary");
          return (
            <div
              key={m.id}
              className={"flex touch-pan-y " + (mine ? "justify-start" : "justify-end")}
              onPointerDown={e => onMsgPointerDown(e, m)}
              onPointerMove={onMsgPointerMove}
              onPointerUp={e => onMsgPointerUp(e, m)}
              onPointerCancel={e => onMsgPointerUp(e, m)}
              onContextMenu={e => e.preventDefault()}
            >
              <div
                ref={el => {
                  if (el) messageElRefs.current.set(m.id, el);
                  else messageElRefs.current.delete(m.id);
                }}
                className={"relative flex flex-col gap-0.5 " + colClass + " " + (mine ? "items-start" : "items-end")}
              >
                <div className={bubbleClass}>{renderBubbleContent(m, mine)}</div>
                {m.reactions && m.reactions.length > 0 && (
                  <div
                    className={
                      "-mt-2 z-[1] flex flex-wrap items-center gap-0.5 " + (mine ? "self-start ps-1" : "self-end pe-1")
                    }
                  >
                    {aggregateReactions(m.reactions).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className={
                          "inline-flex items-center gap-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-sm dark:bg-white/10 " +
                          (isQuranChannel
                            ? "text-zinc-100"
                            : "text-foreground")
                        }
                      >
                        <span className="leading-none">{emoji}</span>
                        {count > 1 && <span className="text-[10px] font-semibold opacity-75">{count}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {seenFooter && (
          <div className={"text-end text-[11px] px-1 pt-1 " + (isQuranChannel ? "text-zinc-500" : "text-muted-foreground")}>{seenFooter}</div>
        )}
      </div>

      {messageContext &&
        (() => {
          const m = messageContext;
          const mine = m.senderId === me.id;
          const bareSticker = m.type === "sticker" && (isStickerImageContent(m.content) || isStickerVideoContent(m.content));
          const bareImage = m.type === "image" && m.content.startsWith("data:") && !m.viewOnce;
          const bareViewOnceMedia =
            (m.type === "image" || m.type === "video") && !!m.viewOnce && m.content.startsWith("data:");
          const bubbleClass =
            bareSticker || bareImage || bareViewOnceMedia
              ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible"
              : "rounded-2xl px-3 py-2 text-sm shadow-lg " +
                (isQuranChannel
                  ? mine
                    ? "bg-zinc-800 text-zinc-100"
                    : "bg-zinc-700 text-zinc-50"
                  : mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary");

          const closeCtx = () => {
            setMoreReactionEmoji(false);
            setMessageContext(null);
          };

          const copyContext = async () => {
            try {
              if (m.type === "text") await navigator.clipboard.writeText(m.content);
              else if (m.type === "shared_post") {
                const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
                await navigator.clipboard.writeText(`${base}?post=${encodeURIComponent(m.content)}`);
              } else if (m.type === "shared_story") {
                const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
                await navigator.clipboard.writeText(`${base}?story=${encodeURIComponent(m.content)}`);
              } else if ((m.type === "image" || m.type === "video") && m.viewOnce) {
                await navigator.clipboard.writeText(m.type === "image" ? "[صورة مرة واحدة]" : "[فيديو مرة واحدة]");
              } else if (m.type === "sticker" && !isStickerImageContent(m.content) && !isStickerVideoContent(m.content)) {
                await navigator.clipboard.writeText(m.content);
              } else if (typeof m.content === "string" && m.content.length < 400_000) {
                await navigator.clipboard.writeText(m.content);
              } else {
                await navigator.clipboard.writeText(`[${m.type}]`);
              }
            } catch {
              try {
                await navigator.clipboard.writeText(replyPreview(m));
              } catch {
                /* ignore */
              }
            }
            alert(t("msgCopied"));
            closeCtx();
          };

          const forwardContext = () => {
            closeCtx();
            setForwardingMessage(m);
          };

          return (
            <div className="absolute inset-0 z-[280] flex flex-col" role="dialog" aria-modal="true">
              <button
                type="button"
                className="absolute inset-0 bg-black/35 backdrop-blur-2xl"
                aria-label={t("msgCloseMenu")}
                onClick={closeCtx}
              />
              <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center px-3 py-8">
                <div className="pointer-events-auto flex w-full max-w-[min(92vw,380px)] flex-col items-stretch gap-2">
                  <div className="flex flex-wrap items-center justify-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 px-2 py-2 shadow-xl backdrop-blur-md">
                    {QUICK_REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        className="rounded-full px-2 py-1 text-2xl leading-none transition hover:bg-white/10 active:scale-90"
                        onClick={() => {
                          addMessageReaction(chat.id, m.id, emoji);
                          closeCtx();
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ms-1 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-zinc-100 hover:bg-white/20"
                      aria-label="المزيد من الإيموجيات"
                      onClick={e => {
                        e.stopPropagation();
                        setMoreReactionEmoji(v => !v);
                      }}
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  {moreReactionEmoji && (
                    <div className="max-h-[44vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-2 grid grid-cols-7 gap-0.5 shadow-xl">
                      {EXTENDED_REACTION_EMOJIS.map((emoji, idx) => (
                        <button
                          key={`${emoji}-${idx}`}
                          type="button"
                          className="text-2xl p-1.5 rounded-lg hover:bg-white/10 active:scale-90 font-ios-emoji leading-none"
                          onClick={() => {
                            addMessageReaction(chat.id, m.id, emoji);
                            closeCtx();
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className={"self-center max-w-[85%] " + (mine ? "ms-2" : "me-2")}>
                    <div className={bubbleClass}>{renderBubbleContent(m, mine)}</div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/95 text-zinc-50 shadow-2xl backdrop-blur-md">
                    <div className="border-b border-white/10 px-4 pb-2 pt-3 text-xs text-zinc-400">
                      {formatMsgContextTime(m.createdAt, state.language)}
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-start text-sm hover:bg-white/5 active:bg-white/10"
                      onClick={() => {
                        setReplyingTo(m);
                        closeCtx();
                      }}
                    >
                      <Reply size={20} className="shrink-0 opacity-90" />
                      <span className="flex-1">{t("msgReply")}</span>
                    </button>
                    <button type="button" className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm hover:bg-white/5" onClick={forwardContext}>
                      <Forward size={20} className="shrink-0 opacity-90" />
                      <span className="flex-1">{t("msgForward")}</span>
                    </button>
                    <button type="button" className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm hover:bg-white/5" onClick={copyContext}>
                      <Copy size={20} className="shrink-0 opacity-90" />
                      <span className="flex-1">{t("msgCopy")}</span>
                    </button>
                    {m.type === "sticker" && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm hover:bg-white/5"
                        onClick={() => {
                          addFavoriteStickerContent(m.content);
                          alert(t("stickerFavoriteAdded"));
                          closeCtx();
                        }}
                      >
                        <Star size={20} className="shrink-0 opacity-90" />
                        <span className="flex-1">{t("stickerAddFavorite")}</span>
                      </button>
                    )}
                    {(chat.pinnedMessageIds || []).includes(m.id) ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm hover:bg-white/5"
                        onClick={() => {
                          unpinChatMessage(chat.id, m.id);
                          closeCtx();
                        }}
                      >
                        <Pin size={20} className="shrink-0 opacity-90" />
                        <span className="flex-1">{t("msgUnpin")}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm hover:bg-white/5"
                        onClick={() => {
                          pinChatMessage(chat.id, m.id);
                          closeCtx();
                        }}
                      >
                        <Pin size={20} className="shrink-0 opacity-90" />
                        <span className="flex-1">{t("msgPin")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm hover:bg-white/5"
                      onClick={() => {
                        hideMessageForMe(chat.id, m.id);
                        closeCtx();
                      }}
                    >
                      <Trash2 size={20} className="shrink-0 opacity-90" />
                      <span className="flex-1">{t("msgDeleteForYou")}</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm text-red-400 hover:bg-red-500/10"
                      onClick={() => {
                        alert(t("msgReportThanks"));
                        closeCtx();
                      }}
                    >
                      <Flag size={20} className="shrink-0" />
                      <span className="flex-1">{t("msgReport")}</span>
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3.5 text-start text-sm text-zinc-300 hover:bg-white/5"
                      onClick={() => alert(t("msgMoreSoon"))}
                    >
                      <MoreHorizontal size={20} className="shrink-0 opacity-80" />
                      <span className="flex-1">{t("msgMore")}</span>
                      <ChevronRight size={18} className="shrink-0 opacity-60" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {showStickers && (
        <ChatStickerPicker
          isQuranChannel={isQuranChannel}
          userStickers={state.stickers.filter(s => s.userId === me.id)}
          favoriteStickerContents={me.favoriteStickerContents || []}
          createdStickerContents={me.createdStickerContents || []}
          onPick={pickSticker}
        />
      )}

      {!canPost ? (
        <div className={"p-4 text-center text-sm border-t border-border " + (isQuranChannel ? "text-zinc-400 bg-zinc-900 border-zinc-700" : "text-muted-foreground bg-background")}>{t("onlyOwner")}</div>
      ) : (
        <div className={"border-t border-border shrink-0 " + (isQuranChannel ? "bg-zinc-900 border-zinc-700" : "bg-background")}>
          {replyingTo && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs border-b border-border/60">
              <span className="flex-1 truncate opacity-80">رد على: {replyPreview(replyingTo)}</span>
              <button type="button" className="text-muted-foreground px-2" onClick={() => setReplyingTo(null)}>×</button>
            </div>
          )}
          <form onSubmit={e => {
            e.preventDefault();
            if (!text.trim()) return;
            const rt = replyingTo
              ? { id: replyingTo.id, content: replyPreview(replyingTo), type: replyingTo.type }
              : undefined;
            sendMessage(chat.id, { type: "text", content: text, replyTo: rt });
            setText("");
            setReplyingTo(null);
          }} className="flex flex-wrap items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:flex-nowrap"
          >
            <button type="button" onClick={toggleStickerPanel}><Sticker size={22} /></button>
            <label><ImageIcon size={22} /><input type="file" accept="image/*" hidden onChange={e => onFile(e, "image")} /></label>
            <button
              type="button"
              className="m-0 border-0 bg-transparent p-0 cursor-pointer text-inherit"
              aria-label="كاميرا"
              onClick={() => cameraCaptureRef.current?.click()}
            >
              <Camera size={22} />
            </button>
            <input
              ref={cameraCaptureRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const kind = f.type.startsWith("video") ? "video" : "image";
                const r = new FileReader();
                r.onload = () => setCameraCompose({ kind, dataUrl: String(r.result) });
                r.readAsDataURL(f);
              }}
            />
            <label><Smile size={22} /><input type="file" accept="video/*" hidden onChange={e => onFile(e, "video")} /></label>
            <input 
              value={text} 
              onChange={e => setText(e.target.value)} 
              placeholder={t("typeMessage")} 
              className={
                "flex-1 rounded-full px-4 py-2 outline-none text-sm transition-all " + 
                (isQuranChannel 
                  ? "bg-zinc-800 text-zinc-100 placeholder:text-zinc-400 focus:bg-zinc-700" 
                  : "bg-input focus:bg-background focus:ring-2 focus:ring-primary/20"
                )
              }
              autoFocus
              style={{
                fontSize: '14px',
                lineHeight: '1.5'
              }}
            />
            {text ? (
              <button type="submit" className="text-primary font-semibold">{t("send")}</button>
            ) : recording ? (
              <button type="button" onClick={stopRecording} className="text-destructive flex items-center gap-1"><Square size={14} fill="currentColor" /> {t("stop")}</button>
            ) : (
              <button type="button" className="touch-manipulation p-1 rounded-full hover:bg-secondary" aria-label="تسجيل صوتي" onClick={startRecording}>
                <Mic size={22} />
              </button>
            )}
          </form>
        </div>
      )}
      {cameraCompose && (
        <ChatCameraComposeModal
          draft={cameraCompose}
          senderName={me.username}
          senderAvatar={me.avatar}
          onClose={() => setCameraCompose(null)}
          onSend={({ type, content, viewOnce }) => {
            const rt = replyingTo ? { id: replyingTo.id, content: replyPreview(replyingTo), type: replyingTo.type } : undefined;
            sendMessage(chat.id, {
              type,
              content,
              ...(viewOnce ? { viewOnce: true } : {}),
              ...(rt ? { replyTo: rt } : {}),
            });
            setReplyingTo(null);
          }}
        />
      )}
      {viewOnceOverlay && (
        <ViewOnceMediaOverlay
          media={viewOnceOverlay.type === "video" ? "video" : "image"}
          src={viewOnceOverlay.content}
          onClose={() => {
            markViewOnceOpened(chat.id, viewOnceOverlay.id);
            setViewOnceOverlay(null);
          }}
        />
      )}
      {shareFeedOpen && (
        <ChatSharedFeedOverlay
          items={shareFeedOpen.items}
          initialIndex={shareFeedOpen.initialIndex}
          onClose={() => setShareFeedOpen(null)}
        />
      )}
      {forwardingMessage && (
        <ForwardChatSheet currentChat={chat} message={forwardingMessage} me={me} onClose={() => setForwardingMessage(null)} />
      )}
      </div>
    </div>
  );
}

function GroupSettings({ chat, onBack, onOpenProfile }: { chat: Chat; onBack: () => void; onOpenProfile: (id: string) => void }) {
  const { state, currentUser, renameGroup, toggleGroupAdmin, kickMember, toggleHost, leaveChat } = useApp();
  const t = useT();
  const me = currentUser!;
  const [name, setName] = useState(chat.name || "");
  const isAdmin = chat.admins.includes(me.id);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2"><button onClick={onBack}><ArrowRight /></button><h2 className="font-bold">{chat.isChannel ? t("channel") : t("group")}</h2></div>
      <div className="text-center">
        <div className="text-6xl">{chat.avatar}</div>
        <div className="text-sm text-muted-foreground mt-1">{chat.members.length} {t("members")}</div>
      </div>
      <div className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} className="flex-1 bg-input rounded-2xl px-4 py-2 outline-none" disabled={!isAdmin} />
        <button onClick={() => renameGroup(chat.id, name)} className="bg-primary text-primary-foreground px-4 rounded-2xl text-sm" disabled={!isAdmin}>{t("save")}</button>
      </div>
      <div>
        <h3 className="font-semibold mb-2">{t("members")}</h3>
        <div className="space-y-1">
          {chat.members.map(id => {
            const u = userById(state, id);
            const admin = chat.admins.includes(id);
            const host = (chat.hosts || []).includes(id);
            return (
              <div key={id} className="flex items-center gap-2 p-2 rounded-2xl bg-secondary flex-wrap">
                <button onClick={() => onOpenProfile(id)}><Avatar name={u?.username || "?"} src={u?.avatar} size={36} /></button>
                <div className="flex-1 text-start text-sm">@{u?.username} {admin && <span className="text-xs text-muted-foreground">(مشرف)</span>} {host && chat.isChannel && <span className="text-xs text-primary">(مساهم)</span>}</div>
                {isAdmin && id !== me.id && (<>
                  {chat.isChannel && <button onClick={() => toggleHost(chat.id, id)} className="text-xs bg-background px-2 py-1 rounded-full">{host ? t("removeHost") : t("inviteHost")}</button>}
                  {!chat.isChannel && <button onClick={() => toggleGroupAdmin(chat.id, id)} className="text-xs bg-background px-2 py-1 rounded-full">{admin ? "إزالة مشرف" : "تعيين مشرف"}</button>}
                  <button onClick={() => kickMember(chat.id, id)} className="text-xs text-destructive">طرد</button>
                </>)}
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => { leaveChat(chat.id); onBack(); }} className="w-full bg-card text-destructive font-semibold py-2 rounded-2xl flex items-center justify-center gap-2">
        <LogOut size={16} /> {chat.isChannel ? t("leave") : "مغادرة المجموعة"}
      </button>
    </div>
  );
}

function CallScreen({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { state, currentUser } = useApp();
  const me = currentUser!;
  const chat = state.chats.find(c => c.id === chatId);
  const otherId = chat?.members.find(id => id !== me.id);
  const other = otherId ? userById(state, otherId) : null;
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-between py-12 z-50">
      <div className="flex flex-col items-center gap-3">
        <Avatar name={chat?.isGroup ? chat.name! : other?.username || "?"} src={chat?.isGroup ? chat.avatar : other?.avatar} size={120} />
        <div className="text-xl font-semibold">{chat?.isGroup ? chat.name : "@" + (other?.username || "")}</div>
        <div className="text-sm text-white/60">{sharing ? "🖥️ مشاركة الشاشة" : "جاري الاتصال..."}</div>
      </div>
      <div className="flex gap-4">
        <button onClick={() => setMuted(m => !m)} className={"w-14 h-14 rounded-full flex items-center justify-center " + (muted ? "bg-red-600" : "bg-white/20")}>
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button onClick={() => setSharing(s => !s)} className={"w-14 h-14 rounded-full flex items-center justify-center " + (sharing ? "bg-blue-600" : "bg-white/20")}>
          <MonitorUp />
        </button>
        <button onClick={onClose} className="w-14 h-14 rounded-full flex items-center justify-center bg-red-600">
          <X />
        </button>
      </div>
    </div>
  );
}
