import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { useLockPageScroll } from "@/hooks/useLockPageScroll";
import { useIsTabActive } from "@/lib/tabActiveContext";
import {
  useSlideDismissBack,
  APP_COLUMN_MAX_PX,
  SLIDE_DISMISS_MS,
  SLIDE_DISMISS_EASE,
  isDocumentRtl,
} from "@/hooks/useSlideDismissBack";
import { isChatDismissSwipeDelta } from "@/lib/edgeSwipeDismiss";
import {
  applyCloseStackTransforms,
  applyOpenStackTransforms,
  chatStackOpenReleaseTarget,
  CHAT_STACK_OPEN_FRACTION,
  CHAT_STACK_PROGRESS_VAR,
  clearChatStackCssProgress,
  publishChatStackCssProgress,
  syncStackNavHideProgress,
} from "@/lib/chatStackGestureEngine";
import {
  DEFAULT_LAYOUT_WIDTH_PX,
  readSafeStackCapPx,
  readSafeViewportWidth,
} from "@/lib/safeLayoutDimensions";
import { ChatStackRoomGestureShell } from "../chat/ChatStackRoomGestureShell";
import { SlideDismissBackButton, SlideDismissContext, SlideDismissShell } from "../SlideDismissShell";
import { QURAN_CHANNEL_ID, isProfileNoteActive, useApp, userById, visibleChatMessages } from "@/lib/store";
import { useTypingUsers } from "@/lib/typingContext";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { chatNoSelectCaptureHandlers } from "@/lib/chatNoTextSelection";
import { NATIVE_LONG_PRESS_ATTR } from "@/lib/nativeTextSelectionGuard";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ChatDmIntroCard } from "../chat/ChatDmIntroCard";
import { ChatStickerPicker } from "../chat/ChatStickerPicker";
import { ViewOnceMediaOverlay, type CameraComposeDraft } from "../chat/ChatCameraComposeModal";
import { CameraCaptureShareScreen } from "../camera/CameraCaptureShareScreen";
import { InstagramCamera } from "../camera/InstagramCamera";
import { ChatDrawComposeModal } from "../chat/ChatDrawComposeModal";
import { ChatDrawingCanvas } from "../chat/ChatDrawingCanvas";
import { parseDrawingPayload } from "../chat/drawingPayload";
import { ChatInlineMediaLightbox } from "../chat/ChatInlineMediaLightbox";
import { ChatSharedFeedOverlay, type ChatShareFeedItem } from "../chat/ChatSharedFeedOverlay";
import { SharedPostPreview, SharedStoryChatPreview } from "../SharedPostPreview";
import { SharedGroupInvitePreview } from "../chat/SharedGroupInvitePreview";
import { ChatNoteReplyBubble, ChatStoryReplyStack } from "../chat/ChatReplyContext";
import { ChatSwipeMessageRow } from "../chat/ChatSwipeMessageRow";
import { ChatMessageStatus, ChatListOutgoingStatusIcon } from "../chat/ChatMessageStatus";
import { ChatInboxVirtualList } from "../chat/ChatInboxVirtualList";
import { ChatInboxSkeleton } from "../chat/ChatInboxSkeleton";
import { ChatFloatingDatePill } from "../chat/ChatFloatingDatePill";
import { flushTypingStop, scheduleTypingPulse } from "@/lib/chatRealtimeExtras";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  lastMessagePreview,
  resolveListTypingPeerId,
  isPeerOnline,
  listTypingPreview,
  chatUnreadCount,
} from "@/lib/chatInboxUtils";
import { clearChatDraft, loadChatDraft, saveChatDraft } from "@/lib/chatDraftStorage";
import { chatHapticLight, chatHapticSuccess } from "@/lib/chatHaptics";
import { useChatKeyboardInsets } from "@/hooks/useChatKeyboardInsets";
import { chatComposerBottomPadding } from "@/hooks/useVisualViewportLayout";
import { isNativeCapacitorShell } from "@/lib/apiUrlPolicy";
import { compressChatMediaFile } from "@/lib/chatMediaCompress";
import { isOwnChatMessage, resolveActiveViewerId } from "@/lib/chatViewer";
import { messageContent, normalizeChatRecord } from "@/lib/chatNormalize";
import { chatMergeKey, dmChatId, findChatByOpenId, openChatIdFor } from "@/lib/dmChatId";
import { ChatInlineReplyQuote } from "../chat/ChatInlineReplyQuote";
import { ChatComposerReplyBar } from "../chat/ChatComposerReplyBar";
import { GroupDetailsScreen } from "../chat/GroupDetailsScreen";
import { ChatThemePickerSheet } from "../chat/ChatThemePickerSheet";
import {
  loadChatWallpaperForChat,
  saveChatWallpaperForChat,
  chatWallpaperAssetUrl,
  chatWallpaperLabel,
  getChatWallpaperTheme,
  type ChatWallpaperId,
} from "@/lib/chatWallpaperThemes";
import { EXTENDED_REACTION_EMOJIS } from "@/lib/reactionEmojiGrid";
import { isStickerImageContent, isStickerVideoContent } from "@/lib/stickerUtils";
import { renderMentionHashtagNodes, createMentionRenderer } from "@/lib/renderMentionHashtagText";
import { MentionComposerField } from "../MentionComposerField";
import { Mic, Image as ImageIcon, Sticker, Phone, Video, MicOff, MonitorUp, X, Plus, ArrowRight, Settings as SettingsIcon, Check, Camera, Search, Square, Megaphone, Users, LogOut, AtSign, MoreVertical, ChevronLeft, Reply, Forward, Copy, Trash2, Flag, MoreHorizontal, ChevronRight, Pin, Play, Pause, Star, Bell, BellOff, Mail, Send, PenLine, SquarePen, MessageCirclePlus, Smile, Lock, Palette } from "lucide-react";
import { PoolGame } from "../games/PoolGame";
import {
  buildChatTimelineRows,
  chatBubbleAlignClasses,
  chatDmIsRtl,
  chatDmLayoutDir,
  chatDmPeerBubbleStyle,
  chatReactionAlignClasses,
  formatChatBubbleTime,
  getChatDmPalette,
  isIgDmChat,
  CHAT_DM_ACCENT,
} from "@/lib/chatDmTheme";
import type { ChatDmPalette } from "@/lib/chatDmTheme";
import { RSocialAvatar } from "../rsocial/RSocialAvatar";
import { displayNameFromUsername, formatChatListTime, RS_BADGE } from "@/lib/rsocialUi";
import type { AppState, Chat, Message, User } from "@/lib/types";
import { isReactNativeWebView, postToNativeShell } from "@/lib/nativeShell";
import { isRenderableMediaUrl, resolveMediaUrl } from "@/lib/mediaUrl";
import {
  apiBackendEnabled,
  apiLookupUserByUsername,
  apiUploadMedia,
  getApiToken,
  userFromSearchResult,
} from "@/lib/apiBackend";
import { INCOMING_CALL_WINDOW_EVENT } from "@/lib/store";
import type { IncomingCallRing } from "@/lib/webrtcCall";
import { CallScreen } from "./CallScreen";

const PREVIEW_MAX = 96;
/** عرض عمود التطبيق — من useSlideDismissBack */
/**
 * ارتفاع شريط App العلوي (تقريباً: py-3 + صف الأيقونات + border) حتى تتطابق طبقة صندوق الوارد خلف المحادثة مع main.
 * يجب أن يبقى متوافقاً مع `<header className="... py-3 ...">` في App.tsx.
 */
const APP_TOP_BAR_BELOW_SAFE_AREA = "3.5rem";
/** يقرأها App.tsx (header/nav) أثناء سحب الرجوع من المحادثة — 0…1 */
export const CHAT_DISMISS_PULL_CSS_VAR = "--retweet-chat-dismiss-pull";
/** ارتفاع شريط الرأس — يُستثنى من حافة السحب اليمنى حتى لا تغطي زر الرجوع */
const CHAT_ROOM_HEADER_EDGE_INSET_PX = 72;
export { CHAT_STACK_PROGRESS_VAR } from "@/lib/chatStackGestureEngine";
/** دخول المحادثة بالنقر — انزلاق مكدس تفاعلي (نفس إحساس السحب) */
const CHAT_TAP_OPEN_MS = 320;
const CHAT_TAP_OPEN_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** ارتفاع سطر شريط الكتابة (text-[16px] + leading-5) */
/** منع تحديد iOS على زر المعرض — الضغط المطوّل يفتح فيديو كرسالة صوتية */
const galleryLongPressBtnProps = {
  [NATIVE_LONG_PRESS_ATTR]: "gallery",
  onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
  onSelectStart: (e: React.SyntheticEvent) => e.preventDefault(),
} as const;

const CHAT_COMPOSER_LINE_PX = 20;
const CHAT_COMPOSER_MAX_LINES = 5;
const CHAT_COMPOSER_MAX_HEIGHT_PX = CHAT_COMPOSER_LINE_PX * CHAT_COMPOSER_MAX_LINES;

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
    return base + " bg-black/[0.1] text-zinc-800 dark:bg-white/15 dark:text-zinc-100";
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

/** فيديو في ثريد المحادثة — أقرب لحجم دايركت إنستغرام، بدون إطارات، وحواف دائرية */
const CHAT_VIDEO_WRAP =
  "w-full max-w-full shrink-0 overflow-hidden rounded-[18px] bg-black shadow-none ring-0";
const CHAT_VIDEO_EL =
  "block h-auto w-full max-h-[min(52vh,400px)] border-0 object-cover bg-transparent outline-none shadow-none ring-0 focus:outline-none focus-visible:outline-none";

/** صورة في ثريد المحادثة — نفس حدود عرض/ارتفاع تقريب دايركت إنستغرام (مع الفيديو) */
const CHAT_IMAGE_WRAP =
  "w-full max-w-full shrink-0 overflow-hidden rounded-[18px] bg-transparent shadow-none ring-0";
const CHAT_IMAGE_EL =
  "block h-auto w-full max-h-[min(52vh,400px)] border-0 object-cover bg-transparent outline-none shadow-none ring-0";

/** ملصق في المحادثة — زوايا دائرية، بدون إطار أو حافة حادة */
const CHAT_STICKER_MEDIA_CLASS =
  "block h-auto w-auto max-h-[min(42vh,260px)] max-w-[min(88vw,240px)] shrink-0 object-contain overflow-hidden rounded-[22px] border-0 bg-transparent align-middle shadow-none outline-none ring-0";

/** عرض عمود صورة/فيديو دايركت — حدّ أقصى ضيّق يشبه عمود رسائل الإنستا */
const CHAT_INLINE_MEDIA_COL = "w-full max-w-[min(74vw,274px)] shrink-0";

/** حد أقصى لفقاعة النص — ~75% من الشاشة (إنستغرام دايركت) */
const CHAT_BUBBLE_MAX_W = "max-w-[min(75vw,280px)]";

/** عمود فقاعة نص/محتوى — عرض جوهري (يلتف حول النص) وليس full-width */
const CHAT_TEXT_BUBBLE_COL = "w-max " + CHAT_BUBBLE_MAX_W + " shrink-0";

type ChatVisualTheme = "default" | "blue" | "pink";

/** لون رسائلك وأزرار الكاميرا — يتبع ثيم المحادثة (افتراضي = أزرق دايركت مثل زر الإرسال) */
function chatMineAccentClass(theme: ChatVisualTheme, isQuran: boolean, igDm = false): string {
  if (igDm) return "bg-[#1B72E8] text-white";
  if (isQuran) return "bg-emerald-700 text-white";
  if (theme === "blue") return "bg-blue-600 text-white dark:bg-blue-500";
  if (theme === "pink") return "bg-pink-600 text-white dark:bg-pink-500";
  return "bg-[#0084ff] text-white";
}

/** فقاعة نصية — متناسقة مع ثيم المحادثة */
function chatBubbleFilledClass(
  mine: boolean,
  isQuran: boolean,
  theme: ChatVisualTheme = "default",
  igDm = false,
  dmPalette?: ChatDmPalette,
): string {
  // Liquid Glass bubble — rounded corners أكبر
  const base =
    "inline-block w-max max-w-full rounded-[20px] text-[15px] leading-[1.4] align-top select-text " +
    (igDm ? "px-[15px] py-[10px] " : "px-[14px] py-[10px] ");
  if (isQuran) {
    return (
      base +
      (mine
        ? "bg-emerald-950/90 text-emerald-50 shadow-sm"
        : "bg-zinc-800 text-zinc-100 shadow-sm")
    );
  }
  if (igDm) {
    if (mine) {
      // رسالتي: أبيض ناصع — Liquid Glass
      return (
        base +
        "bg-white text-black shadow-[0_2px_16px_rgba(0,0,0,0.18)]"
      );
    }
    // رسالة الآخر: Glass شفاف
    return (
      base +
      "shadow-[0_1px_8px_rgba(0,0,0,0.12)]"
    );
  }
  if (mine) {
    return base + chatMineAccentClass(theme, false) + " shadow-sm";
  }
  return base + "bg-zinc-200 text-zinc-900 dark:bg-[#262626] dark:text-zinc-100";
}

function chatCameraButtonClass(theme: ChatVisualTheme, isQuran: boolean): string {
  return (
    "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full shadow-sm transition active:scale-[0.93] " +
    chatMineAccentClass(theme, isQuran) +
    (theme === "default" && !isQuran ? " hover:bg-[#0073e6]" : "")
  );
}

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

function parseGroupSystemEvent(raw: string): { actor: string; action: string; target: string } | null {
  const text = (raw || "").trim();
  let m = text.match(/^@?([A-Za-z0-9_.-]+)\s+أضاف\s+@?([A-Za-z0-9_.-]+)\s+إلى المجموعة$/);
  if (m) return { actor: m[1], action: "added", target: m[2] };
  m = text.match(/^@?([A-Za-z0-9_.-]+)\s+طرد\s+@?([A-Za-z0-9_.-]+)\s+من المجموعة$/);
  if (m) return { actor: m[1], action: "removed", target: m[2] };
  m = text.match(/^@?([A-Za-z0-9_.-]+)\s+added\s+@?([A-Za-z0-9_.-]+)(?:\s+to\s+the\s+group)?$/i);
  if (m) return { actor: m[1], action: "added", target: m[2] };
  m = text.match(/^@?([A-Za-z0-9_.-]+)\s+removed\s+@?([A-Za-z0-9_.-]+)(?:\s+from\s+the\s+group)?$/i);
  if (m) return { actor: m[1], action: "removed", target: m[2] };
  return null;
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
      const hidden = c.hiddenMessageIdsByUser?.[me.id];
      const msgs = c.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (hidden?.includes(m.id)) continue;
        return m.createdAt;
      }
      return 0;
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
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** نفس معاينة الرسالة المختصرة داخل ChatRoom (مثبتات، رد، حافظة، نسخ…) */
function chatReplyPreview(m: Message): string {
  const c = messageContent(m);
  if (m.type === "text") return truncateText(c, 100);
  if (m.type === "sticker") return (isStickerImageContent(c) || isStickerVideoContent(c)) ? "[ملصق]" : truncateText(c, 40);
  if (m.type === "image" && m.viewOnce) return "[صورة مرة واحدة]";
  if (m.type === "video" && m.viewOnce) return "[فيديو مرة واحدة]";
  if (m.type === "drawing" && m.viewOnce) return "[رسم مرة واحدة]";
  if (m.type === "image") return "[صورة]";
  if (m.type === "drawing") return "[رسم]";
  if (m.type === "video") return "[فيديو]";
  if (m.type === "voice") return "[صوت]";
  if (m.type === "shared_post") return "[منشور]";
  if (m.type === "shared_story") return "[ستوري]";
  return `[${m.type}]`;
}

function readVideoDurationSec(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const finish = (sec: number) => {
      URL.revokeObjectURL(url);
      resolve(sec);
    };
    video.onloadedmetadata = () => {
      const d = video.duration;
      finish(d && Number.isFinite(d) ? Math.max(1, Math.round(d)) : 1);
    };
    video.onerror = () => finish(1);
    video.src = url;
  });
}

function readAudioDurationSec(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const finish = (sec: number) => {
      URL.revokeObjectURL(url);
      resolve(sec);
    };
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      finish(d && Number.isFinite(d) ? Math.max(1, Math.round(d)) : 1);
    };
    audio.onerror = () => finish(1);
    audio.src = url;
  });
}

/** لا تستخدم `hidden`/`display:none` — على iOS قد لا يُشغَّل صوت/فيديو الرسالة الصوتية */
const VOICE_MEDIA_OFFSCREEN =
  "pointer-events-none fixed start-0 top-0 z-[-1] m-0 h-[2px] w-[2px] max-h-[2px] max-w-[2px] overflow-hidden border-0 p-0 opacity-[0.02]";

function fmtVoiceTime(sec: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const VOICE_WAVE_BARS = 40;

function voiceWaveHeightsFromSrc(src: string): number[] {
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h + src.charCodeAt(i) * (i + 1)) % 100017;
  return Array.from({ length: VOICE_WAVE_BARS }, (_, i) => {
    const t = Math.sin((i + 1) * 1.55 + h * 0.00012) * 0.45 + 0.55;
    const t2 = Math.cos((i + 2) * 0.9 + h * 0.00008) * 0.2;
    return Math.round(Math.min(100, Math.max(28, (t + t2) * 100)));
  });
}

/** مستويات شريط الموجة من Web Audio؛ يعكس قوة الإشارة وقت التشغيل */
function waveBarsFromAnalyser(analyser: AnalyserNode, barCount: number): number[] {
  const n = analyser.frequencyBinCount;
  const data = new Uint8Array(n);
  analyser.getByteFrequencyData(data);
  const heights: number[] = [];
  for (let b = 0; b < barCount; b++) {
    const t0 = (b / barCount) ** 1.05;
    const t1 = ((b + 1) / barCount) ** 1.05;
    const start = Math.floor(n * t0);
    const end = Math.ceil(n * t1);
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[Math.min(i, n - 1)];
    const avg = sum / Math.max(1, end - start) / 255;
    const boosted = Math.min(1.15, avg * 1.75 + 0.03);
    const eased = Math.pow(boosted, 0.82);
    const pct = Math.round(20 + eased * 80);
    heights.push(Math.min(100, Math.max(17, pct)));
  }
  return heights;
}

type VoiceAnalyserGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
};

/** Safari/iOS غالباً لا يشغّل webm صوت — نستخدم عنصر فيديو */
function voiceUsesVideoElement(src: string): boolean {
  if (src.startsWith("data:video")) return true;
  const low = src.slice(0, 80).toLowerCase();
  return low.includes("audio/webm") || low.includes("video/webm");
}

function waitMediaCanPlay(el: HTMLMediaElement): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("media load failed"));
    };
    const cleanup = () => {
      el.removeEventListener("canplay", done);
      el.removeEventListener("loadeddata", done);
      el.removeEventListener("error", fail);
    };
    el.addEventListener("canplay", done, { once: true });
    el.addEventListener("loadeddata", done, { once: true });
    el.addEventListener("error", fail, { once: true });
    try {
      el.load();
    } catch {
      /* ignore */
    }
  });
}

/** data: URL كبيرة تبطّئ التشغيل — نحوّلها لـ blob URL أسرع */
function useVoicePlaybackSrc(src: string): string {
  const [playbackSrc, setPlaybackSrc] = useState(src);
  useEffect(() => {
    if (!src.startsWith("data:")) {
      setPlaybackSrc(src);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await (await fetch(src)).blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setPlaybackSrc(revoked);
      } catch {
        if (!cancelled) setPlaybackSrc(src);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);
  return playbackSrc;
}

/** رسالة صوتية — شكل عصري قريب من إنستغرام دايركت */
function InlineVoicePlayer({
  src,
  durationSec,
  isQuran,
  mine,
}: {
  src: string;
  durationSec?: number;
  isQuran: boolean;
  mine: boolean;
}) {
  const playbackSrc = useVoicePlaybackSrc(src);
  const useVideoEl = voiceUsesVideoElement(playbackSrc);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyserGraphRef = useRef<VoiceAnalyserGraph | null>(null);
  const ensureAnalyserRef = useRef<(() => Promise<void>) | null>(null);
  const waveRafRef = useRef(0);
  const waveSmoothRef = useRef<number[]>(Array.from({ length: VOICE_WAVE_BARS }, () => 40));
  const waveFrameRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(durationSec || 0);
  const [levelsLive, setLevelsLive] = useState<number[] | null>(null);

  const idleHeights = useMemo(() => voiceWaveHeightsFromSrc(src), [src]);
  const idleRef = useRef(idleHeights);
  idleRef.current = idleHeights;

  useEffect(() => {
    waveSmoothRef.current = idleRef.current.slice();
    setLevelsLive(null);
    setPlaying(false);
    setCur(0);
    setDur(durationSec || 0);
    if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
    waveRafRef.current = 0;
    void analyserGraphRef.current?.ctx.close().catch(() => {});
    analyserGraphRef.current = null;
    ensureAnalyserRef.current = null;

    const el = (useVideoEl ? videoRef.current : audioRef.current) as HTMLMediaElement | null;
    if (!el) return undefined;
    try {
      el.load();
    } catch {
      /* ignore */
    }
    const onT = () => setCur(el.currentTime);
    const onMeta = () => {
      const d = el.duration;
      setDur(d && isFinite(d) && d > 0 ? d : durationSec || 0);
    };
    const onPlay = () => setPlaying(true);
    const stopWaveRaf = () => {
      if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = 0;
    };

    const onWaveStop = () => {
      stopWaveRaf();
      setLevelsLive(null);
    };

    const onPause = () => {
      setPlaying(false);
      onWaveStop();
    };

    const onEnded = () => {
      setPlaying(false);
      setCur(0);
      onWaveStop();
    };

    const attachAnalyser = async () => {
      if (analyserGraphRef.current) return;
      const AW =
        typeof window !== "undefined" &&
        (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AW) return;
      try {
        const ctx = new AW();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.72;
        const source = ctx.createMediaElementSource(el);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserGraphRef.current = { ctx, analyser };
        await ctx.resume();
      } catch {
        analyserGraphRef.current = null;
      }
    };
    ensureAnalyserRef.current = attachAnalyser;

    const waveLoop = () => {
      if (el.paused) return;
      const graph = analyserGraphRef.current;
      if (!graph) return;
      const raw = waveBarsFromAnalyser(graph.analyser, VOICE_WAVE_BARS);
      const sm = waveSmoothRef.current;
      for (let i = 0; i < VOICE_WAVE_BARS; i++) {
        sm[i] = sm[i] * 0.56 + raw[i] * 0.44;
      }
      waveFrameRef.current += 1;
      if ((waveFrameRef.current & 3) === 0) setLevelsLive([...sm]);
      waveRafRef.current = requestAnimationFrame(waveLoop);
    };

    const onPlaying = () => {
      setLoading(false);
      void ensureAnalyserRef.current?.();
      void analyserGraphRef.current?.ctx.resume().catch(() => {});
      waveSmoothRef.current = idleRef.current.slice();
      waveFrameRef.current = 0;
      stopWaveRaf();
      if (analyserGraphRef.current) waveRafRef.current = requestAnimationFrame(waveLoop);
    };

    el.addEventListener("timeupdate", onT);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("timeupdate", onT);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      stopWaveRaf();
      setLevelsLive(null);
      void analyserGraphRef.current?.ctx.close().catch(() => {});
      analyserGraphRef.current = null;
      ensureAnalyserRef.current = null;
    };
  }, [playbackSrc, useVideoEl, durationSec]);

  const toggle = async () => {
    const el = (useVideoEl ? videoRef.current : audioRef.current) as HTMLMediaElement | null;
    if (!el) return;
    try {
      if (!el.paused) {
        el.pause();
        setLoading(false);
        return;
      }
      setLoading(true);
      await waitMediaCanPlay(el);
      await el.play();
    } catch {
      try {
        await waitMediaCanPlay(el);
        await el.play();
      } catch {
        setLoading(false);
      }
    }
  };

  const total = dur || durationSec || 0;
  const filledBars = total > 0 ? Math.min(VOICE_WAVE_BARS, Math.ceil((cur / total) * VOICE_WAVE_BARS)) : 0;
  const remaining = Math.max(0, total - cur);

  const displayHeights = levelsLive ?? idleHeights;

  const shell =
    "flex min-w-[min(92vw,268px)] max-w-[min(92vw,288px)] items-center gap-3 rounded-[22px] px-2.5 py-2 " +
    "border-0 outline-none ring-0 ring-offset-0 shadow-none " +
    "backdrop-blur-xl backdrop-saturate-150 " +
    (isQuran
      ? mine
        ? "bg-emerald-950/22 text-emerald-50 dark:bg-emerald-950/26"
        : "bg-black/[0.065] text-zinc-100 dark:bg-zinc-900/34"
      : "bg-black/[0.052] text-zinc-900 dark:bg-white/[0.065] dark:text-zinc-50");

  const playBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-[0.97] " +
    "border-0 shadow-none outline-none ring-0 backdrop-blur-md " +
    "bg-zinc-900/80 text-white focus-visible:ring-2 focus-visible:ring-zinc-400/45 " +
    "dark:bg-white dark:text-zinc-950 dark:focus-visible:ring-white/35 " +
    (isQuran && mine ? " !bg-emerald-900/80 !text-emerald-50 dark:!bg-emerald-800/90" : "");

  const barIdle = isQuran
    ? mine
      ? "bg-emerald-200/38"
      : "bg-zinc-500/38"
    : "bg-zinc-400/42 dark:bg-white/24";

  const barActive = isQuran
    ? mine
      ? "bg-emerald-100"
      : "bg-zinc-300"
    : "bg-zinc-800 dark:bg-white";

  return (
    <div className="flex w-max max-w-[min(92vw,288px)] flex-col">
      {useVideoEl ? (
        <video
          ref={videoRef}
          src={playbackSrc}
          preload="auto"
          className={VOICE_MEDIA_OFFSCREEN}
          playsInline
          controls={false}
        />
      ) : (
        <audio ref={audioRef} src={playbackSrc} preload="auto" className={VOICE_MEDIA_OFFSCREEN} />
      )}
      <div className={shell} dir="ltr">
        <button
          type="button"
          onClick={toggle}
          className={playBtn}
          aria-label={playing ? "إيقاف" : loading ? "تحميل" : "تشغيل"}
          disabled={loading && !playing}
        >
          {loading && !playing ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : playing ? (
            <Pause size={18} className="fill-current" />
          ) : (
            <Play size={18} className="ms-0.5 fill-current" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex h-9 min-w-0 flex-1 items-end justify-stretch gap-[2px] px-0.5">
            {displayHeights.map((hPct, i) => {
              const active = i < filledBars;
              return (
                <span
                  key={i}
                  className={
                    "min-h-[4px] min-w-[2px] flex-1 max-w-[4px] origin-bottom rounded-full transition-colors duration-100 " +
                    (active ? barActive : barIdle) +
                    (playing && active ? " motion-safe:opacity-95" : "")
                  }
                  style={{ height: `${hPct}%` }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-end px-0.5">
            <span
              className={
                "text-[12px] font-semibold tabular-nums tracking-tight " +
                (isQuran ? "text-emerald-100/90" : "text-zinc-600 dark:text-zinc-300")
              }
            >
              {total > 0 ? fmtVoiceTime(remaining) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function peekMessageLine(m: Message): string {
  const c = messageContent(m);
  if (m.type === "text") return truncateText(c, 220);
  if (m.type === "sticker") return truncateText(c, 48);
  if (m.type === "image") return m.viewOnce ? "صورة · مرة واحدة" : "صورة";
  if (m.type === "drawing") return m.viewOnce ? "رسم · مرة واحدة" : "رسم";
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
  const mc = messageContent(m);
  if (m.type === "text")
    return (
      <span className="block max-w-full select-none whitespace-pre-wrap break-words text-sm leading-relaxed text-start [overflow-wrap:anywhere] [word-break:break-word]">
        {mc}
      </span>
    );
  if (m.type === "shared_post") {
    return (
      <div className="max-w-[min(96vw,360px)]">
        {m.shareText && <p className="mb-1 line-clamp-2 text-[11px] opacity-80">{m.shareText}</p>}
        <SharedPostPreview postId={mc} variant="chat" />
      </div>
    );
  }
  if (m.type === "shared_story") {
    return (
      <div className="max-w-[min(96vw,360px)]">
        {m.shareText && <p className="mb-1 line-clamp-2 text-[11px] opacity-80">{m.shareText}</p>}
        <SharedStoryChatPreview storyId={mc} />
      </div>
    );
  }
  if (m.type === "voice") {
    if (mc.startsWith("data:") || isRenderableMediaUrl(mc)) {
      return (
        <InlineVoicePlayer
          src={mc.startsWith("data:") ? mc : resolveMediaUrl(mc)}
          durationSec={m.durationSec}
          isQuran={isQuran}
          mine={bubbleMine}
        />
      );
    }
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xl">🎙️</span>
        <span className="break-all text-xs opacity-80">{mc}</span>
      </span>
    );
  }
  if (m.type === "sticker" && isStickerImageContent(mc)) {
    return (
      <img
        src={mc}
        alt=""
        className={CHAT_STICKER_MEDIA_CLASS}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (m.type === "sticker" && isStickerVideoContent(mc)) {
    return (
      <video
        src={mc}
        className={CHAT_STICKER_MEDIA_CLASS}
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
      <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-[22px] bg-secondary/40 text-2xl leading-none select-none">
        {mc}
      </span>
    );
  }
  if (m.type === "drawing" && m.viewOnce) {
    if (viewOnceOpenedForViewer(m, viewerId)) {
      return <span className={viewOncePillDoneClass(bubbleMine, isQuran)}>رسم · تمت</span>;
    }
    return (
      <span className={viewOncePillActiveClass(bubbleMine, isQuran)}>
        <Play size={12} className="shrink-0 fill-current opacity-90" />
        رسم
      </span>
    );
  }
  if (m.type === "drawing") {
    const p = parseDrawingPayload(mc);
    return p ? (
      <div className={CHAT_IMAGE_WRAP + " overflow-hidden"}>
        <ChatDrawingCanvas payload={p} className="w-full" maxHeightPx={240} forChatDisplay />
      </div>
    ) : (
      <span className="text-xs opacity-70">رسم</span>
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
    return (
      <div className={CHAT_IMAGE_WRAP}>
        <img
          src={mc}
          alt=""
          className={CHAT_IMAGE_EL}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }
  if (m.type === "video") {
    return (
      <div className={CHAT_VIDEO_WRAP}>
        <video
          src={mc}
          controls
          playsInline
          className={`${CHAT_VIDEO_EL} rounded-none`}
          preload="metadata"
        />
      </div>
    );
  }
  return <span className="text-sm leading-relaxed [overflow-wrap:break-word] [word-break:normal]">{peekMessageLine(m)}</span>;
}

/** معاينة المحادثة: إما سحب أفقي مبكر من الكاميرا، أو ضغط مطوّل ثم سحب */
const CAMERA_LONG_PRESS_MS = 240;
const CAMERA_TAP_MAX_DURATION_MS = CAMERA_LONG_PRESS_MS - 45;
/** بعد هذا الجذب نحو عرض الشاشة نفعّل المعاينة فوراً (بدون انتظار الضغط المطوّل) */
const CAMERA_EARLY_PULL_PX = 16;
/** سحب يسار→يمين لبدء فتح المحادثة */
const ROW_OPEN_ARM_PX = 10;
/** أقصى حركة تُعتبر «نقرة» وليس سحباً */
const ROW_TAP_MAX_MOVE_PX = 18;
/** نسبة من عرض عمود التطبيق تكفي لفتح المحادثة عند رفع الإصبع (كان ~97% من العرض الكامل) */
const PEEK_OPEN_CHAT_FRACTION = 0.5;
/** أقل من هذا + إيماءة قصيرة نفتح التقاط الكاميرا */
const PEEK_CAMERA_TAP_FRACTION = 0.2;

/** سحب من جهة أيقونة الكاميرا نحو عرض المحادثة (معاينة مثل السناب) */
/** بادج السترك 🔥 — يظهر في قائمة المحادثات ورأس الغرفة */
function StreakBadge({ streak, compact = false }: { streak: import("@/lib/types").ChatStreak; compact?: boolean }) {
  const now = Date.now();
  const soonToExpire =
    streak.streakExpiresAt != null && streak.streakExpiresAt - now < 6 * 60 * 60 * 1000;
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-px rounded-full font-bold tabular-nums " +
        (compact
          ? "px-1 py-px text-[11px] leading-none"
          : "px-1.5 py-0.5 text-[11px] leading-none")
      }
      style={{ backgroundColor: "rgba(255,59,48,0.12)", color: "#FF3B30" }}
      title={soonToExpire ? "السترك على وشك الانتهاء! أرسل رسالة قبل 6 ساعات" : `سترك: ${streak.streakCount} يوم`}
    >
      {soonToExpire ? "⏳" : ""}🔥{streak.streakCount > 99 ? "99+" : streak.streakCount}
    </span>
  );
}

function ChatListRowWithPeek({
  chat: c,
  me,
  onOpenChat,
  onOpenProfile,
  onStackDrag,
  onStackDragEnd,
  onStackChromeHide,
  onStackChromeShow,
  onRowOpenCommit,
  onStackGestureArm,
}: {
  chat: Chat;
  me: { id: string };
  onOpenChat: (id: string) => void;
  onOpenProfile: (id: string) => void;
  onStackDrag?: (chatId: string, px: number, vx?: number) => void;
  onStackDragEnd?: (chatId: string, px: number, vx?: number) => void;
  /** بداية سحب فتح المحادثة — إخفاء الشريط السفلي فوراً */
  onStackChromeHide?: () => void;
  /** إلغاء سحب قصير — إعادة الشريط السفلي */
  onStackChromeShow?: () => void;
  /** مسار واحد لإنهاء السحب/النقر — يمنع فتح مكرر */
  onRowOpenCommit?: (chatId: string, px: number, mode: "tap" | "swipe-end") => void;
  /** يحرّر قفل سحب عالق قبل لمسة جديدة */
  onStackGestureArm?: () => void;
}) {
  const {
    state,
    openOrCreateChat,
    sendMessage,
    toggleChatListPin,
    toggleChatMute,
    deleteChat,
    markChatRead,
    markChatUnread,
    isGuest,
    joinChannel,
  } = useApp();
  const typingUserByChatId = useTypingUsers();
  const t = useT();
  const [peekPx, setPeekPx] = useState(0);
  const [cameraDraft, setCameraDraft] = useState<CameraComposeDraft | null>(null);
  const [instagramCameraOpen, setInstagramCameraOpen] = useState(false);
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
  const unreadCount = hasUnread ? Math.max(1, chatUnreadCount(c, me.id)) : 0;
  const listTypingPeerId = resolveListTypingPeerId(c, me.id, typingUserByChatId);
  const peerTypingInList = !!listTypingPeerId;
  const peerOnlineInList = isPeerOnline(c, otherId);
  const displayName = (c.isGroup || c.isChannel) ? c.name || "?" : other?.username || "?";
  const avatarSrc = (c.isGroup || c.isChannel) ? c.avatar : other?.avatar;
  const isQuranPeek = c.id === QURAN_CHANNEL_ID;
  const peekScrollRef = useRef<HTMLDivElement>(null);
  const [peekPrivacyMenuOpen, setPeekPrivacyMenuOpen] = useState(false);
  const [peekTheme, setPeekTheme] = useState<"default" | "blue" | "pink">("default");
  const [peekHideReadStatus, setPeekHideReadStatus] = useState(false);
  const [peekHideTypingStatus, setPeekHideTypingStatus] = useState(false);
  const peekChatTitle = (c.isGroup || c.isChannel) ? (c.name || "") : "@" + (other?.username || "");
  const isPeekChannelMember = c.members.includes(me.id);
  const peekThemeBg = isQuranPeek
    ? "bg-black text-white"
    : peekTheme === "blue"
      ? "bg-blue-50 dark:bg-blue-950"
      : peekTheme === "pink"
        ? "bg-pink-50 dark:bg-pink-950"
        : "bg-background text-foreground";
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const skipAvatarClickRef = useRef(false);
  const cameraLongPressTimerRef = useRef<number | null>(null);
  const cameraPeekArmedRef = useRef(false);
  const cameraDownRef = useRef<{ x0: number; y0: number; pointerId: number; downAt: number } | null>(null);
  const cameraBtnRef = useRef<HTMLButtonElement | null>(null);
  const rowOpenDownRef = useRef<{ x0: number; y0: number; pointerId: number; downAt: number } | null>(null);
  const rowOpenArmedRef = useRef(false);
  const rowOpenLastPullRef = useRef(0);
  const rowOpenVelocityRef = useRef(0);
  const rowOpenMoveSampleRef = useRef({ x: 0, t: 0 });
  const rowPointerEndedRef = useRef(false);
  const rowOpenCommittedRef = useRef(false);
  const rowShellRef = useRef<HTMLDivElement>(null);
  const chatRowOpenId = openChatIdFor(c, me.id);

  const commitRowOpen = useCallback(
    (px: number, mode: "tap" | "swipe-end") => {
      if (rowOpenCommittedRef.current) return;
      rowOpenCommittedRef.current = true;
      window.setTimeout(() => {
        rowOpenCommittedRef.current = false;
      }, 450);
      if (onRowOpenCommit) onRowOpenCommit(chatRowOpenId, px, mode);
      else if (mode === "tap") startTransition(() => onOpenChat(chatRowOpenId));
      else onStackDragEnd?.(chatRowOpenId, px, rowOpenVelocityRef.current);
    },
    [onRowOpenCommit, onOpenChat, onStackDragEnd, chatRowOpenId],
  );

  const setRowPressedVisual = (pressed: boolean) => {
    const el = rowShellRef.current;
    if (!el) return;
    el.classList.toggle("bg-secondary/60", pressed);
    el.style.transform = pressed ? "scale(0.985)" : "";
  };

  const scrollPeekToBottom = useCallback(() => {
    const el = peekScrollRef.current;
    if (!el) return;
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    try {
      el.scrollTo({ top, behavior: "instant" });
    } catch {
      el.scrollTop = top;
    }
  }, []);

  useLayoutEffect(() => {
    if (peekPx <= 0) return;
    scrollPeekToBottom();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollPeekToBottom());
    });
    return () => cancelAnimationFrame(id);
  }, [peekPx, peekMessages.length, scrollPeekToBottom]);

  const clearLongPressTimerOnly = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const closePeekPanel = useCallback(() => {
    peekRef.current = 0;
    setPeekPx(0);
    setPeekPrivacyMenuOpen(false);
  }, []);

  const openPeekAsFullChat = useCallback(() => {
    peekRef.current = 0;
    setPeekPx(0);
    setPeekPrivacyMenuOpen(false);
    startTransition(() => onOpenChat(openChatIdFor(c, me.id)));
  }, [onOpenChat, c, me.id]);

  useEffect(() => {
    if (peekPx > 0) return;
    setPeekPrivacyMenuOpen(false);
    setPeekTheme("default");
    setPeekHideReadStatus(false);
    setPeekHideTypingStatus(false);
  }, [peekPx]);

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
      longPressTimerRef.current = window.setTimeout(() => {
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

  const prevPeekPxForScrollRef = useRef(0);

  useLayoutEffect(() => {
    const el = peekScrollRef.current;
    if (peekPx <= 0) {
      prevPeekPxForScrollRef.current = 0;
      return;
    }
    if (!el) return;
    const prev = prevPeekPxForScrollRef.current;
    prevPeekPxForScrollRef.current = peekPx;
    const scrollPeekToEnd = () => {
      el.scrollTop = el.scrollHeight;
    };
    if (prev <= 0 && peekPx > 0) {
      requestAnimationFrame(scrollPeekToEnd);
      return;
    }
    scrollPeekToEnd();
  }, [peekPx, peekMessages.length]);

  /** iOS/WebKit: يمنع الحاوية الأب من سرقة الإيماءة أثناء الضغط على الكاميرا والسحب */
  useLayoutEffect(() => {
    const el = cameraBtnRef.current;
    if (!el) return;
    const blockParentScroll = (ev: TouchEvent) => {
      if (cameraDownRef.current) ev.preventDefault();
    };
    el.addEventListener("touchmove", blockParentScroll, { passive: false });
    return () => el.removeEventListener("touchmove", blockParentScroll);
  }, []);

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
        if (cap > 0 && px >= cap * PEEK_OPEN_CHAT_FRACTION) {
          if (onRowOpenCommit) onRowOpenCommit(chatRowOpenId, px, "swipe-end");
          else onStackDragEnd?.(chatRowOpenId, px);
        } else if (cap > 0 && px > 0) {
          onStackDragEnd?.(chatRowOpenId, 0);
        } else if (cap > 0 && px < cap * PEEK_CAMERA_TAP_FRACTION && down && Date.now() - down.downAt < 520) {
          setInstagramCameraOpen(true);
        }
        return;
      }
      if (!down) return;
      const duration = Date.now() - down.downAt;
      const distSq = (e.clientX - down.x0) ** 2 + (e.clientY - down.y0) ** 2;
      if (duration < CAMERA_TAP_MAX_DURATION_MS && distSq < 200) {
        setInstagramCameraOpen(true);
      }
    },
    [clearCameraLongPress, onRowOpenCommit, onStackDragEnd, chatRowOpenId],
  );

  const onCameraPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    cameraBtnRef.current = e.currentTarget;
    cameraDownRef.current = { x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, downAt: Date.now() };
    cameraPeekArmedRef.current = false;
    clearCameraLongPress();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* بعض المتصفحات ترفض الالتقاط قبل تعامل صريح */
    }
    cameraLongPressTimerRef.current = window.setTimeout(() => {
      cameraLongPressTimerRef.current = null;
      if (!cameraDownRef.current) return;
      cameraPeekArmedRef.current = true;
      try {
        navigator.vibrate?.(6);
      } catch {
        /* ignore */
      }
    }, CAMERA_LONG_PRESS_MS);
  };

  const rowOpenPullPx = (e: React.PointerEvent) => {
    const down = rowOpenDownRef.current;
    if (!down) return 0;
    /** سحب يسار→يمين فقط — يتبع الإصبع */
    return Math.max(0, e.clientX - down.x0);
  };

  const onRowOpenPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onStackGestureArm?.();
    rowPointerEndedRef.current = false;
    rowOpenCommittedRef.current = false;
    setRowPressedVisual(true);
    rowOpenDownRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      pointerId: e.pointerId,
      downAt: Date.now(),
    };
    rowOpenArmedRef.current = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onRowOpenPointerMove = (e: React.PointerEvent) => {
    const down = rowOpenDownRef.current;
    if (!down || down.pointerId !== e.pointerId) return;
    const dx = e.clientX - down.x0;
    const dy = e.clientY - down.y0;
    if (dx < -6) {
      if (rowOpenArmedRef.current) {
        rowOpenArmedRef.current = false;
        rowOpenDownRef.current = null;
        setRowPressedVisual(false);
        commitRowOpen(rowOpenLastPullRef.current, "swipe-end");
      }
      return;
    }
    const pull = rowOpenPullPx(e);
    if (!rowOpenArmedRef.current) {
      if (pull < ROW_OPEN_ARM_PX || dx <= 0) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && dy * dy > 64) {
        rowOpenDownRef.current = null;
        setRowPressedVisual(false);
        return;
      }
      rowOpenArmedRef.current = true;
      setRowPressedVisual(false);
      rowOpenVelocityRef.current = 0;
      rowOpenMoveSampleRef.current = { x: e.clientX, t: performance.now() };
      onStackChromeHide?.();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (rowOpenArmedRef.current) {
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && dy * dy > 64) {
        rowOpenArmedRef.current = false;
        rowOpenDownRef.current = null;
        setRowPressedVisual(false);
        const abortPx = rowOpenLastPullRef.current;
        commitRowOpen(abortPx, "swipe-end");
        return;
      }
      if (e.cancelable) e.preventDefault();
    }
    const cap = capWidth();
    const px = Math.max(0, Math.min(cap, pull));
    rowOpenLastPullRef.current = px;
    const now = performance.now();
    const dt = now - rowOpenMoveSampleRef.current.t;
    if (dt > 0 && dt < 100) {
      rowOpenVelocityRef.current = (e.clientX - rowOpenMoveSampleRef.current.x) / dt;
    }
    rowOpenMoveSampleRef.current = { x: e.clientX, t: now };
    onStackDrag?.(openChatIdFor(c, me.id), px, rowOpenVelocityRef.current);
  };

  const onRowOpenPointerEnd = (e: React.PointerEvent) => {
    if (rowPointerEndedRef.current) return;
    rowPointerEndedRef.current = true;
    window.setTimeout(() => {
      rowPointerEndedRef.current = false;
    }, 420);

    const down = rowOpenDownRef.current;
    rowOpenDownRef.current = null;
    const armed = rowOpenArmedRef.current;
    rowOpenArmedRef.current = false;
    setRowPressedVisual(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (armed && down) {
      const cap = capWidth();
      const pull = rowOpenPullPx(e);
      const px = Math.max(0, Math.min(cap, pull));
      const vx = rowOpenVelocityRef.current;
      rowOpenLastPullRef.current = px;
      commitRowOpen(px, "swipe-end");
      return;
    }
    if (!down || down.pointerId !== e.pointerId) return;
    const dx = e.clientX - down.x0;
    const dy = e.clientY - down.y0;
    if (Math.hypot(dx, dy) < ROW_TAP_MAX_MOVE_PX) {
      try {
        navigator.vibrate?.(8);
      } catch {
        /* ignore */
      }
      commitRowOpen(0, "tap");
    } else {
      onStackChromeShow?.();
    }
  };

  const onRowOpenPointerCancel = (e?: React.PointerEvent) => {
    const down = rowOpenDownRef.current;
    if (e && down && down.pointerId !== e.pointerId) return;
    const wasArmed = rowOpenArmedRef.current;
    const px = rowOpenLastPullRef.current;
    rowOpenDownRef.current = null;
    rowOpenArmedRef.current = false;
    rowOpenLastPullRef.current = 0;
    rowOpenVelocityRef.current = 0;
    setRowPressedVisual(false);
    if (wasArmed) {
      commitRowOpen(px, "swipe-end");
    } else if (down && !rowOpenCommittedRef.current) {
      const holdMs = Date.now() - down.downAt;
      if (holdMs < 600) commitRowOpen(0, "tap");
      else onStackChromeShow?.();
    } else {
      onStackChromeShow?.();
    }
  };

  const onCameraPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const down = cameraDownRef.current;
    if (!down) return;
    const dxCam = e.clientX - down.x0;
    const openPull = Math.max(0, dxCam);

    if (!cameraPeekArmedRef.current) {
      if (dxCam < -6) return;
      if (openPull >= CAMERA_EARLY_PULL_PX) {
        clearCameraLongPress();
        cameraPeekArmedRef.current = true;
        const cap = capWidth();
        const v = Math.max(0, Math.min(cap, openPull));
        peekRef.current = v;
        onStackDrag?.(chatRowOpenId, v);
        try {
          navigator.vibrate?.(6);
        } catch {
          /* ignore */
        }
        return;
      }
      const dx = e.clientX - down.x0;
      const dy = e.clientY - down.y0;
      if (dy * dy > 85 * 85 && dy * dy > dx * dx * 8) clearCameraLongPress();
      return;
    }

    const cap = capWidth();
    const v = Math.max(0, Math.min(cap, openPull));
    peekRef.current = v;
    onStackDrag?.(chatRowOpenId, v);
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
      {false && peekPx > 0 && (
        <>
          <div className="fixed inset-0 z-[239] flex justify-center pointer-events-none" aria-hidden>
            <div className="h-full w-full max-w-md bg-black/25" />
          </div>
          <div className="fixed inset-0 z-[240] flex justify-center pointer-events-none">
            <div className="relative h-full w-full max-w-md pointer-events-auto">
              <div
                className="absolute top-0 bottom-0 end-0 flex min-h-0 flex-row justify-end overflow-hidden border-s border-border bg-background shadow-xl [transform:translateZ(0)]"
                style={{ width: Math.round(Math.min(peekPx, capWidth())) }}
              >
                <div className={"flex h-full min-h-0 shrink-0 flex-col overflow-hidden " + peekThemeBg} style={{ width: capWidth() }}>
                  <div
                    className={
                      "relative z-40 flex shrink-0 items-center justify-between border-b border-border p-3 " +
                      (isQuranPeek ? "bg-zinc-900 text-zinc-100 border-zinc-700" : "bg-background")
                    }
                  >
                    <button type="button" onClick={closePeekPanel} className="rounded-full p-2 hover:bg-secondary" aria-label="رجوع">
                      <ChevronLeft size={22} />
                    </button>
                    <button
                      type="button"
                      onClick={openPeekAsFullChat}
                      className="flex min-w-0 flex-1 items-center gap-2 text-start justify-start me-2"
                    >
                      <Avatar name={displayName} src={avatarSrc} size={36} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold">
                          {c.isChannel && <Megaphone size={14} className="shrink-0" />}
                          {peekChatTitle}
                        </div>
                        {(c.isGroup || c.isChannel) && (
                          <div className={"text-xs " + (isQuranPeek ? "text-zinc-400" : "text-muted-foreground")}>
                            {c.members.length} {t("members")}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      {!isQuranPeek && !c.isChannel && (
                        <>
                          <button type="button" onClick={openPeekAsFullChat}>
                            <Phone size={20} />
                          </button>
                          <button type="button" onClick={openPeekAsFullChat}>
                            <Video size={20} />
                          </button>
                        </>
                      )}
                      {!c.isGroup && !c.isChannel && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setPeekPrivacyMenuOpen(!peekPrivacyMenuOpen)}
                            className="rounded-full p-1 hover:bg-secondary"
                          >
                            <MoreVertical size={20} />
                          </button>
                          {peekPrivacyMenuOpen && (
                            <div className="absolute left-0 top-8 z-50 w-48 rounded-lg border border-border bg-background shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setPeekHideReadStatus(!peekHideReadStatus);
                                  setPeekPrivacyMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-secondary"
                              >
                                <span>إخفاء حالة القراءة</span>
                                {peekHideReadStatus && <Check size={16} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPeekHideTypingStatus(!peekHideTypingStatus);
                                  setPeekPrivacyMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-secondary"
                              >
                                <span>إخفاء حالة الكتابة</span>
                                {peekHideTypingStatus && <Check size={16} />}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {(c.isGroup || c.isChannel) && (
                        <button type="button" onClick={openPeekAsFullChat}>
                          <SettingsIcon size={20} />
                        </button>
                      )}
                      {!isQuranPeek && !c.isGroup && !c.isChannel && (
                        <select
                          value={peekTheme}
                          onChange={e => setPeekTheme(e.target.value as "default" | "blue" | "pink")}
                          className="rounded-full bg-secondary px-2 py-1 text-xs"
                        >
                          <option value="default">ثيم</option>
                          <option value="blue">أزرق</option>
                          <option value="pink">وردي</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {(c.pinnedMessageIds || []).some(mid => (c.messages || []).some(x => x.id === mid)) && (
                    <div
                      className={
                        "no-scrollbar flex shrink-0 flex-nowrap gap-2 overflow-x-scroll overflow-y-hidden overscroll-x-none border-b px-2 py-1.5 touch-pan-x snap-x snap-mandatory " +
                        (isQuranPeek ? "border-zinc-700 bg-zinc-900/95" : "border-border bg-muted/45")
                      }
                    >
                      {(c.pinnedMessageIds || [])
                        .filter(mid => (c.messages || []).some(x => x.id === mid))
                        .map(mid => {
                          const pm = (c.messages || []).find(x => x.id === mid)!;
                          return (
                            <button
                              key={mid}
                              type="button"
                              onClick={openPeekAsFullChat}
                              className={
                                "flex max-w-[200px] min-w-[118px] shrink-0 snap-start items-center gap-2 rounded-xl border px-2.5 py-1.5 text-start text-xs " +
                                (isQuranPeek ? "border-zinc-600 bg-zinc-800/80 text-zinc-100" : "border-border bg-background/90")
                              }
                            >
                              <Pin size={14} className="shrink-0 opacity-90" />
                              <span className="min-w-0 flex-1 truncate font-medium">{chatReplyPreview(pm)}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {c.isChannel && !isPeekChannelMember && (
                    <div
                      className={
                        "flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 " +
                        (isQuranPeek ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "bg-muted/50")
                      }
                    >
                      <p className="flex-1 text-sm">انضم للقناة للمتابعة والتفاعل</p>
                      <button
                        type="button"
                        onClick={() => joinChannel(c.id)}
                        className="shrink-0 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        انضمام
                      </button>
                    </div>
                  )}

                  <div
                    ref={peekScrollRef}
                    className={
                      "chat-scroll-pane no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-none " +
                      (isQuranPeek ? "bg-zinc-950" : "bg-background")
                    }
                    style={{
                      scrollbarWidth: "none",
                      msOverflowStyle: "none",
                      ...(peekMessages.length === 0 ? { WebkitOverflowScrolling: "touch" as const } : {}),
                    }}
                  >
                    <div
                      className={
                        "flex w-full flex-col gap-2 px-3 pt-3 pb-2 " +
                        (peekMessages.length === 0 ? "min-h-[calc(100%+min(12rem,36vh))] " : "min-h-full ") +
                        (isQuranPeek ? "bg-zinc-950" : "")
                      }
                    >
                      {!c.isGroup && !c.isChannel && other && otherId && (
                        <ChatDmIntroCard
                          other={other}
                          meId={me.id}
                          state={state}
                          isQuran={isQuranPeek}
                          hasMessages={peekMessages.length > 0}
                          onOpenProfile={openPeekAsFullChat}
                        />
                      )}
                      <div dir="ltr" className="flex min-h-0 flex-1 flex-col justify-end gap-2">
                    {peekMessages.map(m => {
                      const mine = isOwnChatMessage(m.senderId, state, { directMessagePeerId: otherId });
                      const sender = userById(state, m.senderId);
                      const mcPeek = messageContent(m);
                      const bareSticker = m.type === "sticker" && (isStickerImageContent(mcPeek) || isStickerVideoContent(mcPeek));
                      const bareImage = m.type === "image" && mcPeek.startsWith("data:") && !m.viewOnce;
                      const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(mcPeek) && !m.viewOnce;
                      const bareVideo = m.type === "video" && !m.viewOnce;
                      const bareVoiceBubble = m.type === "voice";
                      const bareViewOnceMedia =
                        ((m.type === "image" || m.type === "video") && !!m.viewOnce && mcPeek.startsWith("data:")) ||
                        (m.type === "drawing" && !!m.viewOnce);
                      const colClass = bareVideo
                        ? CHAT_INLINE_MEDIA_COL
                        : bareVoiceBubble
                          ? "w-max max-w-[min(92vw,288px)] shrink-0"
                          : bareImage || bareDrawing
                            ? CHAT_INLINE_MEDIA_COL
                            : bareSticker || bareViewOnceMedia
                              ? "w-fit max-w-[min(90vw,280px)] shrink"
                              : CHAT_TEXT_BUBBLE_COL;
                      const bubbleClass =
                        bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing
                          ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible outline-none"
                          : chatBubbleFilledClass(mine, isQuranPeek, peekTheme);
                      return (
                        <ChatSwipeMessageRow
                          key={m.id}
                          message={m}
                          mine={mine}
                          isQuran={isQuranPeek}
                          avatarName={!mine ? sender?.username || "?" : undefined}
                          avatarSrc={!mine ? sender?.avatar : undefined}
                          onAvatarClick={
                            !mine ? () => startTransition(() => onOpenProfile(m.senderId)) : undefined
                          }
                          onSwipeReply={() => {}}
                          onPointerDown={() => {}}
                          onPointerMove={() => {}}
                          onPointerUp={() => {}}
                        >
                          <div
                            className={
                              "relative flex w-max flex-col gap-0.5 " +
                              colClass +
                              " " +
                              (mine ? "items-end self-end" : "items-start self-start")
                            }
                          >
                            <div className={bubbleClass}>
                              {(c.isGroup || c.isChannel) && !mine && (
                                <div className={"mb-0.5 text-[10px] opacity-70 " + (isQuranPeek ? "text-zinc-300" : "")}>@{sender?.username}</div>
                              )}
                              <ChatPeekMessageBody
                                m={m}
                                isQuran={isQuranPeek}
                                viewerId={state.currentUserId ?? me.id}
                                bubbleMine={mine}
                              />
                            </div>
                          </div>
                        </ChatSwipeMessageRow>
                      );
                    })}
                      </div>
                    </div>
                  </div>

                  <div
                    className={
                      "pointer-events-none shrink-0 border-t " + (isQuranPeek ? "border-zinc-700 bg-zinc-900" : "border-border bg-background")
                    }
                    aria-hidden
                  >
                    <div className="px-2 pb-[max(0.5rem,var(--sab))] pt-1" dir="ltr">
                      <div
                        className={
                          "relative flex min-h-[44px] h-12 flex-nowrap items-center gap-1 rounded-full border px-1.5 shadow-sm " +
                          (isQuranPeek
                            ? "border-zinc-800/95 bg-[#1a1a1a]"
                            : "border-border/55 bg-muted/90 dark:border-zinc-800/90 dark:bg-[#1c1c1c]")
                        }
                      >
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/85 " +
                            (isQuranPeek ? "text-zinc-200" : "text-zinc-950 dark:text-white")
                          }
                          aria-hidden
                        >
                          <Camera size={21} strokeWidth={2} />
                        </div>
                        <div
                          className={
                            "pointer-events-none min-h-0 min-w-0 flex-1 rounded-full px-3 py-2 text-start text-[15px] leading-5 " +
                            (isQuranPeek
                              ? "bg-zinc-800/90 text-emerald-200/55"
                              : "bg-transparent text-zinc-500/75 dark:text-zinc-400/65")
                          }
                        >
                          {t("typeMessage")}
                        </div>
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/85 " +
                            (isQuranPeek ? "text-zinc-200" : "")
                          }
                          aria-hidden
                        >
                          <Mic size={21} strokeWidth={2} />
                        </div>
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/85 " +
                            (isQuranPeek ? "text-zinc-200" : "")
                          }
                          aria-hidden
                        >
                          <ImageIcon size={21} strokeWidth={2} />
                        </div>
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/85 " +
                            (isQuranPeek ? "text-zinc-200" : "")
                          }
                          aria-hidden
                        >
                          <Sticker size={21} strokeWidth={2} />
                        </div>
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-foreground/90 " +
                            (isQuranPeek ? "border-zinc-600/80 text-zinc-200" : "border-muted-foreground/40")
                          }
                          aria-hidden
                        >
                          <Plus size={19} strokeWidth={2.25} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════
       * CONVERSATION ROW — Snapchat-inspired, RTL-aware
       *
       * The parent chatInbox has dir="rtl" for Arabic.
       * Each row is a flex-row. In RTL, flex items render
       * from the physical RIGHT side to the LEFT:
       *
       *  DOM order:   [Avatar]  [Content]  [Camera+Meta]
       *  RTL display: RIGHT     CENTER     LEFT
       *  LTR display: LEFT      CENTER     RIGHT
       *
       * ══════════════════════════════════════════════════ */}
      {/* ── Instagram-scale conversation row ── */}
      <div className="relative overflow-visible">
        <div
          ref={rowShellRef}
          className="relative z-20 flex flex-row items-center bg-background transition-[background-color,transform] duration-100 ease-out will-change-transform"
          style={{ minHeight: "84px" }}
          title={t("chatRowLongPressHint")}
        >
          {/* [A] Avatar — FAR RIGHT in RTL / FAR LEFT in LTR */}
          <div
            className="relative shrink-0 flex items-center justify-center touch-manipulation"
            style={{ paddingInlineStart: "14px", paddingInlineEnd: "12px", paddingTop: "10px", paddingBottom: "10px" }}
            onPointerDown={onAvatarPointerDown}
            onPointerMove={onAvatarPointerMove}
            onPointerUp={onAvatarPointerEnd}
            onPointerLeave={onAvatarPointerEnd}
            onPointerCancel={onAvatarPointerEnd}
            onClick={e => {
              e.stopPropagation();
              if (skipAvatarClickRef.current) return;
              if (otherId) startTransition(() => onOpenProfile(otherId));
            }}
          >
            <RSocialAvatar name={displayName} src={avatarSrc} size={58} />
            {peerOnlineInList && !c.isGroup && !c.isChannel && (
              <span
                className="absolute rounded-full bg-emerald-500 ring-2 ring-background"
                style={{ width: 14, height: 14, bottom: 8, insetInlineEnd: 8 }}
                aria-label={state.language === "ar" ? "متصل" : "Online"}
              />
            )}
            {hasUnread && unreadCount > 1 && (
              <span
                className="absolute flex min-w-[20px] items-center justify-center rounded-full bg-[#0095F6] px-1 text-[11px] font-bold text-white ring-2 ring-background"
                style={{ height: 20, top: 6, insetInlineEnd: 4 }}
                aria-hidden
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            {hasUnread && unreadCount <= 1 && (
              <span
                className="absolute rounded-full bg-[#0095F6] ring-2 ring-background"
                style={{ width: 13, height: 13, bottom: 9, insetInlineStart: 9 }}
                aria-hidden
              />
            )}
          </div>

          {/* [B] Name + preview — Center, swipe-to-open */}
          <button
            type="button"
            className="flex min-w-0 flex-1 touch-none flex-col justify-center gap-[5px] text-start outline-none select-none active:opacity-90"
            style={{ paddingTop: "16px", paddingBottom: "16px", paddingInlineEnd: "8px", touchAction: "none" }}
            onPointerDown={onRowOpenPointerDown}
            onPointerMove={onRowOpenPointerMove}
            onPointerUp={onRowOpenPointerEnd}
            onPointerCancel={onRowOpenPointerCancel}
            onClick={e => {
              e.stopPropagation();
              if (skipAvatarClickRef.current || rowOpenArmedRef.current) return;
              if (!rowOpenCommittedRef.current) commitRowOpen(0, "tap");
            }}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              {c.isChannel && <Megaphone size={12} className="shrink-0 text-muted-foreground" aria-hidden />}
              <span className={"min-w-0 truncate text-[16px] leading-tight " + (hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground")}>
                {c.isGroup || c.isChannel ? c.name || "Group" : displayNameFromUsername(other?.username || displayName)}
              </span>
              {isListPinned && <Pin size={11} className="shrink-0 text-amber-500" aria-hidden />}
              {isMuted && <BellOff size={11} className="shrink-0 text-muted-foreground/60" aria-hidden />}
              {!c.isGroup && !c.isChannel && (c.streak?.streakCount ?? 0) > 0 && (
                <StreakBadge streak={c.streak!} />
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              {last?.senderId === me.id && !peerTypingInList && (
                <ChatListOutgoingStatusIcon status={last.status} />
              )}
              <span
                className={
                  "min-w-0 flex-1 truncate text-[14px] leading-snug select-text " +
                  (peerTypingInList
                    ? "font-medium text-[#0095F6]"
                    : hasUnread
                      ? "font-medium text-foreground/80"
                      : "text-muted-foreground")
                }
                onPointerDown={e => e.stopPropagation()}
              >
                {peerTypingInList
                  ? listTypingPreview(state.language)
                  : last
                    ? lastMessagePreview(last)
                    : state.language === "ar"
                      ? "لا رسائل بعد"
                      : "No messages yet"}
              </span>
            </div>
          </button>

          {/* [C] Time + Camera — FAR LEFT in RTL / FAR RIGHT in LTR (horizontal, same row) */}
          <div
            className="flex shrink-0 flex-row items-center gap-1"
            style={{ paddingInlineEnd: "10px", paddingInlineStart: "4px" }}
          >
            {last && (
              <span className="shrink-0 text-[12px] tabular-nums leading-none text-muted-foreground/70 whitespace-nowrap">
                {formatChatListTime(last.createdAt)}
              </span>
            )}
            <button
              type="button"
              ref={cameraBtnRef}
              aria-label={state.language === "ar" ? "كاميرا" : "Camera"}
              className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-muted-foreground transition active:scale-90 hover:bg-secondary"
              style={{ touchAction: "none" }}
              onPointerDown={e => { e.stopPropagation(); onCameraPointerDown(e); }}
              onPointerMove={onCameraPointerMove}
              onPointerUp={finishCameraGesture}
              onPointerCancel={finishCameraGesture}
            >
              <Camera size={21} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Separator starting after avatar */}
        <div
          className="absolute bottom-0 end-0 h-px bg-border/60"
          style={{ insetInlineStart: "84px" }}
          aria-hidden
        />
      </div>

      {/* ── LONG-PRESS CONTEXT MENU ─────────────────────── */}
      {rowMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[84] bg-black/15"
            aria-hidden
            onClick={() => setRowMenu(null)}
          />

          {/* Menu panel */}
          <div
            data-chat-row-menu
            role="menu"
            dir={state.language === "ar" ? "rtl" : "ltr"}
            className="fixed z-[85] w-[min(calc(100vw-32px),252px)] overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-black/8 dark:ring-white/8"
            style={{ left: rowMenu.x, top: rowMenu.y, transform: "translate(-50%, 8px)" }}
          >
            {/* Identity header */}
            <div className="flex items-center gap-2.5 border-b border-zinc-100 dark:border-zinc-800 px-3.5 py-2.5">
              <RSocialAvatar name={displayName} src={avatarSrc} size={30} />
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{displayName}</span>
            </div>

            {/* Menu items */}
            {[
              {
                icon: <Check size={15} className="text-blue-500" />,
                label: state.language === "ar" ? (hasUnread ? "تعيين كمقروء" : "تعيين كغير مقروء") : (hasUnread ? "Mark as read" : "Mark as unread"),
                onClick: () => {
                  if (hasUnread) markChatRead(c.id);
                  else markChatUnread(c.id);
                  chatHapticLight();
                  setRowMenu(null);
                },
              },
              {
                icon: isListPinned
                  ? <Pin size={15} className="text-amber-500" />
                  : <Pin size={15} className="text-zinc-500" />,
                label: isListPinned ? t("chatListUnpin") : t("chatListPin"),
                onClick: () => { toggleChatListPin(c.id); setRowMenu(null); },
              },
              {
                icon: isMuted
                  ? <Bell size={15} className="text-zinc-500" />
                  : <BellOff size={15} className="text-zinc-500" />,
                label: isMuted ? t("chatMenuUnmute") : t("chatMenuMute"),
                onClick: () => { toggleChatMute(c.id); setRowMenu(null); },
              },
              ...(!c.isGroup && !c.isChannel
                ? [{
                    icon: <PenLine size={15} className="text-orange-500" />,
                    label: state.language === "ar" ? "فتح بالوضع المخفي" : "Open in vanish mode",
                    onClick: () => {
                      setRowMenu(null);
                      openChatFromRowTap();
                      window.setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("retweet-chat-vanish-arm", {
                            detail: { chatId: chatRowOpenId },
                          }),
                        );
                      }, 320);
                    },
                  }]
                : []),
            ].map((item, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-3 px-3.5 py-3 text-start text-[14px] hover:bg-secondary active:bg-secondary/80"
                onClick={item.onClick}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="font-medium text-foreground">{item.label}</span>
              </button>
            ))}

            {/* Delete — separated by a divider */}
            <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 px-3.5 py-3 text-start text-[14px] text-destructive hover:bg-destructive/8 active:bg-destructive/15"
              onClick={() => {
                if (typeof window !== "undefined" && window.confirm(t("chatMenuDeleteConfirm"))) deleteChat(c.id);
                setRowMenu(null);
              }}
            >
              <Trash2 size={15} className="shrink-0" />
              <span className="font-medium">{state.language === "ar" ? "مسح المحادثة" : "Delete conversation"}</span>
            </button>
          </div>
        </>
      )}

      <InstagramCamera
        open={instagramCameraOpen}
        language={state.language}
        onClose={() => setInstagramCameraOpen(false)}
        onCapture={cap => setCameraDraft({ kind: cap.kind, dataUrl: cap.dataUrl })}
        onFallback={() => cameraInputRef.current?.click()}
      />
      {cameraDraft && (
        <CameraCaptureShareScreen
          draft={cameraDraft}
          language={state.language}
          mode="chat"
          onSendToChat={payload => {
            sendMessage(c.id, {
              type: payload.type,
              content: payload.content,
              ...(payload.shareText ? { shareText: payload.shareText } : {}),
            });
          }}
          onClose={() => setCameraDraft(null)}
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
  /** إخفاء الشريط السفلي (قائمة إنشاء مجموعة/قناة، إلخ) */
  onHideBottomNav?: (hidden: boolean) => void;
  /** 0…1 أثناء سحب الخروج — 1=مخفي مثل المحادثة مفتوحة، 0=ظاهر بالكامل */
  onExitNavRevealProgress?: (progress: number | null) => void;
  onActiveChatChange?: (chatId: string | null) => void;
  /** إن وُجد: الرجوع من خيط المحادثة يعيد هذا البروفايل (مثلاً بعد «مراسلة» من الملف) */
  resumeThreadToProfileUserId?: string | null;
  onExitThreadToProfile?: (profileUserId: string) => void;
}

export function ChatScreen({
  onOpenProfile,
  initialChatId,
  onConsumedInitialChat,
  onThreadOpen,
  onHideBottomNav,
  onExitNavRevealProgress,
  onActiveChatChange,
  resumeThreadToProfileUserId,
  onExitThreadToProfile,
}: Props) {
  const { state, currentUser, accountSessionKey, openOrCreateChat, setNote, sendMessage, isGuest, replyToProfileNoteAsDm } = useApp();
  const [profileNoteReply, setProfileNoteReply] = useState<{ userId: string; note: string } | null>(null);
  const [profileNoteReplyDraft, setProfileNoteReplyDraft] = useState("");
  const t = useT();
  const me = currentUser!;
  const chatTabActive = useIsTabActive("chat");
  const [openChat, setOpenChat] = useState<string | null>(() => initialChatId ?? null);
  const [showRequests, setShowRequests] = useState(false);
  const [showCreate, setShowCreate] = useState<null | "menu" | "group" | "channel">(null);
  const [showCall, setShowCall] = useState<string | null>(null);
  const [callVideo, setCallVideo] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallRing | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [stackDragChatId, setStackDragChatId] = useState<string | null>(null);
  const [stackProgress, setStackProgress] = useState(() => (initialChatId ? 1 : 0));
  const [stackSpring, setStackSpring] = useState(false);
  const stackCapRef = useRef(DEFAULT_LAYOUT_WIDTH_PX);
  const stackProgressRef = useRef(initialChatId ? 1 : 0);
  const stackOpenDragRef = useRef(false);
  const stackInboxRef = useRef<HTMLDivElement>(null);
  const stackRoomRef = useRef<HTMLDivElement>(null);
  const stackTapTransitionRef = useRef(false);
  const [stackClosingId, setStackClosingId] = useState<string | null>(null);
  const stackChromeHiddenRef = useRef(false);
  const groupSettingsStackProgressRef = useRef(1);
  const openChatThemePickerRef = useRef<() => void>(() => {});
  /** سحب فتح المحادثة — يُخفي الشريط السفلي فوراً (حالة React وليس ref فقط) */
  const [stackChromeHidden, setStackChromeHidden] = useState(false);
  /** سحب خروج من الغرفة المفتوحة — يمنع useLayoutEffect من إعادة ضبط المكدس أثناء الإصبع */
  const stackRoomDismissRef = useRef(false);
  const stackCloseTimerRef = useRef<number | null>(null);
  /** فتح من القائمة (يمين) مقابل إغلاق الغرفة (يسار) — يحدد اتجاه transform */
  const stackRoomDriveRef = useRef<"idle" | "open" | "close">("idle");
  /** قفل أثناء انزلاق فتح/إغلاق المكدس — يمنع سحباً ثانياً أو ارتداداً */
  const stackTransitionLockRef = useRef(false);
  const stackSwipeOpeningRef = useRef(false);
  const stackNavTargetRef = useRef<string | null>(null);
  const stackNavGenerationRef = useRef(0);
  /** يمنع commit مزدوج من pointerend / tap / سحب لأي صف */
  const stackListGestureCommitRef = useRef(false);
  const pendingStackDragRef = useRef<{ chatId: string; px: number; vx: number } | null>(null);
  const stackDragFrameRef = useRef(0);
  const stackOpenVelocityRef = useRef(0);
  /** محادثة السحب الحالية — ref فقط أثناء الإصبع (لا يُركّب ChatRoom حتى commit) */
  const stackDragPreviewIdRef = useRef<string | null>(null);
  const stackDragVisualStartedRef = useRef(false);
  const lastRoomDismissTxRef = useRef(0);
  const stackNavDismissProgressRef = useRef(-1);
  const beginCloseChatThreadRef = useRef<(closingKey: string) => void>(() => {});
  const [stackGestureLocked, setStackGestureLocked] = useState(false);
  /** سحب خروج نشط — يبقي إيماءة الإغلاق مفعّلة حتى لو انخفض stackProgress أثناء السحب */
  const [stackRoomDismissDragging, setStackRoomDismissDragging] = useState(false);

  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent("retweet-chat-create-sheet", {
          detail: { open: !!showCreate },
        }),
      );
    } catch {
      /* ignore */
    }
    return () => {
      try {
        window.dispatchEvent(
          new CustomEvent("retweet-chat-create-sheet", {
            detail: { open: false },
          }),
        );
      } catch {
        /* ignore */
      }
    };
  }, [showCreate]);

  useEffect(() => {
    if (!openChat) setShowGroupSettings(false);
  }, [openChat]);

  const stackLayers = useCallback(
    (): { inboxEl: HTMLDivElement | null; roomEl: HTMLDivElement | null } => ({
      inboxEl: stackInboxRef.current,
      roomEl: stackRoomRef.current,
    }),
    [],
  );

  const applyStackLayerTransforms = useCallback(
    (p: number, animate: boolean) => {
      try {
        let cap = stackCapRef.current;
        if (!(cap > 0)) {
          cap = readSafeStackCapPx(stackInboxRef.current, stackCapRef);
          stackCapRef.current = cap;
        }
        applyOpenStackTransforms(p, cap, stackLayers(), animate, stackTapTransitionRef.current);
      } catch (err) {
        console.warn("[chat-stack-transform]", err);
      }
    },
    [stackLayers],
  );

  /** سحب خروج المحادثة: tx سالب = يمين→يسار — الغرفة تخرج يميناً */
  const applyRoomCloseDrag = useCallback((tx: number, animate: boolean) => {
    try {
      let cap = stackCapRef.current;
      if (!(cap > 0)) {
        cap = readSafeStackCapPx(stackRoomRef.current ?? stackInboxRef.current, stackCapRef);
        stackCapRef.current = cap;
      }
      const clampedTx = Math.max(-cap, Math.min(0, Number.isFinite(tx) ? tx : 0));
      if (!animate && clampedTx === lastRoomDismissTxRef.current) return;
      lastRoomDismissTxRef.current = clampedTx;
      const { inboxEl, roomEl } = stackLayers();
      if (!animate && inboxEl) inboxEl.style.willChange = "transform";
      if (!animate && roomEl) roomEl.style.willChange = "transform";
      const progress = applyCloseStackTransforms(clampedTx, cap, { inboxEl, roomEl }, animate);
      stackProgressRef.current = progress;
      if (animate) {
        if (inboxEl) inboxEl.style.willChange = "auto";
        if (roomEl) roomEl.style.willChange = "auto";
        setStackProgress(progress);
      }
      stackRoomDriveRef.current = "close";
      stackRoomDismissRef.current = true;
      publishChatStackCssProgress(progress);
      if (stackRoomDismissRef.current) {
        if (animate || Math.abs(progress - stackNavDismissProgressRef.current) > 0.012) {
          stackNavDismissProgressRef.current = progress;
          syncStackNavHideProgress(progress);
          onExitNavRevealProgress?.(progress);
        }
      }
    } catch (err) {
      console.warn("[chat-room-close-drag]", err);
      stackRoomDismissRef.current = false;
      stackRoomDriveRef.current = "idle";
    }
  }, [onExitNavRevealProgress, stackLayers]);

  const resetStackToInboxRest = useCallback(
    (opts?: { animate?: boolean }) => {
      stackProgressRef.current = 0;
      stackDragPreviewIdRef.current = null;
      stackDragVisualStartedRef.current = false;
      lastRoomDismissTxRef.current = 0;
      stackNavDismissProgressRef.current = -1;
      setStackProgress(0);
      setStackSpring(!!opts?.animate);
      stackRoomDriveRef.current = "idle";
      stackRoomDismissRef.current = false;
      clearChatStackCssProgress();
      syncStackNavHideProgress(null);
      onExitNavRevealProgress?.(null);
      applyStackLayerTransforms(0, !!opts?.animate);
    },
    [applyStackLayerTransforms, onExitNavRevealProgress],
  );

  const publishStackProgressVisual = useCallback(
    (p: number, commitState = false, animate = false) => {
      const clamped = publishChatStackCssProgress(p);
      stackProgressRef.current = clamped;
      applyStackLayerTransforms(clamped, animate);
      const drivingNav =
        stackOpenDragRef.current ||
        stackTapTransitionRef.current ||
        !!stackDragChatId ||
        !!stackDragPreviewIdRef.current ||
        stackRoomDismissRef.current ||
        stackRoomDriveRef.current === "close";
      if (drivingNav && clamped > 0.001 && clamped < 0.999) {
        syncStackNavHideProgress(clamped);
        onExitNavRevealProgress?.(clamped);
      } else if (!openChat && clamped < 0.02) {
        syncStackNavHideProgress(null);
        onExitNavRevealProgress?.(null);
      }
      if (commitState) setStackProgress(clamped);
    },
    [applyStackLayerTransforms, stackDragChatId, openChat, onExitNavRevealProgress],
  );

  const requestStackRoomScrollBottom = useCallback(() => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("retweet-chat-scroll-bottom"));
    });
  }, []);

  const syncStackProgress = useCallback(
    (p: number) => {
      publishStackProgressVisual(p, true);
    },
    [publishStackProgressVisual],
  );

  const syncStackProgressFromRoom = useCallback(
    (tx: number, phase: "move" | "end" | "start" = "move") => {
      if (tx > 0 && phase !== "end") return;
      /** محادثة مفتوحة: سحب الرجوع من الغرفة له الأولوية — لا يحجبه قفل المكدس */
      if (openChat) {
        const cap = Math.max(260, stackCapRef.current);
        const threshold = Math.max(cap * CHAT_STACK_OPEN_FRACTION, 64);
        if (phase === "start" || phase === "move") {
          if (phase === "start") {
            setStackRoomDismissDragging(true);
            lastRoomDismissTxRef.current = 0;
            stackNavDismissProgressRef.current = -1;
          }
          stackRoomDriveRef.current = "close";
          stackRoomDismissRef.current = true;
          applyRoomCloseDrag(tx, false);
          return;
        }
        setStackRoomDismissDragging(false);
        lastRoomDismissTxRef.current = 0;
        stackNavDismissProgressRef.current = -1;
        const closing = tx <= -threshold;
        if (closing) {
          beginCloseChatThreadRef.current(resolveOpenChatId(openChat));
          return;
        }
        stackRoomDriveRef.current = "idle";
        stackRoomDismissRef.current = false;
        setStackSpring(true);
        applyRoomCloseDrag(0, true);
        window.setTimeout(() => {
          setStackSpring(false);
          stackRoomDriveRef.current = "idle";
          stackRoomDismissRef.current = false;
          setStackRoomDismissDragging(false);
          onExitNavRevealProgress?.(null);
        }, SLIDE_DISMISS_MS);
        return;
      }
      if (stackTransitionLockRef.current || stackSwipeOpeningRef.current || stackGestureLocked) return;
      if (stackOpenDragRef.current) return;
      if (stackDragChatId && !openChat) return;
      if (phase === "start" || phase === "move") {
        stackRoomDriveRef.current = "close";
        stackRoomDismissRef.current = true;
        applyRoomCloseDrag(tx, false);
        return;
      }
      const cap = Math.max(260, stackCapRef.current);
      const threshold = Math.max(cap * CHAT_STACK_OPEN_FRACTION, 64);
      const closing = tx <= -threshold;
      if (!closing) {
        stackRoomDriveRef.current = "idle";
        stackRoomDismissRef.current = false;
      }
      setStackSpring(true);
      applyRoomCloseDrag(closing ? -cap : 0, true);
      window.setTimeout(() => {
        setStackSpring(false);
        if (!closing) {
          stackRoomDriveRef.current = "idle";
          stackRoomDismissRef.current = false;
        }
      }, SLIDE_DISMISS_MS);
    },
    [stackDragChatId, openChat, stackGestureLocked, applyRoomCloseDrag, onExitNavRevealProgress],
  );

  const releaseChatChromeAfterGesture = useCallback(() => {
    stackChromeHiddenRef.current = false;
    setStackChromeHidden(false);
    stackRoomDismissRef.current = false;
    stackRoomDriveRef.current = "idle";
    setStackRoomDismissDragging(false);
    onExitNavRevealProgress?.(null);
  }, [onExitNavRevealProgress]);

  /** يفعّل سحب الشريط السفلي مع الإصبع — دون إخفاء عناصر القائمة */
  const hideStackChrome = useCallback(() => {
    const p = Math.max(stackProgressRef.current, 0.02);
    syncStackNavHideProgress(p);
    onExitNavRevealProgress?.(p);
  }, [onExitNavRevealProgress]);

  const showStackChrome = useCallback(() => {
    if (openChat || stackDragChatId || stackClosingId) return;
    releaseChatChromeAfterGesture();
  }, [openChat, stackDragChatId, stackClosingId, releaseChatChromeAfterGesture]);

  const resolveOpenChatId = useCallback(
    (id: string) => {
      const found = findChatByOpenId(state.chats, id, me.id);
      return found ? openChatIdFor(found, me.id) : id;
    },
    [state.chats, me.id],
  );

  const flushPendingStackDrag = useCallback(() => {
    if (stackDragFrameRef.current) {
      cancelAnimationFrame(stackDragFrameRef.current);
      stackDragFrameRef.current = 0;
    }
    const pending = pendingStackDragRef.current;
    if (!pending) return;
    pendingStackDragRef.current = null;
    const { chatId, px } = pending;
    if (stackListGestureCommitRef.current || stackTransitionLockRef.current) return;
    stackOpenDragRef.current = true;
    stackRoomDriveRef.current = "open";
    stackRoomDismissRef.current = false;
    if (!stackDragVisualStartedRef.current) {
      stackDragVisualStartedRef.current = true;
      setStackClosingId(null);
      setStackSpring(false);
      hideStackChrome();
    }
    const canonical = resolveOpenChatId(chatId);
    stackDragPreviewIdRef.current = canonical;
    let cap = stackCapRef.current;
    if (!(cap > 0)) {
      cap = readSafeStackCapPx(stackInboxRef.current, stackCapRef);
      stackCapRef.current = cap;
    }
    const progress = cap > 0 ? px / cap : 0;
    publishStackProgressVisual(progress, false);
  }, [
    resolveOpenChatId,
    publishStackProgressVisual,
    hideStackChrome,
  ]);

  const isChatThreadFullyOpen = useCallback(
    (id: string) =>
      openChat === id && !stackDragChatId && !stackClosingId && stackProgressRef.current >= 0.98,
    [openChat, stackDragChatId, stackClosingId],
  );

  const releaseStackTransitionLock = useCallback(() => {
    stackTransitionLockRef.current = false;
    stackSwipeOpeningRef.current = false;
    stackOpenDragRef.current = false;
    stackNavTargetRef.current = null;
    stackListGestureCommitRef.current = false;
    setStackGestureLocked(false);
  }, []);

  const commitStackOpen = useCallback(
    (targetId: string) => {
      const canonical = resolveOpenChatId(targetId);
      if (isChatThreadFullyOpen(canonical)) {
        releaseStackTransitionLock();
        return;
      }
      if (stackTransitionLockRef.current && stackNavTargetRef.current !== canonical) return;

      const progress = stackProgressRef.current;
      const sameThread =
        stackDragChatId === canonical ||
        stackDragPreviewIdRef.current === canonical ||
        openChat === canonical ||
        stackNavTargetRef.current === canonical;

      stackTransitionLockRef.current = true;
      stackListGestureCommitRef.current = true;
      stackNavTargetRef.current = canonical;
      stackOpenDragRef.current = false;
      stackDragPreviewIdRef.current = null;
      stackDragVisualStartedRef.current = false;
      stackSwipeOpeningRef.current = false;
      stackRoomDriveRef.current = "open";
      stackRoomDismissRef.current = false;
      setStackGestureLocked(true);
      setStackClosingId(null);
      if (sameThread && progress >= 0.98) {
        ++stackNavGenerationRef.current;
        flushSync(() => {
          stackProgressRef.current = 1;
          setStackProgress(1);
          setStackDragChatId(null);
          setStackSpring(false);
          setOpenChat(canonical);
        });
        onActiveChatChange?.(canonical);
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty(CHAT_STACK_PROGRESS_VAR, "1");
        }
        applyStackLayerTransforms(1, false);
        syncStackNavHideProgress(null);
        onExitNavRevealProgress?.(null);
        releaseStackTransitionLock();
        requestStackRoomScrollBottom();
        return;
      }

      const gen = ++stackNavGenerationRef.current;
      const startProgress = Math.max(progress, 0);
      flushSync(() => {
        setOpenChat(canonical);
        setStackDragChatId(null);
        setStackSpring(true);
        stackProgressRef.current = startProgress;
        setStackProgress(startProgress);
      });
      onActiveChatChange?.(canonical);
      applyStackLayerTransforms(startProgress, false);
      publishStackProgressVisual(1, true, true);
      window.setTimeout(() => {
        if (gen !== stackNavGenerationRef.current) return;
        flushSync(() => {
          stackProgressRef.current = 1;
          setStackProgress(1);
          setStackSpring(false);
        });
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty(CHAT_STACK_PROGRESS_VAR, "1");
        }
        applyStackLayerTransforms(1, false);
        syncStackNavHideProgress(null);
        onExitNavRevealProgress?.(null);
        stackRoomDriveRef.current = "idle";
        releaseStackTransitionLock();
        requestStackRoomScrollBottom();
      }, SLIDE_DISMISS_MS);
    },
    [
      resolveOpenChatId,
      isChatThreadFullyOpen,
      openChat,
      stackDragChatId,
      publishStackProgressVisual,
      applyStackLayerTransforms,
      onActiveChatChange,
      onExitNavRevealProgress,
      releaseStackTransitionLock,
      requestStackRoomScrollBottom,
    ],
  );

  const cancelStackDrag = useCallback(() => {
    flushPendingStackDrag();
    stackDragPreviewIdRef.current = null;
    stackDragVisualStartedRef.current = false;
    stackOpenDragRef.current = false;
    if (!stackDragChatId && !openChat && stackProgressRef.current < 0.02) {
      releaseStackTransitionLock();
      releaseChatChromeAfterGesture();
      return;
    }
    const gen = ++stackNavGenerationRef.current;
    stackTransitionLockRef.current = true;
    stackNavTargetRef.current = null;
    setStackGestureLocked(true);
    stackListGestureCommitRef.current = true;
    setStackSpring(true);
    publishStackProgressVisual(0, true, true);
    window.setTimeout(() => {
      if (gen !== stackNavGenerationRef.current) return;
      flushSync(() => {
        setStackDragChatId(null);
        setStackClosingId(null);
        setOpenChat(null);
      });
      resetStackToInboxRest();
      releaseChatChromeAfterGesture();
      showStackChrome();
      onActiveChatChange?.(null);
      releaseStackTransitionLock();
    }, SLIDE_DISMISS_MS);
  }, [
    flushPendingStackDrag,
    stackDragChatId,
    openChat,
    publishStackProgressVisual,
    resetStackToInboxRest,
    showStackChrome,
    releaseStackTransitionLock,
    releaseChatChromeAfterGesture,
    onActiveChatChange,
  ]);

  const openChatDirect = useCallback(
    (id: string) => {
      const canonical = resolveOpenChatId(id);
      if (isChatThreadFullyOpen(canonical)) return;
      if (stackDragChatId) {
        commitStackOpen(canonical);
        return;
      }

      ++stackNavGenerationRef.current;
      const gen = stackNavGenerationRef.current;
      stackTransitionLockRef.current = true;
      stackListGestureCommitRef.current = true;
      stackOpenDragRef.current = false;
      stackSwipeOpeningRef.current = false;
      stackRoomDriveRef.current = "open";
      stackRoomDismissRef.current = false;
      stackNavTargetRef.current = canonical;
      stackTapTransitionRef.current = true;
      setStackGestureLocked(true);
      setStackClosingId(null);
      setStackDragChatId(null);
      stackDragPreviewIdRef.current = null;
      stackDragVisualStartedRef.current = false;
      hideStackChrome();

      flushSync(() => {
        setOpenChat(canonical);
        stackProgressRef.current = 0;
        setStackProgress(0);
        setStackSpring(false);
      });
      onActiveChatChange?.(canonical);

      applyStackLayerTransforms(0, false);
      publishChatStackCssProgress(0);
      syncStackNavHideProgress(0.04);
      onExitNavRevealProgress?.(0.04);
      try {
        void stackInboxRef.current?.offsetWidth;
        void stackRoomRef.current?.offsetWidth;
      } catch {
        /* ignore */
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (gen !== stackNavGenerationRef.current || !stackTapTransitionRef.current) return;
          syncStackNavHideProgress(1);
          onExitNavRevealProgress?.(1);
          stackProgressRef.current = 1;
          setStackProgress(1);
          setStackSpring(true);
          publishStackProgressVisual(1, true, true);
          window.setTimeout(() => {
            if (gen !== stackNavGenerationRef.current) return;
            setStackSpring(false);
            stackTapTransitionRef.current = false;
            syncStackNavHideProgress(null);
            onExitNavRevealProgress?.(null);
            releaseStackTransitionLock();
            requestStackRoomScrollBottom();
          }, CHAT_TAP_OPEN_MS);
        });
      });
    },
    [
      resolveOpenChatId,
      isChatThreadFullyOpen,
      commitStackOpen,
      stackDragChatId,
      hideStackChrome,
      onActiveChatChange,
      applyStackLayerTransforms,
      publishStackProgressVisual,
      onExitNavRevealProgress,
      releaseStackTransitionLock,
      requestStackRoomScrollBottom,
    ],
  );

  /** إغلاق المحادثة المفتوحة — مسار بسيط بدون portal */
  const closeOpenChat = useCallback(() => {
    ++stackNavGenerationRef.current;
    setOpenChat(null);
    setStackDragChatId(null);
    setStackClosingId(null);
    stackTapTransitionRef.current = false;
    stackChromeHiddenRef.current = false;
    setStackChromeHidden(false);
    releaseStackTransitionLock();
    resetStackToInboxRest();
    onExitNavRevealProgress?.(null);
    onActiveChatChange?.(null);
  }, [releaseStackTransitionLock, resetStackToInboxRest, onExitNavRevealProgress, onActiveChatChange]);

  /** يحرّر سحب/قفل عالق قبل لمسة جديدة أو عند مغادرة التبويب */
  const releaseStuckStackListGesture = useCallback(() => {
    ++stackNavGenerationRef.current;
    flushPendingStackDrag();
    pendingStackDragRef.current = null;
    if (stackDragFrameRef.current) {
      cancelAnimationFrame(stackDragFrameRef.current);
      stackDragFrameRef.current = 0;
    }
    stackOpenVelocityRef.current = 0;
    if (openChat && stackProgressRef.current >= 0.98) {
      releaseStackTransitionLock();
      return;
    }
    setStackDragChatId(null);
    setStackClosingId(null);
    stackDragPreviewIdRef.current = null;
    stackDragVisualStartedRef.current = false;
    releaseStackTransitionLock();
    if (stackProgressRef.current > 0.02) {
      resetStackToInboxRest();
    }
    releaseChatChromeAfterGesture();
    showStackChrome();
  }, [
    openChat,
    flushPendingStackDrag,
    releaseStackTransitionLock,
    resetStackToInboxRest,
    releaseChatChromeAfterGesture,
    showStackChrome,
  ]);

  /** قبل لمسة جديدة: فك أقفال عالقة فقط — دون إعادة ضبط كامل للمكدس */
  const armStackListGesture = useCallback(() => {
    if (stackDragFrameRef.current) {
      cancelAnimationFrame(stackDragFrameRef.current);
      stackDragFrameRef.current = 0;
    }
    pendingStackDragRef.current = null;
    if (openChat && stackProgressRef.current >= 0.98) return;
    if (stackListGestureCommitRef.current || stackTransitionLockRef.current) {
      releaseStackTransitionLock();
    }
    if (!openChat && stackProgressRef.current > 0.02 && stackProgressRef.current < 0.98) {
      ++stackNavGenerationRef.current;
      setStackDragChatId(null);
      setStackClosingId(null);
      resetStackToInboxRest();
      releaseChatChromeAfterGesture();
    }
  }, [
    openChat,
    releaseStackTransitionLock,
    resetStackToInboxRest,
    releaseChatChromeAfterGesture,
  ]);

  const handleRowOpenCommit = useCallback(
    (chatId: string, px: number, mode: "tap" | "swipe-end") => {
      flushPendingStackDrag();
      if (stackListGestureCommitRef.current) {
        if (openChat && stackProgressRef.current >= 0.98) return;
        ++stackNavGenerationRef.current;
        releaseStackTransitionLock();
      }
      if (stackTransitionLockRef.current) {
        const p = stackProgressRef.current;
        if (openChat && p >= 0.98) return;
        if (!openChat && p > 0.03 && p < 0.98) {
          releaseStackTransitionLock();
        } else if (p <= 0.03) {
          releaseStackTransitionLock();
        } else {
          return;
        }
      }
      const canonical = resolveOpenChatId(chatId);
      if (mode === "tap") {
        stackOpenDragRef.current = false;
        stackSwipeOpeningRef.current = false;
        const hadDragPreview = !!(stackDragChatId || stackDragPreviewIdRef.current);
        stackDragPreviewIdRef.current = null;
        stackDragVisualStartedRef.current = false;
        releaseStackTransitionLock();
        if (hadDragPreview) {
          commitStackOpen(canonical);
          return;
        }
        openChatDirect(canonical);
        return;
      }
      const cap = stackCapRef.current;
      const vx = stackOpenVelocityRef.current;
      stackOpenVelocityRef.current = 0;
      const { commit } = chatStackOpenReleaseTarget(px, cap, vx);
      if (commit) commitStackOpen(canonical);
      else cancelStackDrag();
    },
    [
      flushPendingStackDrag,
      commitStackOpen,
      cancelStackDrag,
      openChatDirect,
      openChat,
      resolveOpenChatId,
      stackDragChatId,
      releaseStackTransitionLock,
    ],
  );

  useLayoutEffect(() => {
    try {
      stackCapRef.current = readSafeViewportWidth();
    } catch {
      stackCapRef.current = DEFAULT_LAYOUT_WIDTH_PX;
    }
  }, []);

  useLayoutEffect(() => {
    const el = stackInboxRef.current;
    if (!el) return;
    const upd = () => {
      if (stackTapTransitionRef.current) return;
      try {
        stackCapRef.current = readSafeStackCapPx(el, stackCapRef);
      } catch {
        stackCapRef.current = readSafeViewportWidth();
      }
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (showGroupSettings) return;
    if (
      stackOpenDragRef.current ||
      stackDragChatId ||
      stackClosingId ||
      stackTapTransitionRef.current ||
      stackRoomDismissRef.current ||
      stackRoomDriveRef.current === "close" ||
      stackGestureLocked ||
      stackTransitionLockRef.current ||
      stackSwipeOpeningRef.current
    ) {
      return;
    }
    applyStackLayerTransforms(stackProgress, stackSpring);
  }, [
    showGroupSettings,
    stackProgress,
    stackSpring,
    stackDragChatId,
    stackClosingId,
    stackGestureLocked,
    applyStackLayerTransforms,
  ]);

  /** سحب/تحديد نص غير مكتمل: إعادة الشريط والنوتات إن علِق وضع الإخفاء */
  useEffect(() => {
    if (openChat || stackDragChatId || stackClosingId) return;
    if (!stackRoomDismissDragging && stackProgress <= 0.04) return;
    releaseChatChromeAfterGesture();
    if (stackProgress > 0.04) {
      resetStackToInboxRest();
    }
  }, [
    openChat,
    stackDragChatId,
    stackClosingId,
    stackProgress,
    stackRoomDismissDragging,
    releaseChatChromeAfterGesture,
    resetStackToInboxRest,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onSelectionChange = () => {
      if (openChat || stackDragChatId || stackClosingId) return;
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed) return;
      if (stackProgress <= 0.04) return;
      releaseChatChromeAfterGesture();
      if (stackProgress > 0.04) resetStackToInboxRest();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [
    openChat,
    stackDragChatId,
    stackClosingId,
    stackProgress,
    releaseChatChromeAfterGesture,
    resetStackToInboxRest,
  ]);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 160);
  const inboxListScrollRef = useRef<HTMLDivElement>(null);
  const [noteInput, setNoteInput] = useState(me.note || "");
  const [editingNote, setEditingNote] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [gameType, setGameType] = useState<"billiards" | "football">("billiards");
  useEffect(() => {
    if (!initialChatId) return;
    const found = findChatByOpenId(state.chats, initialChatId, me.id);
    const id = found ? openChatIdFor(found, me.id) : initialChatId;
    if (openChat === id) {
      if (!stackTapTransitionRef.current) syncStackProgress(1);
      onConsumedInitialChat?.();
      return;
    }
    openChatDirect(id);
  }, [initialChatId, onConsumedInitialChat, state.chats, me.id, openChatDirect, openChat, syncStackProgress]);

  /** بعد دمج DM قديم: openChat يبقى id عشوائي — نحدّثه لـ dm:… */
  useEffect(() => {
    if (!openChat || stackTapTransitionRef.current || stackGestureLocked || stackTransitionLockRef.current) {
      return;
    }
    const found = findChatByOpenId(state.chats, openChat, me.id);
    if (!found) return;
    const canonical = openChatIdFor(found, me.id);
    if (canonical !== openChat) setOpenChat(canonical);
  }, [state.chats, openChat, me.id, stackGestureLocked]);

  const prevAccountIdRef = useRef(me.id);
  /** عند تبديل الحساب: إغلاق الغرفة ومسح حالة المكدس (لا يُنفَّذ عند أول mount) */
  useEffect(() => {
    if (prevAccountIdRef.current === me.id) return;
    prevAccountIdRef.current = me.id;
    ++stackNavGenerationRef.current;
    stackListGestureCommitRef.current = false;
    setOpenChat(null);
    setStackDragChatId(null);
    setStackClosingId(null);
    setStackSpring(false);
    setShowCall(null);
    setIncomingCall(null);
    setShowGroupSettings(false);
    stackChromeHiddenRef.current = false;
    setStackChromeHidden(false);
    syncStackProgress(0);
    onActiveChatChange?.(null);
  }, [me.id, syncStackProgress, onActiveChatChange]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (id) {
        const found = findChatByOpenId(state.chats, id, me.id);
        openChatDirect(found ? openChatIdFor(found, me.id) : id);
      }
    };
    window.addEventListener("retweet-open-chat", onOpen);
    return () => window.removeEventListener("retweet-open-chat", onOpen);
  }, [state.chats, me.id, openChatDirect]);

  useEffect(() => {
    const exitingChatBySwipe = stackRoomDismissDragging || !!stackClosingId;
    const fullyOpen =
      !!openChat && !stackDragChatId && !stackClosingId && stackProgressRef.current >= 0.98;
    const threadImmersive = fullyOpen && !exitingChatBySwipe;
    const hideBottomNav = threadImmersive || showCreate != null;
    if (typeof document !== "undefined") {
      if (fullyOpen || stackClosingId) {
        document.documentElement.dataset.chatThreadOpen = "1";
      } else {
        delete document.documentElement.dataset.chatThreadOpen;
      }
    }
    onThreadOpen?.(threadImmersive);
    onHideBottomNav?.(hideBottomNav);
    if (fullyOpen) {
      syncStackNavHideProgress(null);
      onExitNavRevealProgress?.(null);
    }
  }, [
    openChat,
    stackDragChatId,
    stackClosingId,
    stackProgress,
    stackRoomDismissDragging,
    showCreate,
    onThreadOpen,
    onHideBottomNav,
    onExitNavRevealProgress,
  ]);

  useEffect(() => {
    return () => {
      // حماية من بقاء الشريط السفلي مخفي عند unmount أثناء gesture/transition
      onThreadOpen?.(false);
      onHideBottomNav?.(false);
      onExitNavRevealProgress?.(null);
      if (typeof document !== "undefined") {
        delete document.documentElement.dataset.chatThreadOpen;
      }
    };
  }, [onThreadOpen, onHideBottomNav, onExitNavRevealProgress]);

  const beginCloseChatThread = useCallback(function beginCloseChatThreadImpl(closingKey: string) {
      if (stackClosingId) return;
      if (stackCloseTimerRef.current != null) {
        window.clearTimeout(stackCloseTimerRef.current);
        stackCloseTimerRef.current = null;
      }
      ++stackNavGenerationRef.current;
      stackTransitionLockRef.current = true;
      setStackGestureLocked(true);
      stackOpenDragRef.current = false;
      stackRoomDriveRef.current = "close";
      stackRoomDismissRef.current = true;
      setStackClosingId(closingKey);
      setStackDragChatId(null);
      const cap = Math.max(260, stackCapRef.current);
      setStackSpring(true);
      applyRoomCloseDrag(-cap, true);
      window.setTimeout(() => {
        setOpenChat(null);
        onActiveChatChange?.(null);
        setStackClosingId(null);
        setStackSpring(false);
        stackProgressRef.current = 0;
        setStackProgress(0);
        stackRoomDriveRef.current = "idle";
        stackRoomDismissRef.current = false;
        lastRoomDismissTxRef.current = 0;
        stackNavDismissProgressRef.current = -1;
        setStackRoomDismissDragging(false);
        onExitNavRevealProgress?.(null);
        if (typeof document !== "undefined") {
          document.documentElement.style.removeProperty(CHAT_STACK_PROGRESS_VAR);
        }
        applyStackLayerTransforms(0, false);
        showStackChrome();
        releaseStackTransitionLock();
      }, SLIDE_DISMISS_MS);
    },
    [
      stackClosingId,
      applyStackLayerTransforms,
      applyRoomCloseDrag,
      onExitNavRevealProgress,
      onActiveChatChange,
      showStackChrome,
      releaseStackTransitionLock,
    ],
  );
  beginCloseChatThreadRef.current = beginCloseChatThread;

  const applyStackDragVisual = useCallback(
    (chatId: string, px: number) => {
      if (stackSwipeOpeningRef.current) return;
      if (stackListGestureCommitRef.current || stackTransitionLockRef.current) {
        if (!stackOpenDragRef.current && stackProgressRef.current < 0.98) {
          releaseStackTransitionLock();
          stackListGestureCommitRef.current = false;
        } else {
          return;
        }
      }
      stackOpenDragRef.current = true;
      stackRoomDriveRef.current = "open";
      stackRoomDismissRef.current = false;
      if (!stackDragVisualStartedRef.current) {
        stackDragVisualStartedRef.current = true;
        setStackClosingId(null);
        setStackSpring(false);
        hideStackChrome();
      }
      const canonical = resolveOpenChatId(chatId);
      stackDragPreviewIdRef.current = canonical;
      let cap = stackCapRef.current;
      if (!(cap > 0)) {
        cap = readSafeStackCapPx(stackInboxRef.current, stackCapRef);
        stackCapRef.current = cap;
      }
      const progress = cap > 0 ? px / cap : 0;
      publishStackProgressVisual(progress, false);
    },
    [
      resolveOpenChatId,
      publishStackProgressVisual,
      hideStackChrome,
      releaseStackTransitionLock,
    ],
  );

  const onStackDrag = useCallback(
    (chatId: string, px: number, vx = 0) => {
      if (Number.isFinite(vx)) stackOpenVelocityRef.current = vx;
      pendingStackDragRef.current = { chatId, px, vx };
      if (stackDragFrameRef.current) return;
      const tick = () => {
        stackDragFrameRef.current = 0;
        const pending = pendingStackDragRef.current;
        if (!pending) return;
        pendingStackDragRef.current = null;
        applyStackDragVisual(pending.chatId, pending.px);
        if (pendingStackDragRef.current) {
          stackDragFrameRef.current = requestAnimationFrame(tick);
        }
      };
      stackDragFrameRef.current = requestAnimationFrame(tick);
    },
    [applyStackDragVisual],
  );

  useEffect(
    () => () => {
      if (stackDragFrameRef.current) cancelAnimationFrame(stackDragFrameRef.current);
    },
    [],
  );

  const onStackDragEnd = useCallback(
    (chatId: string, px: number, vx?: number) => {
      flushPendingStackDrag();
      if (Number.isFinite(vx)) stackOpenVelocityRef.current = vx ?? 0;
      handleRowOpenCommit(chatId, px, "swipe-end");
    },
    [flushPendingStackDrag, handleRowOpenCommit],
  );

  useLayoutEffect(() => {
    if (!openChat) {
      if (stackClosingId || stackDragChatId) return;
      resetStackToInboxRest();
      return;
    }
    if (stackClosingId || stackDragChatId) return;
    if (stackGestureLocked && !stackTapTransitionRef.current) return;
    if (stackTapTransitionRef.current) return;
    if (stackProgressRef.current >= 0.98) {
      setStackSpring(false);
      applyStackLayerTransforms(1, false);
      return;
    }
  }, [
    openChat,
    stackClosingId,
    stackDragChatId,
    stackGestureLocked,
    applyStackLayerTransforms,
    resetStackToInboxRest,
    releaseStackTransitionLock,
    requestStackRoomScrollBottom,
  ]);

  useEffect(() => {
    return () => {
      clearChatStackCssProgress();
      syncStackNavHideProgress(null);
    };
  }, []);

  /** منع التعليق بنصف انتقال بعد pointercancel أو فقدان اللمس */
  useEffect(() => {
    const recoverHalfOpen = () => {
      flushPendingStackDrag();
      if (openChat || stackListGestureCommitRef.current) return;
      const p = stackProgressRef.current;
      if (p > 0.03 && p < 0.97 && (stackDragChatId || stackDragPreviewIdRef.current)) {
        cancelStackDrag();
      }
    };
    document.addEventListener("pointercancel", recoverHalfOpen, true);
    window.addEventListener("blur", recoverHalfOpen);
    return () => {
      document.removeEventListener("pointercancel", recoverHalfOpen, true);
      window.removeEventListener("blur", recoverHalfOpen);
    };
  }, [openChat, stackDragChatId, cancelStackDrag, flushPendingStackDrag]);

  /** إذا علِق القفل أو السحب بنصف شاشة — إنهاء تلقائي (لا أثناء سحب نشط) */
  useEffect(() => {
    if (stackOpenDragRef.current || stackListGestureCommitRef.current) return;
    const previewId = stackDragPreviewIdRef.current || stackDragChatId;
    const stuck =
      (stackGestureLocked && !openChat && stackProgressRef.current < 0.98) ||
      (!!previewId && !openChat && stackProgressRef.current > 0.03 && stackProgressRef.current < 0.97);
    if (!stuck) return;
    const t = window.setTimeout(() => {
      if (stackOpenDragRef.current || stackListGestureCommitRef.current) return;
      if (openChat && stackProgressRef.current >= 0.98) {
        releaseStackTransitionLock();
        return;
      }
      const id = stackDragPreviewIdRef.current || stackDragChatId;
      const p = stackProgressRef.current;
      if (!id || p <= 0.03) {
        releaseStackTransitionLock();
        resetStackToInboxRest();
        releaseChatChromeAfterGesture();
        return;
      }
      if (p >= 0.97) {
        commitStackOpen(id);
        return;
      }
      if (p > 0.03 && p < 0.97) {
        cancelStackDrag();
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [
    stackGestureLocked,
    stackDragChatId,
    openChat,
    stackProgress,
    commitStackOpen,
    cancelStackDrag,
    releaseStackTransitionLock,
    resetStackToInboxRest,
    releaseChatChromeAfterGesture,
  ]);

  const activeStackChatId = openChat ?? stackDragChatId ?? stackClosingId ?? null;
  const stackChatRaw = activeStackChatId ? findChatByOpenId(state.chats, activeStackChatId, me.id) : null;
  const stackChat = useMemo(
    () => (stackChatRaw ? normalizeChatRecord(stackChatRaw) : null),
    [stackChatRaw],
  );
  const restoreChatStackAfterGroupSettings = useCallback(() => {
    if (!openChat) return;
    const p = Math.max(
      groupSettingsStackProgressRef.current,
      stackProgressRef.current,
      stackProgress,
      0.98,
    );
    stackProgressRef.current = p;
    if (stackProgress < 0.98) setStackProgress(p);
    stackRoomDismissRef.current = false;
    stackRoomDriveRef.current = "idle";
    stackOpenDragRef.current = false;
    stackTransitionLockRef.current = false;
    stackSwipeOpeningRef.current = false;
    releaseStackTransitionLock();
    applyStackLayerTransforms(p, false);
    publishChatStackCssProgress(p);
  }, [openChat, stackProgress, applyStackLayerTransforms, releaseStackTransitionLock]);

  const closeGroupSettings = useCallback(() => {
    restoreChatStackAfterGroupSettings();
    flushSync(() => setShowGroupSettings(false));
    requestAnimationFrame(() => restoreChatStackAfterGroupSettings());
  }, [restoreChatStackAfterGroupSettings]);

  /** بعد إغلاق إعدادات القروب — إعادة ضبط transforms (المكدس يبقى mounted تحت الـ overlay) */
  useLayoutEffect(() => {
    if (showGroupSettings) return;
    if (!openChat || !stackChat) return;
    restoreChatStackAfterGroupSettings();
  }, [showGroupSettings, openChat, stackChat, restoreChatStackAfterGroupSettings]);
  /** معاينة الغرفة أثناء السحب — المحادثة لا تُعتبر «مفتوحة» حتى commit */
  const stackRoomPreviewOnly = !!stackDragChatId && !openChat;
  /** يُعطّل سحب/زر الرجوع أثناء فتح المحادثة — لا أثناء سحب الخروج */
  const chatRoomDismissBlocked =
    stackRoomPreviewOnly ||
    !!stackDragChatId ||
    stackTapTransitionRef.current;
  /** الغرفة: scroll لأسفل فقط بعد اكتمال الفتح — لا أثناء السحب أو الانتقال */
  const stackRoomForceScrollBottom =
    !!openChat && !stackDragChatId && stackProgress >= 0.98 && !stackTapTransitionRef.current;

  useEffect(() => {
    if (!openChat || stackClosingId || stackDragChatId || stackTapTransitionRef.current) return;
    if (stackProgressRef.current < 0.98 || !stackGestureLocked) return;
    const t = window.setTimeout(() => {
      if (
        openChat &&
        stackProgressRef.current >= 0.98 &&
        !stackTapTransitionRef.current &&
        !stackRoomDismissDragging
      ) {
        releaseStackTransitionLock();
      }
    }, SLIDE_DISMISS_MS + 80);
    return () => window.clearTimeout(t);
  }, [
    openChat,
    stackProgress,
    stackClosingId,
    stackDragChatId,
    stackRoomDismissDragging,
    releaseStackTransitionLock,
  ]);

  useLayoutEffect(() => {
    if (!openChat || !stackChat || stackProgressRef.current < 0.5) return;
    if (
      stackOpenDragRef.current ||
      stackRoomDismissRef.current ||
      stackRoomDriveRef.current === "close"
    ) {
      return;
    }
    applyStackLayerTransforms(stackProgressRef.current, false);
  }, [openChat, stackChat?.id, applyStackLayerTransforms]);

  useEffect(() => {
    if (!activeStackChatId || stackChat) return;
    const orphanId = activeStackChatId;
    const t = window.setTimeout(() => {
      if (stackTapTransitionRef.current) return;
      const found = findChatByOpenId(state.chats, orphanId, me.id);
      if (found) return;
      setOpenChat(prev => (prev === orphanId ? null : prev));
      setStackDragChatId(null);
      setStackClosingId(null);
      syncStackProgress(0);
    }, 0);
    return () => window.clearTimeout(t);
  }, [activeStackChatId, stackChat, state.chats, me.id, syncStackProgress]);
  useEffect(() => {
    onActiveChatChange?.(openChat);
  }, [openChat, onActiveChatChange]);

  useLockPageScroll(
    chatTabActive && (!!openChat || !!stackDragChatId || !!stackClosingId),
  );

  const releaseStuckStackListGestureRef = useRef(releaseStuckStackListGesture);
  releaseStuckStackListGestureRef.current = releaseStuckStackListGesture;
  useEffect(() => {
    if (chatTabActive) return;
    releaseStuckStackListGestureRef.current();
  }, [chatTabActive]);

  useEffect(() => {
    const onRing = (e: Event) => {
      const detail = (e as CustomEvent<IncomingCallRing>).detail;
      if (detail?.chatId) setIncomingCall(detail);
    };
    window.addEventListener(INCOMING_CALL_WINDOW_EVENT, onRing);
    return () => window.removeEventListener(INCOMING_CALL_WINDOW_EVENT, onRing);
  }, []);

  useEffect(() => {
    setProfileNoteReplyDraft("");
  }, [profileNoteReply?.userId, profileNoteReply?.note]);

  const myChats = useMemo(
    () => state.chats.filter(c => c.members.includes(me.id) && !c.request),
    [state.chats, me.id],
  );
  const requests = useMemo(
    () => state.chats.filter(c => c.members.includes(me.id) && c.request),
    [state.chats, me.id],
  );
  const messageRequests = useMemo(
    () =>
      requests.filter(
        c => !c.isGroup && !c.isChannel && !(c.messages || []).some(m => m.senderId === me.id),
      ),
    [requests, me.id],
  );

  // نوتك + نوتات من تتابعهم (وليس شرط تبادل متابعة)
  const noteUsers = [
    me,
    ...state.users.filter(
      u =>
        u.id !== me.id &&
        isProfileNoteActive(u) &&
        me.following.includes(u.id) &&
        !me.blocked.includes(u.id) &&
        !u.blocked.includes(me.id),
    ),
  ];

  const filteredChats = useMemo(() => {
    if (!debouncedSearch) return myChats;
    const q = debouncedSearch;
    return myChats.filter(c => {
      if (c.isGroup || c.isChannel) return (c.name || "").toLowerCase().includes(q);
      const otherId = c.members.find(id => id !== me.id);
      const other = otherId ? userById(state, otherId) : null;
      const uname = (other?.username ?? "").toLowerCase();
      const dname = (other?.displayName ?? "").toLowerCase();
      const preview = lastMessagePreview((c.messages || [])[(c.messages || []).length - 1]).toLowerCase();
      return uname.includes(q) || dname.includes(q) || preview.includes(q);
    });
  }, [myChats, debouncedSearch, state.users]);

  /** المثبتة أولاً (حسب ترتيب التثبيت)، ثم الباقي بآخر نشاط رسالة (الأحدث فوق) */
  const sortedFilteredChats = useMemo(() => {
    const pins = me.pinnedChatIds || [];
    const lastActivityAt = (c: Chat) => {
      const hidden = c.hiddenMessageIdsByUser?.[me.id];
      const msgs = c.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (hidden?.includes(m.id)) continue;
        return m.createdAt;
      }
      return 0;
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
  }, [filteredChats, me.id, me.pinnedChatIds]);

  /**
   * يمنع وميض "لا توجد دردشات" أثناء مزامنة الخادم:
   * إذا كانت القائمة قد ظهرت سابقاً ثم صارت فارغة لثوانٍ قليلة،
   * نبقي آخر نسخة مرئية بدلاً من شاشة الفراغ.
   */
  const [lastStableChats, setLastStableChats] = useState<Chat[]>([]);
  const [lastStableAt, setLastStableAt] = useState(0);
  useEffect(() => {
    if (sortedFilteredChats.length > 0) {
      setLastStableChats(sortedFilteredChats);
      setLastStableAt(Date.now());
    }
  }, [sortedFilteredChats]);
  useEffect(() => {
    setLastStableChats([]);
    setLastStableAt(0);
  }, [me.id]);
  const shouldHoldPreviousChats =
    !debouncedSearch &&
    sortedFilteredChats.length === 0 &&
    lastStableChats.length > 0 &&
    Date.now() - lastStableAt < 8000;
  const renderedChats = shouldHoldPreviousChats ? lastStableChats : sortedFilteredChats;

  const stackChatOpenKey = stackChat ? openChatIdFor(stackChat, me.id) : null;

  const stackRoomDismissEnabled = useCallback(
    () =>
      !!openChat &&
      !chatRoomDismissBlocked &&
      !stackTransitionLockRef.current &&
      !stackSwipeOpeningRef.current &&
      !stackClosingId,
    [openChat, chatRoomDismissBlocked, stackClosingId],
  );

  const handleStackRoomAnimatedBack = useCallback(() => {
    releaseStackTransitionLock();
    if (stackClosingId) return true;
    const key = stackChatOpenKey ?? (openChat ? resolveOpenChatId(openChat) : null);
    if (key) {
      beginCloseChatThreadRef.current(key);
      return true;
    }
    closeOpenChat();
    return true;
  }, [stackChatOpenKey, openChat, resolveOpenChatId, closeOpenChat, stackClosingId, releaseStackTransitionLock]);

  const scheduleStackCloseCommit = useCallback(
    (closingKey: string) => {
      if (stackCloseTimerRef.current != null) {
        window.clearTimeout(stackCloseTimerRef.current);
      }
      stackCloseTimerRef.current = window.setTimeout(() => {
        stackCloseTimerRef.current = null;
        beginCloseChatThread(closingKey);
      }, SLIDE_DISMISS_MS);
    },
    [beginCloseChatThread],
  );

  useEffect(
    () => () => {
      if (stackCloseTimerRef.current != null) {
        window.clearTimeout(stackCloseTimerRef.current);
        stackCloseTimerRef.current = null;
      }
    },
    [],
  );

  const showInboxStackActive = !!(activeStackChatId && stackChat);
  const exitingChatBySwipe =
    stackRoomDismissDragging ||
    stackClosingId ||
    stackRoomDriveRef.current === "close";
  /** يختفي شريط البحث/النوتات فقط بعد اكتمال الفتح — أثناء السحب تبقى كل العناصر mounted وتتحرك مع اللوحة */
  const hideInboxTopChrome =
    !!openChat && !exitingChatBySwipe && !stackDragChatId && stackProgress >= 0.99;
  const showInboxSubChrome = !hideInboxTopChrome || exitingChatBySwipe || !!stackDragChatId;
  const showInboxComposeIcon = showInboxSubChrome;
  const showInboxRequestsIcon = showInboxSubChrome;
  const showInboxChatTitle = showInboxSubChrome;
  const showInboxNotesStrip = showInboxSubChrome;
  const hideInboxChrome = hideInboxTopChrome && !showInboxNotesStrip;
  const stackDragProgress =
    stackChatOpenKey &&
    (openChat === stackChatOpenKey ||
      stackDragChatId === stackChatOpenKey ||
      stackClosingId === stackChatOpenKey)
      ? stackProgress
      : 0;
  const stackInboxPointerEvents =
    (stackClosingId === stackChatOpenKey ||
      stackDragChatId === stackChatOpenKey ||
      stackDragProgress < 0.98) &&
    showInboxStackActive
      ? "auto"
      : activeStackChatId && showInboxStackActive
        ? "none"
        : undefined;

  const isRtl = state.language === "ar";

  /* ─────────────────────────────────────────────────────────
   * CHAT INBOX — rebuilt from scratch (Snapchat-inspired)
   * All flex rows use dir-aware ordering:
   *   dir="rtl" → flex-row renders RIGHT→LEFT automatically,
   *   so the first DOM child appears on the FAR RIGHT.
   * ───────────────────────────────────────────────────────── */
  const chatInbox = (
    <div
      ref={stackInboxRef}
      dir={isRtl ? "rtl" : "ltr"}
      className="chat-inbox-pane no-scrollbar relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none bg-background [transform:translateZ(0)]"
      data-no-tab-swipe
      style={stackInboxPointerEvents ? { pointerEvents: stackInboxPointerEvents } : undefined}
    >

      {/* Top area: Instagram Direct structure. No profile avatar here. */}
      {!hideInboxTopChrome && (
        <div className="shrink-0 px-4 pb-2 pt-[max(0.75rem,max(0.75rem, var(--sat)))]">
          <div className="mb-3 flex items-center justify-end">
            {showInboxComposeIcon && (
              <button
                type="button"
                disabled={isGuest}
                aria-label={isRtl ? "إنشاء محادثة أو مجموعة" : "Create chat or group"}
                onClick={() => !isGuest && setShowCreate("menu")}
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-foreground transition active:scale-95 active:bg-secondary disabled:opacity-40"
              >
                <MessageCirclePlus size={25} strokeWidth={1.85} />
              </button>
            )}
          </div>

          <label className="relative block">
            <Search
              size={17}
              strokeWidth={2.25}
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground"
              style={{ insetInlineStart: "0.9rem" }}
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isRtl ? "بحث" : "Search"}
              dir={isRtl ? "rtl" : "ltr"}
              className="h-10 w-full rounded-xl border-0 bg-secondary px-4 text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              style={{ paddingInlineStart: "2.55rem", paddingInlineEnd: "1rem" }}
            />
          </label>
        </div>
      )}

      {/* Guest banner */}
      {isGuest && !hideInboxChrome && (
        <p className="mx-3 mb-1.5 rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 text-center text-[12.5px] text-amber-800 dark:text-amber-200">
          {isRtl ? "وضع الزائر — سجّل الدخول لاستخدام الرسائل" : "Guest mode — log in to use messaging"}
        </p>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 2 — NOTES ROW (Snapchat-style)
          Each note item is a vertical column:
            [Speech bubble with text]  ← occupies a fixed height
            [Circular avatar]
            [Username label]
          The speech bubble has a small downward triangle tail.
          ══════════════════════════════════════════════════ */}
      {showInboxNotesStrip && (
        <div className="shrink-0">
          {/* Scrollable notes strip */}
          <div
            className="no-scrollbar flex overflow-x-auto overscroll-x-contain gap-3 px-4 pb-2"
            style={{ paddingTop: "0.5rem", scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {noteUsers.map((u: any) => {
              const isMine = u.id === me.id;
              const hasNote = !!u.note?.trim();

              const handleNotePress = () => {
                if (isMine) { setEditingNote(true); return; }
                if (isGuest) { notifyGuestActionBlocked(); return; }
                if (hasNote) setProfileNoteReply({ userId: u.id, note: u.note });
                else startTransition(() => onOpenProfile(u.id));
              };

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={handleNotePress}
                  className="shrink-0 flex flex-col items-center gap-1 touch-manipulation active:scale-95 transition-transform outline-none"
                  style={{ width: "72px" }}
                  aria-label={isMine ? (isRtl ? "نوتك" : "My Note") : `@${u.username}`}
                >
                  {/* Speech bubble container — fixed height so avatars align */}
                  <div className="flex flex-col items-center" style={{ minHeight: "46px", justifyContent: "flex-end" }}>
                    {hasNote ? (
                      <div
                        className={
                          "relative rounded-[14px] px-2.5 py-[7px] text-center text-[11.5px] leading-[1.3] font-medium shadow-sm " +
                          (isMine
                            ? "bg-secondary text-foreground"
                            : "bg-secondary text-foreground " +
                              (profileNoteReply?.userId === u.id ? "ring-2 ring-primary ring-offset-1" : ""))
                        }
                        style={{ maxWidth: "84px", wordBreak: "break-word" }}
                        dir="auto"
                      >
                        <span className="line-clamp-2">{u.note}</span>
                        {/* Downward tail */}
                        <span
                          className="absolute left-1/2 -translate-x-1/2 h-[7px] w-[7px] rotate-45 bg-secondary"
                          style={{ bottom: "-3.5px" }}
                          aria-hidden
                        />
                      </div>
                    ) : isMine ? (
                      <div className="rounded-[14px] bg-secondary px-2.5 py-[7px] text-[11px] text-muted-foreground text-center font-medium">
                        {isRtl ? "نوتك" : "My Note"}
                      </div>
                    ) : null}
                  </div>

                  {/* Avatar — with + badge for self */}
                  <div className="relative" style={{ marginTop: hasNote ? "8px" : "10px" }}>
                    <RSocialAvatar name={u.username} src={u.avatar} size={62} />
                    {isMine && (
                      <span
                        className="absolute flex items-center justify-center rounded-full bg-background text-foreground shadow-md"
                        style={{ bottom: -3, right: -3, width: 22, height: 22, border: "2.5px solid var(--background, white)" }}
                        aria-hidden
                      >
                        <Plus size={12} strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  {/* Username */}
                  <span className="mt-1 w-full truncate text-center text-[12px] font-medium leading-tight text-muted-foreground" style={{ maxWidth: "74px" }}>
                    {isMine ? (isRtl ? "أنت" : "You") : u.username}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Note reply panel */}
          {profileNoteReply && (
            <div
              className="mx-3 mb-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
              dir={isRtl ? "rtl" : "ltr"}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-[12.5px] text-muted-foreground flex-1 min-w-0">
                  {isRtl ? "ردّ على نوت " : "Reply to note — "}
                  <span className="font-semibold text-foreground">@{userById(state, profileNoteReply.userId)?.username ?? "…"}</span>
                  {isRtl && <span className="text-muted-foreground"> — يُرسل في الخاص</span>}
                </p>
                <button type="button" onClick={() => setProfileNoteReply(null)} className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-secondary">
                  <X size={16} />
                </button>
              </div>
              <p className="rounded-xl bg-secondary/70 px-2.5 py-1.5 text-[12.5px] text-foreground/90 line-clamp-2 mb-2">{profileNoteReply.note}</p>
              <textarea
                value={profileNoteReplyDraft}
                onChange={e => setProfileNoteReplyDraft(e.target.value)}
                placeholder={isRtl ? "اكتب ردك…" : "Type your reply…"}
                rows={2}
                disabled={isGuest}
                className="w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isGuest || !profileNoteReplyDraft.trim()}
                  onClick={() => {
                    if (isGuest) { notifyGuestActionBlocked(); return; }
                    const res = replyToProfileNoteAsDm({ friendId: profileNoteReply.userId, noteText: profileNoteReply.note, replyText: profileNoteReplyDraft.trim() });
                    if (res) { setProfileNoteReply(null); openChatDirect(res.chatId); }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  <Send size={14} strokeWidth={2.25} />
                  {isRtl ? "إرسال" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => { const id = profileNoteReply.userId; setProfileNoteReply(null); startTransition(() => onOpenProfile(id)); }}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground hover:bg-secondary"
                >
                  {isRtl ? "الملف" : "Profile"}
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-zinc-100 dark:bg-zinc-800 mx-0" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 3 — MESSAGES SUB-HEADER
          RTL: "المحادثات" on FAR RIGHT, "الطلبات" on FAR LEFT
          (dir="rtl" reverses the flex-row order)
          ══════════════════════════════════════════════════ */}
      {showInboxChatTitle && (
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
          <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50">
            {isRtl ? "المحادثات" : "Chats"}
          </span>
          <button
            type="button"
            onClick={() => setShowRequests(true)}
            className="touch-manipulation text-[13px] font-semibold text-[#0095F6] active:opacity-70"
          >
            {isRtl
              ? messageRequests.length > 0
                ? `طلبات المراسلة (${messageRequests.length})`
                : "طلبات المراسلة"
              : messageRequests.length > 0
                ? `Requests (${messageRequests.length})`
                : "Requests"}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          SECTION 4 — CONVERSATION LIST
          Each row is rendered by ChatListRowWithPeek
          ══════════════════════════════════════════════════ */}
      <div
        ref={inboxListScrollRef}
        className="chat-inbox-scroll no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-no-tab-swipe
      >
        {shouldHoldPreviousChats && renderedChats.length === 0 && <ChatInboxSkeleton rows={6} />}

        {renderedChats.length > 0 && (
          <ChatInboxVirtualList
            chats={renderedChats}
            scrollParentRef={inboxListScrollRef}
            renderRow={c => (
              <ChatListRowWithPeek
                chat={c}
                me={me}
                onOpenChat={openChatDirect}
                onOpenProfile={onOpenProfile}
                onStackDrag={onStackDrag}
                onStackDragEnd={onStackDragEnd}
                onStackChromeHide={hideStackChrome}
                onStackChromeShow={showStackChrome}
                onRowOpenCommit={handleRowOpenCommit}
                onStackGestureArm={armStackListGesture}
              />
            )}
          />
        )}

        {/* Empty state */}
        {renderedChats.length === 0 && !search.trim() && !shouldHoldPreviousChats && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <MessageCirclePlus size={28} className="text-zinc-400" />
            </span>
            <p className="text-[15px] font-semibold text-zinc-500 dark:text-zinc-400">{t("noChats")}</p>
            <p className="text-[13px] text-zinc-400">{isRtl ? "ابدأ محادثة جديدة" : "Start a new conversation"}</p>
          </div>
        )}
        {renderedChats.length === 0 && !!debouncedSearch && !shouldHoldPreviousChats && (
          <p className="py-12 text-center text-[14px] text-zinc-400">
            {isRtl ? "لا نتائج لـ «" + search + "»" : `No results for "${search}"`}
          </p>
        )}

        <div className="h-3" aria-hidden />
      </div>

      {/* ══════════════════════════════════════════════════
          MODALS & OVERLAYS
          ══════════════════════════════════════════════════ */}

      {/* Edit note modal — full-screen, Instagram Notes style */}
      {editingNote && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-xl"
          onClick={() => setEditingNote(false)}
        >
          <div
            dir={isRtl ? "rtl" : "ltr"}
            className="relative w-full max-w-xs mx-auto flex flex-col items-center gap-5 px-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setEditingNote(false)}
              className="absolute top-[max(0.75rem,var(--sat))] end-4 rounded-full bg-black/40 p-1.5 text-white/90 backdrop-blur"
              aria-label={t("cancel")}
            >
              <X size={18} />
            </button>

            {/* Center avatar */}
            <div className="mt-[3.5rem] flex flex-col items-center gap-2">
              <RSocialAvatar
                name={me.username}
                src={me.avatar}
                size={82}
                className="ring-2 ring-white/80 shadow-[0_0_24px_rgba(0,0,0,0.65)]"
              />

              {/* Note bubble over avatar */}
              <div className="relative mt-3 max-w-[220px]">
                <div className="rounded-2xl bg-white/95 px-4 py-2.5 text-center text-[13px] font-medium text-zinc-900 shadow-lg">
                  <input
                    value={noteInput}
                    onChange={e => setNoteInput(e.target.value)}
                    maxLength={60}
                    autoFocus
                    dir={isRtl ? "rtl" : "ltr"}
                    placeholder={isRtl ? "أكتب نوت قصيرة…" : "Share a short note…"}
                    className="w-full bg-transparent text-center text-[13px] font-medium text-zinc-900 placeholder:text-zinc-400 outline-none border-none"
                  />
                </div>
                <div
                  className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white/95"
                  style={{ bottom: "-6px", boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}
                  aria-hidden
                />
              </div>

              {/* Subtitle */}
              <p className="mt-3 text-[11px] text-white/75">
                {isRtl ? "مرئية للمتابعين لمدة ٢٤ ساعة" : "Visible to followers for 24 hours"}
              </p>
            </div>

            {/* Note actions: music / location / stickers (UI فقط حالياً) */}
            <div className="mt-4 flex items-center justify-center gap-4 text-white/90">
              <button
                type="button"
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 px-3 py-2 text-[11px] backdrop-blur hover:bg-white/16 active:scale-95 transition"
                onClick={() => {
                  // TODO: فتح Music Picker حقيقي وربط مع backend
                  const base = noteInput.replace(/^🎵[^|]*\|\s*/u, "");
                  const demo = isRtl ? "🎵 أغنية تجريبية | " : "🎵 Demo song | ";
                  setNoteInput(demo + base.trim());
                }}
              >
                <span className="text-lg leading-none">🎵</span>
                <span>{isRtl ? "موسيقى" : "Music"}</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 px-3 py-2 text-[11px] backdrop-blur hover:bg-white/16 active:scale-95 transition"
                onClick={() => {
                  const base = noteInput.replace(/^📍[^|]*\|\s*/u, "");
                  const demo = isRtl ? "📍 الرياض | " : "📍 Riyadh | ";
                  setNoteInput(demo + base.trim());
                }}
              >
                <span className="text-lg leading-none">📍</span>
                <span>{isRtl ? "الموقع" : "Location"}</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 px-3 py-2 text-[11px] backdrop-blur hover:bg-white/16 active:scale-95 transition"
                onClick={() => {
                  const extra = isRtl ? " 😄" : " 😄";
                  if (!noteInput.includes("😄")) setNoteInput((v) => (v || "مزاج جميل") + extra);
                }}
              >
                <span className="text-lg leading-none">😊</span>
                <span>{isRtl ? "المزاج" : "Mood"}</span>
              </button>
            </div>

            {/* Save / Cancel buttons */}
            <div className="mt-6 flex w-full max-w-xs gap-2">
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="flex-1 rounded-2xl bg-white/10 py-2.5 text-[13px] font-semibold text-white hover:bg-white/16 active:scale-[0.97] transition"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNote(noteInput.trim());
                  setEditingNote(false);
                }}
                className="flex-1 rounded-2xl bg-white text-[13px] font-bold text-zinc-900 py-2.5 shadow-[0_4px_18px_rgba(0,0,0,0.35)] active:scale-[0.97] transition"
              >
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New chat / group / channel picker */}
      {showCreate === "menu" && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50" onClick={() => setShowCreate(null)}>
          <div dir={isRtl ? "rtl" : "ltr"} className="w-full max-w-md rounded-t-3xl bg-background p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden />
            <button onClick={() => setShowCreate("group")} className="flex w-full items-center gap-3 rounded-2xl p-4 hover:bg-secondary active:bg-secondary text-[15px] font-medium">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30"><Users size={20} className="text-blue-600" /></span>
              {t("newGroup")}
            </button>
            <button onClick={() => setShowCreate("channel")} className="flex w-full items-center gap-3 rounded-2xl p-4 hover:bg-secondary active:bg-secondary text-[15px] font-medium">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30"><Megaphone size={20} className="text-purple-600" /></span>
              {t("newChannel")}
            </button>
          </div>
        </div>
      )}

      {/* Games modal (legacy - kept for backward compat) */}
      {showGames && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowGames(false)}>
          <div className="w-full max-w-md mx-auto rounded-t-3xl bg-background p-5" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-center text-base font-bold">اختر لعبة 🎮</h3>
            <p className="text-center text-sm text-muted-foreground">افتح محادثة خاصة أولاً ثم اضغط + لإنشاء لعبة.</p>
          </div>
        </div>
      )}
    </div>
  );

  if (showCall) {
    return (
      <CallScreen
        chatId={showCall}
        calleePeerId={incomingCall?.chatId === showCall ? incomingCall.fromUserId : undefined}
        video={incomingCall?.chatId === showCall ? incomingCall.video : callVideo}
        onClose={() => {
          setShowCall(null);
          setCallVideo(false);
          setIncomingCall(null);
        }}
      />
    );
  }
  if (showRequests)
    return (
      <RequestsList
        chats={messageRequests}
        onBack={() => setShowRequests(false)}
        onOpen={(id) => {
          setShowRequests(false);
          openChatDirect(id);
        }}
        onOpenProfile={onOpenProfile}
      />
    );
  if (showCreate === "group" || showCreate === "channel")
    return (
      <CreateGroup
        mode={showCreate}
        onBack={() => setShowCreate(null)}
        onCreated={(id) => {
          setShowCreate(null);
          openChatDirect(id);
        }}
      />
    );

  const caller = incomingCall ? userById(state, incomingCall.fromUserId) : null;

  return (
    <>
      {incomingCall && !showCall && (
        <div
          className={
            "fixed inset-x-0 z-[250] mx-auto max-w-md px-3 " +
            (hideInboxChrome
              ? "bottom-[max(0.75rem,var(--sab))]"
              : "bottom-[calc(5.5rem+var(--sab))]")
          }
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
            <Avatar name={caller?.username || "?"} src={caller?.avatar} size={44} />
            <div className="min-w-0 flex-1 text-start">
              <div className="text-sm font-semibold">مكالمة {incomingCall.video ? "فيديو" : "صوتية"}</div>
              <div className="truncate text-xs text-muted-foreground">@{caller?.username || "?"}</div>
            </div>
            <button
              type="button"
              className="rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              onClick={() => {
                setCallVideo(incomingCall.video);
                setShowCall(incomingCall.chatId);
              }}
            >
              قبول
            </button>
            <button
              type="button"
              className="rounded-full bg-secondary px-3 py-2 text-xs font-semibold"
              onClick={() => setIncomingCall(null)}
            >
              رفض
            </button>
          </div>
        </div>
      )}
      <div className="chat-stack-scene relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {chatInbox}
        <ChatStackRoomGestureShell
          roomRef={stackRoomRef}
          widthCapRef={stackCapRef}
          interactive={!!openChat}
        >
          {(openChat || stackClosingId) && stackChat ? (
            <ChatRoom
              key={`${accountSessionKey}-${stackChat.id}`}
              chat={stackChat}
              embedInStack
              stackFullyOpen={!!openChat}
              roomDismissBlocked={chatRoomDismissBlocked}
              forceScrollToBottom={stackRoomForceScrollBottom}
              onStackProgress={openChat ? syncStackProgressFromRoom : undefined}
              onAnimatedBack={openChat ? handleStackRoomAnimatedBack : undefined}
              onBack={openChat ? closeOpenChat : () => {}}
              onCall={
                openChat
                  ? video => {
                      setCallVideo(video);
                      setShowCall(stackChat.id);
                    }
                  : () => {}
              }
              onOpenSettings={
                openChat
                  ? () => {
                      groupSettingsStackProgressRef.current = Math.max(
                        stackProgressRef.current,
                        stackProgress,
                        0.98,
                      );
                      setShowGroupSettings(true);
                    }
                  : () => {}
              }
              onOpenProfile={onOpenProfile}
              registerOpenThemePicker={open => {
                openChatThemePickerRef.current = open;
              }}
            />
          ) : null}
        </ChatStackRoomGestureShell>
      </div>
      {showGroupSettings &&
      openChat &&
      stackChat &&
      (stackChat.isGroup || stackChat.isChannel) ? (
        <div className="pointer-events-auto fixed inset-0 z-[220] mx-auto flex max-w-md flex-col bg-background">
          <GroupDetailsScreen
            embeddedInChatStack
            chat={stackChat}
            messages={stackChat.messages}
            onBack={closeGroupSettings}
            onOpenProfile={onOpenProfile}
            onOpenChatTheme={() => {
              closeGroupSettings();
              window.setTimeout(() => openChatThemePickerRef.current(), 0);
            }}
            onCreateNewGroup={() => {
              closeGroupSettings();
              setShowCreate("group");
            }}
          />
        </div>
      ) : null}
    </>
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
  const requestRows = chats;

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
    <SlideDismissShell onDismiss={onBack} variant="inline" className="flex-1 bg-background">
    <div className="flex min-h-[50vh] flex-col p-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <SlideDismissBackButton onDismiss={onBack} className="rounded-full p-2 hover:bg-secondary" aria-label={t("close")}>
          <ArrowRight />
        </SlideDismissBackButton>
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
    </SlideDismissShell>
  );
}

function CreateGroup({ mode, onBack, onCreated }: { mode: "group" | "channel"; onBack: () => void; onCreated: (id: string) => void }) {
  const { state, currentUser, createGroup, createChannel } = useApp();
  const t = useT();
  const me = currentUser!;
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(mode === "channel" ? "📢" : "👥");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const others = state.users.filter(u => u.id !== me.id && !me.blocked.includes(u.id));

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    void (async () => {
      setAvatarBusy(true);
      try {
        const token = getApiToken();
        if (apiBackendEnabled() && token) {
          const up = await apiUploadMedia(token, f, { timeoutMs: 60_000 });
          if (up.ok) {
            setAvatar(up.url);
            return;
          }
          alert(up.error || "فشل رفع الصورة");
          return;
        }
        const r = new FileReader();
        r.onload = () => setAvatar(String(r.result));
        r.readAsDataURL(f);
      } finally {
        e.target.value = "";
        setAvatarBusy(false);
      }
    })();
  };

  const minGroupMembers = 2;
  const canCreateGroup = mode === "group" ? selected.length >= minGroupMembers : true;

  const create = () => {
    if (mode === "group" && selected.length < minGroupMembers) return;
    const c =
      mode === "group"
        ? createGroup(name || "مجموعة", avatar, selected)
        : createChannel(name || "قناة", avatar, selected);
    if (c) onCreated(c.id);
  };

  return (
    <SlideDismissShell onDismiss={onBack} variant="inline" className="flex-1 bg-background">
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-4 flex shrink-0 items-center gap-2">
          <SlideDismissBackButton onDismiss={onBack}>
            <ArrowRight />
          </SlideDismissBackButton>
          <h2 className="font-bold">{mode === "group" ? t("newGroup") : t("newChannel")}</h2>
        </div>
        {step === 1 ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2">
              <label className="relative cursor-pointer">
                <Avatar name={name || "مجموعة"} src={avatar} size={96} />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs text-white opacity-0 hover:opacity-100">
                  {avatarBusy ? "…" : "صورة"}
                </span>
                <input type="file" accept="image/*" className="sr-only" onChange={onAvatarFile} disabled={avatarBusy} />
              </label>
              <select
                value={avatar}
                onChange={e => setAvatar(e.target.value)}
                className="rounded-xl bg-secondary px-3 py-1.5 text-sm"
              >
                {(mode === "channel"
                  ? ["📢", "📰", "📚", "🕌", "⭐", "🎙️"]
                  : ["👥", "🎉", "🚀", "💬", "🌟", "❤️", "🔥", "🎨"]
                ).map(e => (
                  <option key={e} value={e}>
                    {e} أيقونة
                  </option>
                ))}
              </select>
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={mode === "group" ? t("groupName") : t("channelName")}
              className="w-full rounded-2xl bg-input px-4 py-3 outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!name.trim()) return alert("اكتب اسم");
                setStep(2);
              }}
              className="w-full rounded-2xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              {t("next")}
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="shrink-0 text-sm text-muted-foreground">
              {mode === "group" ? t("addMembers") : "اختر الأعضاء (اختياري)"}
            </p>
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="ابحث بالاسم…"
              className="mt-2 w-full shrink-0 rounded-2xl bg-input px-4 py-2.5 text-sm outline-none"
            />
            <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-y-contain">
              {others
                .filter(u => {
                  const q = memberSearch.trim().toLowerCase();
                  if (!q) return true;
                  return u.username.toLowerCase().includes(q);
                })
                .map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      setSelected(s => (s.includes(u.id) ? s.filter(x => x !== u.id) : [...s, u.id]))
                    }
                    className="flex w-full touch-manipulation items-center gap-3 rounded-2xl p-2.5 hover:bg-secondary active:bg-secondary/80"
                  >
                    <Avatar name={u.username} src={u.avatar} size={44} />
                    <div className="flex-1 text-start text-[15px] font-medium">@{u.username}</div>
                    {selected.includes(u.id) && <Check className="shrink-0 text-[#0095F6]" size={22} />}
                  </button>
                ))}
            </div>
            <div className="shrink-0 border-t border-border pt-3 pb-[max(0.25rem,var(--sab))]">
              {mode === "group" && !canCreateGroup && (
                <p className="mb-2 text-center text-xs text-muted-foreground">{t("groupPickTwoHint")}</p>
              )}
              <button
                type="button"
                disabled={!canCreateGroup}
                onClick={create}
                className={
                  "w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-opacity " +
                  (canCreateGroup
                    ? "bg-[#0095F6] text-white active:opacity-90"
                    : "cursor-not-allowed bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500")
                }
              >
                {t("create_")}
                {mode === "group" ? ` (${selected.length})` : selected.length > 0 ? ` (${selected.length})` : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </SlideDismissShell>
  );
}

// ─── Pool Game Invite Bubble ─────────────────────────
function PoolGameInviteBubble({
  message, mine, meId, otherId, chatId, onJoin,
}: {
  message: import("@/lib/types").Message;
  mine: boolean;
  meId: string;
  otherId: string;
  chatId: string;
  onJoin: (roomId: string) => void;
}) {
  const [status, setStatus] = useState<"pending" | "joining" | "active" | "finished">("pending");
  const mc = messageContent(message);
  // format: __game_invite__:pool:<inviterId>:<msgId>
  const parts = mc.split(":");
  const inviterId = parts[2] ?? "";
  const isInviter = meId === inviterId;
  const canJoin = !isInviter && status === "pending";

  const join = async () => {
    if (!canJoin) return;
    setStatus("joining");
    try {
      const { getApiBaseUrl, getApiToken } = await import("@/lib/apiBackend");
      const base = getApiBaseUrl().replace(/\/$/, "");
      const token = getApiToken();
      const r = await fetch(`${base}/v1/games/pool/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chatId,
          opponentId: inviterId,
          inviteMessageId: message.id,
        }),
      });
      if (!r.ok) { setStatus("pending"); alert("تعذّر إنشاء الغرفة"); return; }
      const data = await r.json() as { room: { roomId: string } };
      setStatus("active");
      onJoin(data.room.roomId);
    } catch {
      setStatus("pending");
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br from-[#1a3a1a] to-[#0d1f0d] p-4 text-center shadow-lg" style={{ minWidth: 200 }}>
      <div className="text-4xl">🎱</div>
      <div>
        <p className="font-bold text-white text-sm">دعوة لعبة بلياردو</p>
        <p className="text-xs text-green-400 mt-0.5">
          {isInviter ? "في انتظار الخصم…" : "دعاك للعب بلياردو 8 كرات"}
        </p>
      </div>
      {!isInviter && status === "pending" && (
        <button
          className="rounded-xl bg-green-600 px-6 py-2 text-sm font-bold text-white shadow hover:bg-green-500 active:scale-95"
          onClick={join}
        >
          انضم للعبة
        </button>
      )}
      {status === "joining" && (
        <span className="text-xs text-green-400 animate-pulse">جاري الانضمام…</span>
      )}
      {status === "active" && (
        <span className="text-xs text-yellow-400">🎮 اللعبة جارية</span>
      )}
      {isInviter && (
        <span className="text-xs text-gray-400">أرسلت الدعوة</span>
      )}
    </div>
  );
}

function ChatRoom({
  chat: chatInput,
  onBack,
  onCall,
  onOpenSettings,
  onOpenProfile,
  registerOpenThemePicker,
  embedInStack = false,
  stackFullyOpen = true,
  roomDismissBlocked = false,
  forceScrollToBottom = false,
  onStackProgress,
  onAnimatedBack,
}: {
  chat: Chat;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onOpenSettings: () => void;
  onOpenProfile: (id: string) => void;
  registerOpenThemePicker?: (open: () => void) => void;
  embedInStack?: boolean;
  stackFullyOpen?: boolean;
  roomDismissBlocked?: boolean;
  forceScrollToBottom?: boolean;
  onStackProgress?: (tx: number, phase?: "move" | "end" | "start") => void;
  onAnimatedBack?: () => boolean;
}) {
  const {
    state,
    currentUser,
    sendMessage,
    loadChatMessages,
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
    mergeDiscoveredUsers,
    isGuest,
  } = useApp();
  const typingUserByChatId = useTypingUsers();
  const t = useT();
  const chat = useMemo(() => normalizeChatRecord(chatInput), [chatInput]);
  const viewerId = resolveActiveViewerId(state) ?? currentUser?.id ?? "";
  const meId = currentUser?.id ?? "";
  const [text, setText] = useState("");
  const [mentionPick, setMentionPick] = useState<{ query: string; start: number } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [plusAttachOpen, setPlusAttachOpen] = useState(false);
  const [theme, setTheme] = useState<"default" | "blue" | "pink">("default");
  const [showChatThemePicker, setShowChatThemePicker] = useState(false);
  const [wallpaperId, setWallpaperId] = useState<ChatWallpaperId>("default");
  const [recording, setRecording] = useState(false);
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [hideReadStatus, setHideReadStatus] = useState(false);
  const [hideTypingStatus, setHideTypingStatus] = useState(false);
  const [vanishMode, setVanishMode] = useState(false);
  const [vanishMessages, setVanishMessages] = useState<Message[]>([]);
  const [showPoolInviteModal, setShowPoolInviteModal] = useState(false);
  const [localPoolRoomId, setLocalPoolRoomId] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const sendChatId = useMemo(() => chatMergeKey(chat, meId), [chat, meId]);
  const chatIdRef = useRef(sendChatId);
  chatIdRef.current = sendChatId;

  useEffect(() => {
    setWallpaperId(loadChatWallpaperForChat(chat, meId));
  }, [sendChatId, chat.id, meId]);

  const openThemePicker = useCallback(() => setShowChatThemePicker(true), []);
  useEffect(() => {
    registerOpenThemePicker?.(openThemePicker);
  }, [registerOpenThemePicker, openThemePicker]);
  const dispatchSendRef = useRef<(msg: Omit<Message, "id" | "senderId" | "createdAt">) => boolean>(
    () => false,
  );
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  /** يمنع onInput/onChange من استرجاع النص بعد تفريغ الحقل عند الإرسال */
  const composerIgnoreInputUntilRef = useRef(0);
  const roomBackAtRef = useRef(0);
  /** بعد الإرسال: منع ظهور زر الميك تحت الإصبع (ghost click يفتح التسجيل) */
  const blockMicUntilRef = useRef(0);
  const [composerMicCooldown, setComposerMicCooldown] = useState(false);
  /** تقدّم السحب من الأسفل لتبديل الوضع المخفي (بدون واجهة مرئية) */
  const vanishPullProgRef = useRef(0);
  /** pointer السحب: من الأسفل للأعلى */
  const vanishPullDragRef = useRef<{ pointerId: number | null; startY: number }>({ pointerId: null, startY: 0 });
  useEffect(() => {
    if (!plusAttachOpen) return;
    const onDoc = (e: Event) => {
      const el = plusAttachMenuRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setPlusAttachOpen(false);
    };
    const id = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", onDoc, true);
    };
  }, [plusAttachOpen]);

  useEffect(() => {
    if (text.trim()) setPlusAttachOpen(false);
  }, [text]);

  const otherId =
    chat.isGroup || chat.isChannel ? null : chat.members.find(id => id !== viewerId) ?? null;
  const other = otherId ? userById(state, otherId) : null;
  const title = chat.isGroup || chat.isChannel ? chat.name : "@" + (other?.username || "");
  const isMember = meId ? chat.members.includes(meId) : false;
  const memberRole =
    chat.memberRoles?.[meId] ||
    (chat.ownerId === meId ? "owner" : (chat.admins || []).includes(meId) ? "admin" : "member");
  const whoCanSend = chat.groupSettings?.whoCanSendMessages || "everyone";
  const mutedUntil = chat.mutedUserIds?.[meId] || 0;
  const isMutedNow = mutedUntil > Date.now();
  const canPostByRole = chat.isGroup && !chat.isChannel
    ? (whoCanSend === "admins"
        ? memberRole === "owner" || memberRole === "admin"
        : whoCanSend === "moderators"
          ? memberRole !== "member"
          : true)
    : true;
  const canPost = (!chat.isChannel || (chat.hosts || []).includes(meId)) && !isMutedNow && canPostByRole;
  const muteRemainingMs = Math.max(0, mutedUntil - Date.now());
  const muteRemainingText = muteRemainingMs > 0
    ? muteRemainingMs > 86_400_000
      ? `متبقي ${Math.ceil(muteRemainingMs / 86_400_000)} يوم`
      : muteRemainingMs > 3_600_000
        ? `متبقي ${Math.ceil(muteRemainingMs / 3_600_000)} ساعة`
        : `متبقي ${Math.ceil(muteRemainingMs / 60_000)} دقيقة`
    : "";
  const blockedComposerReason = !canPost
    ? isMutedNow
      ? `أنت مكتوم في هذه المجموعة. ${muteRemainingText}`
      : chat.isChannel
        ? t("onlyOwner")
        : whoCanSend === "admins"
          ? "الكتابة مقفلة للأعضاء — فقط الأدمن يقدر يكتب."
          : "لا تملك صلاحية الكتابة حالياً."
    : "";
  const isGroupChat = chat.isGroup && !chat.isChannel;
  const isDmRoom = !chat.isGroup && !chat.isChannel;
  const peerIsTyping = useMemo(() => {
    if (!otherId || !isDmRoom) return false;
    const storageId = dmChatId(meId, otherId);
    return (
      typingUserByChatId[storageId] === otherId ||
      typingUserByChatId[chat.id] === otherId ||
      typingUserByChatId[sendChatId] === otherId
    );
  }, [otherId, isDmRoom, meId, chat.id, sendChatId, typingUserByChatId]);
  const groupMentionOptions = useMemo(() => {
    if (chat.isChannel || !mentionPick) return [];
    const q = mentionPick.query;
    const members = chat.members
      .map(id => userById(state, id))
      .filter((u): u is User => !!u && u.id !== meId);
    const filtered = q
      ? members.filter(u => (u.username ?? "").toLowerCase().includes(q))
      : members;
    return filtered.slice(0, 10);
  }, [chat.isChannel, mentionPick, chat.members, state.users, meId]);
  const syncComposerHeight = useCallback(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const clamped = Math.min(scrollH, CHAT_COMPOSER_MAX_HEIGHT_PX);
    el.style.height = `${Math.max(CHAT_COMPOSER_LINE_PX, clamped)}px`;
    el.style.overflowY = scrollH > CHAT_COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (!isDmRoom || !otherId) return;
    return () => {
      flushTypingStop(sendChatId, otherId);
    };
  }, [isDmRoom, otherId, sendChatId]);

  const onComposerChange = useCallback((v: string) => {
    if (Date.now() < composerIgnoreInputUntilRef.current) return;
    // setText مباشرة (urgent) — ليبقى الحقل متجاوباً
    setText(v);
    // تحليل mention وتحديث القائمة: urgent أيضاً (قصير جداً)
    if (isDmRoom && otherId) {
      if (v.trim()) scheduleTypingPulse(sendChatId, otherId);
      else flushTypingStop(sendChatId, otherId);
    }
    if (chat.isChannel) {
      setMentionPick(null);
      return;
    }
    const m = v.match(/@([a-z0-9_]*)$/i);
    if (m && m.index != null) {
      setMentionPick({ query: (m[1] || "").toLowerCase(), start: m.index });
    } else {
      setMentionPick(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDmRoom, otherId, sendChatId, chat.isChannel]);

  useLayoutEffect(() => {
    syncComposerHeight();
  }, [text, syncComposerHeight]);
  const pickMention = (uname: string) => {
    if (!mentionPick) return;
    setText(`${text.slice(0, mentionPick.start)}@${uname} `);
    setMentionPick(null);
  };
  const visibleMessages = useMemo(
    () => visibleChatMessages(chat, viewerId),
    [chat.messages, chat.hiddenMessageIdsByUser, viewerId],
  );
  const displayMessages = useMemo(() => {
    if (!isDmRoom || vanishMessages.length === 0) return visibleMessages;
    return [...visibleMessages, ...vanishMessages].slice().sort((a, b) => a.createdAt - b.createdAt);
  }, [isDmRoom, visibleMessages, vanishMessages]);

  /** عدد الرسائل المعروضة في النافذة — يبدأ بـ 60 ويزيد عند التمرير للأعلى */
  const [visibleWindowCount, setVisibleWindowCount] = useState(60);
  const [loadingOlderUi, setLoadingOlderUi] = useState(false);
  const isLoadingOlderRef = useRef(false);
  const draftSaveTimerRef = useRef(0);
  const [sendPulse, setSendPulse] = useState(false);

  /** إعادة ضبط النافذة عند تبديل المحادثة + استعادة المسودة */
  useEffect(() => {
    setVisibleWindowCount(60);
    isLoadingOlderRef.current = false;
    setLoadingOlderUi(false);
    const draft = meId ? loadChatDraft(meId, sendChatId) : "";
    setText(draft);
    if (composerInputRef.current) {
      composerInputRef.current.value = draft;
    }
    requestAnimationFrame(() => syncComposerHeight());
  }, [chat.id, sendChatId, meId, syncComposerHeight]);

  useEffect(() => {
    if (!meId) return;
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      saveChatDraft(meId, sendChatId, text);
    }, 400);
    return () => {
      if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    };
  }, [text, meId, sendChatId]);

  /** الرسائل المعروضة فعلياً — آخر N رسالة فقط */
  const windowedMessages = useMemo(() => {
    if (displayMessages.length <= visibleWindowCount) return displayMessages;
    return displayMessages.slice(displayMessages.length - visibleWindowCount);
  }, [displayMessages, visibleWindowCount]);

  const hasOlderMessages = displayMessages.length > visibleWindowCount;
  const noMessagesYet = displayMessages.length === 0;
  const showDmIntro = isDmRoom && !!other && !!otherId && !vanishMode && noMessagesYet;
  const [messageContext, setMessageContext] = useState<Message | null>(null);
  const [moreReactionEmoji, setMoreReactionEmoji] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [cameraCompose, setCameraCompose] = useState<CameraComposeDraft | null>(null);
  const [instagramCameraOpen, setInstagramCameraOpen] = useState(false);
  const [drawComposeOpen, setDrawComposeOpen] = useState(false);
  const [viewOnceOverlay, setViewOnceOverlay] = useState<Message | null>(null);
  const [inlineMediaViewer, setInlineMediaViewer] = useState<Message | null>(null);
  const [shareFeedOpen, setShareFeedOpen] = useState<null | { items: ChatShareFeedItem[]; initialIndex: number }>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const chatHeaderRef = useRef<HTMLDivElement>(null);
  const kbSnap = useChatKeyboardInsets(true);
  const composerBottomPad = chatComposerBottomPadding(kbSnap.open);

  /** false عندما يمرّر المستخدم لأعلى لقراءة قديم — لا نعيده للأسفل تلقائياً عند وصول رسالة جديدة */
  const stickToBottomRef = useRef(true);

  const syncComposerDockHeight = useCallback(() => {
    const el = composerRef.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const kbOpen =
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("chat-keyboard-open");
    const h = Math.ceil(rect.height) + (kbOpen ? 0 : 4);
    if (h > 0) {
      document.documentElement.style.setProperty("--chat-composer-h", `${h}px`);
    }
  }, []);

  const scrollMessagesToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    syncComposerDockHeight();
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    const dist = top - el.scrollTop;
    if (dist < 2) return;
    try {
      el.scrollTo({ top, behavior: "instant" });
    } catch {
      el.scrollTop = top;
    }
  }, [syncComposerDockHeight]);

  const scrollBottomRafRef = useRef(0);
  const scrollBottomTimerRef = useRef(0);
  const scheduleScrollToBottom = useCallback(
    (opts?: { afterMs?: number }) => {
      if (!stickToBottomRef.current) return;
      cancelAnimationFrame(scrollBottomRafRef.current);
      scrollBottomRafRef.current = requestAnimationFrame(() => scrollMessagesToBottom());
      if (opts?.afterMs != null && opts.afterMs > 0) {
        if (scrollBottomTimerRef.current) window.clearTimeout(scrollBottomTimerRef.current);
        scrollBottomTimerRef.current = window.setTimeout(() => {
          scrollBottomTimerRef.current = 0;
          scrollMessagesToBottom();
        }, opts.afterMs);
      }
    },
    [scrollMessagesToBottom],
  );

  const onComposerFocus = useCallback(() => {
    stickToBottomRef.current = true;
    try {
      window.scrollTo(0, 0);
    } catch {
      /* ignore */
    }
    scheduleScrollToBottom({ afterMs: 80 });
    window.setTimeout(() => {
      syncComposerDockHeight();
      scheduleScrollToBottom();
    }, 120);
    window.setTimeout(() => scheduleScrollToBottom(), 280);
  }, [scheduleScrollToBottom, syncComposerDockHeight]);

  useLayoutEffect(() => {
    const headerEl = chatHeaderRef.current;
    if (!headerEl || typeof document === "undefined") return;
    const syncHeaderH = () => {
      const hh = Math.ceil(headerEl.getBoundingClientRect().height);
      if (hh > 0) {
        document.documentElement.style.setProperty("--chat-header-h", `${hh}px`);
      }
    };
    syncHeaderH();
    const roHeader = new ResizeObserver(syncHeaderH);
    roHeader.observe(headerEl);
    return () => roHeader.disconnect();
  }, [chat.id, showPrivacyMenu, (chat.pinnedMessageIds || []).length]);

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    syncComposerDockHeight();
    const ro = new ResizeObserver(() => {
      syncComposerDockHeight();
      scheduleScrollToBottom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    chat.id,
    showStickers,
    replyingTo,
    mentionPick,
    plusAttachOpen,
    syncComposerDockHeight,
    scheduleScrollToBottom,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      syncComposerDockHeight();
      scheduleScrollToBottom();
    };
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("orientationchange", sync, { passive: true });
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [syncComposerDockHeight, scheduleScrollToBottom]);

  const kbOpenPrevRef = useRef(false);
  useEffect(() => {
    const wasOpen = kbOpenPrevRef.current;
    kbOpenPrevRef.current = kbSnap.open;
    if (!kbSnap.open) return;
    if (!wasOpen) stickToBottomRef.current = true;
    scheduleScrollToBottom({ afterMs: 280 });
  }, [kbSnap.open, scheduleScrollToBottom]);
  const scrollAnchorRef = useRef({ chatId: "", msgCount: 0 });
  const cameraCaptureRef = useRef<HTMLInputElement>(null);
  const galleryMediaInputRef = useRef<HTMLInputElement>(null);
  const galleryVideoVoiceInputRef = useRef<HTMLInputElement>(null);
  const galleryLpTimerRef = useRef<number | null>(null);
  const galleryLpStartRef = useRef<{ x: number; y: number } | null>(null);
  const galleryLpFiredRef = useRef(false);
  const plusAttachMenuRef = useRef<HTMLDivElement>(null);
  const messageElRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const lpTimerRef = useRef<number | null>(null);
  const lpStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressStartRef = useRef<{ x: number; y: number; mid: string } | null>(null);
  const longPressActivatedRef = useRef(false);
  /** ضغطتان متتاليتان على نفس الرسالة → تفاعل ❤️ */
  const heartDblTapRef = useRef<{ messageId: string; at: number } | null>(null);

  const dispatchSend = useCallback(
    (msg: Omit<Message, "id" | "senderId" | "createdAt">) => {
      if (isDmRoom && vanishMode) {
        const id = `vx_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
        setVanishMessages(v => [...v, { ...msg, id, senderId: meId, createdAt: Date.now() }]);
        return true;
      }
      return sendMessage(sendChatId, msg);
    },
    [isDmRoom, vanishMode, sendChatId, meId, sendMessage],
  );

  useLayoutEffect(() => {
    dispatchSendRef.current = dispatchSend;
  });

  useEffect(() => {
    if (!isReactNativeWebView()) return;
    window.retweetOnVoiceRecorded = payload => {
      dispatchSendRef.current({
        type: "voice",
        content: payload.content,
        durationSec: payload.durationSec,
      });
      setRecording(false);
      recordStartRef.current = 0;
    };
    window.retweetOnVoiceRecordError = (message: string) => {
      window.alert(message);
      setRecording(false);
      recordStartRef.current = 0;
    };
    return () => {
      delete window.retweetOnVoiceRecorded;
      delete window.retweetOnVoiceRecordError;
    };
  }, []);

  useEffect(() => {
    setVanishMode(false);
    setVanishMessages([]);
    vanishPullProgRef.current = 0;
  }, [chat.id]);

  useEffect(() => {
    const onVanishArm = (e: Event) => {
      const id = (e as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (!id || (id !== sendChatId && id !== chat.id)) return;
      setVanishMode(true);
      setVanishMessages([]);
    };
    window.addEventListener("retweet-chat-vanish-arm", onVanishArm);
    return () => window.removeEventListener("retweet-chat-vanish-arm", onVanishArm);
  }, [sendChatId, chat.id]);

  useEffect(() => {
    if (!stackFullyOpen) return;
    void loadChatMessages(sendChatId);
  }, [sendChatId, loadChatMessages, stackFullyOpen]);

  const scrollToMessageId = useCallback((id: string) => {
    setMoreReactionEmoji(false);
    setMessageContext(null);
    const el = messageElRefs.current.get(id);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el) {
      el.classList.add("ring-2", "ring-sky-500/70", "rounded-2xl");
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-sky-500/70", "rounded-2xl");
      }, 1400);
    }
  }, []);

  useEffect(() => {
    const onScrollMsg = (e: Event) => {
      const mid = (e as CustomEvent<{ messageId?: string }>).detail?.messageId;
      if (mid) scrollToMessageId(mid);
    };
    window.addEventListener("retweet-scroll-chat-message", onScrollMsg);
    return () => window.removeEventListener("retweet-scroll-chat-message", onScrollMsg);
  }, [scrollToMessageId]);

  const openShareFeedFromMessage = useCallback(
    (m: Message) => {
      const chain = displayMessages.filter(x => x.type === "shared_post" || x.type === "shared_story");
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
    [displayMessages],
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
      if (m.id.startsWith("vx_")) return;
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

  const swipeReplyLockRef = useRef(false);

  const onMsgPointerUp = useCallback(
    (e: React.PointerEvent, m: Message) => {
      clearLongPress();
      if (swipeReplyLockRef.current) {
        swipeReplyLockRef.current = false;
        pressStartRef.current = null;
        return;
      }
      if (m.id.startsWith("vx_")) {
        pressStartRef.current = null;
        return;
      }
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
      if (dx > 44 && Math.abs(dx) > Math.abs(dy)) {
        startTransition(() => setReplyingTo(m));
        return;
      }
      if (Math.hypot(dx, dy) > 26) {
        heartDblTapRef.current = null;
        return;
      }
      const now = Date.now();
      const prev = heartDblTapRef.current;
      if (prev && prev.messageId === m.id && now - prev.at < 480) {
        heartDblTapRef.current = null;
        if (isGuest) {
          notifyGuestActionBlocked();
          return;
        }
        addMessageReaction(chat.id, m.id, "❤️");
        try {
          (navigator as unknown as { vibrate?: (p: number | number[]) => void }).vibrate?.(12);
        } catch {
          /* ignore */
        }
        return;
      }
      heartDblTapRef.current = { messageId: m.id, at: now };
    },
    [clearLongPress, meId, chat.id, addMessageReaction, isGuest],
  );

  useEffect(() => {
    if (!stackFullyOpen) return;
    if (chat.isGroup || chat.isChannel) return;
    markChatOpened(chat.id);
  }, [chat.id, chat.isGroup, chat.isChannel, markChatOpened, stackFullyOpen]);

  const lastMessageId = (chat.messages || [])[(chat.messages || []).length - 1]?.id;
  useEffect(() => {
    markChatRead(chat.id);
  }, [chat.id, lastMessageId, markChatRead]);

  useEffect(() => {
    setMoreReactionEmoji(false);
  }, [messageContext?.id]);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!forceScrollToBottom && !stickToBottomRef.current) return;
      scheduleScrollToBottom();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [chat.id, scheduleScrollToBottom, forceScrollToBottom]);

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
    const el = messagesScrollRef.current;
    if (!el) return;
    // تعطيل مؤقت للـ scroll-behavior لضمان القفز الفوري بدون أنيميشن
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = "auto";
    el.scrollTop = el.scrollHeight;
    el.style.scrollBehavior = prev;
  }, [chat.id]);

  useLayoutEffect(() => {
    if (!embedInStack || !forceScrollToBottom) return;
    const onViewportChange = () => {
      if (stickToBottomRef.current) scrollMessagesToBottom();
    };
    const onScrollBottom = () => scrollMessagesToBottom();
    onViewportChange();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("retweet-chat-scroll-bottom", onScrollBottom);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("retweet-chat-scroll-bottom", onScrollBottom);
    };
  }, [embedInStack, forceScrollToBottom, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    if (!forceScrollToBottom) return;
    stickToBottomRef.current = true;
    scrollMessagesToBottom();
    const id = requestAnimationFrame(() => scrollMessagesToBottom());
    return () => cancelAnimationFrame(id);
  }, [forceScrollToBottom, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    if (messageContext) return;
    if (!forceScrollToBottom && !stickToBottomRef.current) return;
    const count = displayMessages.length;
    const prev = scrollAnchorRef.current;
    const isNewChat = prev.chatId !== chat.id;
    scrollAnchorRef.current = { chatId: chat.id, msgCount: count };
    if (isNewChat) stickToBottomRef.current = true;
    if (!isNewChat && !forceScrollToBottom && count === prev.msgCount) return;
    stickToBottomRef.current = true;
    scheduleScrollToBottom();
    return () => {
      cancelAnimationFrame(scrollBottomRafRef.current);
      if (scrollBottomTimerRef.current) window.clearTimeout(scrollBottomTimerRef.current);
    };
  }, [chat.id, displayMessages.length, messageContext, scheduleScrollToBottom, forceScrollToBottom]);

  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < 72;

    // عند التمرير للأعلى وبلوغ الـ 20% العلوية — نوسّع النافذة
    if (el.scrollTop < el.scrollHeight * 0.20 && !isLoadingOlderRef.current && hasOlderMessages) {
      isLoadingOlderRef.current = true;
      setLoadingOlderUi(true);
      const prevScrollHeight = el.scrollHeight;
      setVisibleWindowCount(prev => prev + 40);
      void loadChatMessages(chat.id).finally(() => {
        requestAnimationFrame(() => {
          if (!messagesScrollRef.current) return;
          const added = messagesScrollRef.current.scrollHeight - prevScrollHeight;
          if (added > 0) messagesScrollRef.current.scrollTop += added;
          isLoadingOlderRef.current = false;
          setLoadingOlderUi(false);
        });
      });
    }
  }, [hasOlderMessages, loadChatMessages, chat.id]);

  const VANISH_PULL_NEED = 120;
  /** ارتفاع النطاق من أسفل منطقة التمرير لبدء سحب الوضع المخفي */
  const VANISH_PULL_HIT_PX = 140;

  const isQuranChannel = chat.id === QURAN_CHANNEL_ID;
  const useIgDm = isIgDmChat(isDmRoom, isQuranChannel);
  const dmPalette = useMemo(
    () => (useIgDm ? getChatDmPalette(state.theme) : null),
    [useIgDm, state.theme],
  );
  const dmDir = chatDmLayoutDir(state.language);
  const dmRtl = chatDmIsRtl(state.language);
  const activeWallpaper = useMemo(() => getChatWallpaperTheme(wallpaperId), [wallpaperId]);
  const chatWallpaperUrl = activeWallpaper.imagePath
    ? chatWallpaperAssetUrl(activeWallpaper.imagePath)
    : null;
  const chromeOnWallpaper = !!chatWallpaperUrl && !isQuranChannel;
  const wallpaperIconClass = "text-white/85 hover:bg-white/10 active:bg-white/15 transition-colors";
  const igDmSurfaceStyle = useMemo(() => {
    if (chromeOnWallpaper) return undefined;
    return dmPalette ? { backgroundColor: dmPalette.surface } : undefined;
  }, [dmPalette, chromeOnWallpaper]);
  const peerOnline = useMemo(() => {
    if (!useIgDm || !otherId) return false;
    const last = chat.lastOpenAtByUser?.[otherId] ?? 0;
    return Date.now() - last < 5 * 60_000;
  }, [useIgDm, otherId, chat.lastOpenAtByUser]);
  const chatTimelineRows = useMemo(
    () => (useIgDm ? buildChatTimelineRows(windowedMessages, meId, state.language) : null),
    [useIgDm, windowedMessages, meId, state.language],
  );
  const rowsToRender = useMemo(() => {
    if (chatTimelineRows) return chatTimelineRows;
    return windowedMessages.map(m => ({
      kind: "message" as const,
      key: m.id,
      message: m,
      showPeerAvatar: true,
    }));
  }, [chatTimelineRows, windowedMessages]);
  const themeBg = isQuranChannel
    ? "bg-black text-white"
    : chromeOnWallpaper
      ? "text-white"
      : useIgDm && dmPalette
        ? dmPalette.headerTitleClass
        : theme === "blue"
          ? "bg-blue-50 dark:bg-blue-950"
          : theme === "pink"
            ? "bg-pink-50 dark:bg-pink-950"
            : "bg-background";

  const clearGalleryLongPress = useCallback(() => {
    if (galleryLpTimerRef.current) {
      clearTimeout(galleryLpTimerRef.current);
      galleryLpTimerRef.current = null;
    }
    galleryLpStartRef.current = null;
  }, []);

  const sendGalleryVideoAsVoice = useCallback(
    (file: File) => {
      void (async () => {
        const isVid = file.type.startsWith("video/");
        const isAud = file.type.startsWith("audio/");
        if (!isVid && !isAud) {
          window.alert("اختر مقطع فيديو أو ملف صوتي (مثل m4a أو mp3).");
          return;
        }
        const durationSec = isVid ? await readVideoDurationSec(file) : await readAudioDurationSec(file);

        // نحاول أولاً رفع الملف (أو نسخة مضغوطة) إلى السيرفر مثل الصور/الفيديو
        try {
          const compressed = await compressChatMediaFile(file);
          const token = getApiToken();
          if (apiBackendEnabled() && token) {
            const up = await apiUploadMedia(token, compressed, { timeoutMs: 120_000 });
            if (up.ok) {
              dispatchSend({
                type: "voice",
                content: up.url,
                durationSec,
              });
              return;
            }
          }
          // في حال فشل الرفع لأي سبب، نرجع لمسار base64 (احتياطي، لكن قد يكون ثقيلاً)
          const reader = new FileReader();
          reader.onload = () =>
            dispatchSend({
              type: "voice",
              content: String(reader.result),
              durationSec,
            });
          reader.readAsDataURL(compressed);
        } catch (err) {
          console.error("[gallery-voice] failed:", err);
          window.alert("تعذّر إرسال المقطع كرسالة صوتية. جرّب من جديد أو قصّر طول الفيديو.");
        }
      })();
    },
    [dispatchSend],
  );

  const onGalleryMediaPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      void (async () => {
        const msgType = f.type.startsWith("video/") ? "video" : "image";
        const compressed = await compressChatMediaFile(f);
        const token = getApiToken();
        if (apiBackendEnabled() && token) {
          const up = await apiUploadMedia(token, compressed, { timeoutMs: 90_000 });
          if (up.ok) {
            dispatchSend({ type: msgType, content: up.url });
            return;
          }
        }
        const reader = new FileReader();
        reader.onload = () => dispatchSend({ type: msgType, content: String(reader.result) });
        reader.readAsDataURL(compressed);
      })();
    },
    [dispatchSend],
  );

  const onGalleryVideoVoicePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      sendGalleryVideoAsVoice(f);
    },
    [sendGalleryVideoAsVoice],
  );

  /** قائمة + : فتح مكتبة الفيديو/الصوت وإرسال المقطع كرسالة صوتية */
  const openGalleryVideoVoiceStudio = useCallback(() => {
    setPlusAttachOpen(false);
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    galleryVideoVoiceInputRef.current?.click();
  }, [isGuest]);

  const onGalleryButtonClick = useCallback(() => {
    if (galleryLpFiredRef.current) {
      galleryLpFiredRef.current = false;
      return;
    }
    galleryMediaInputRef.current?.click();
  }, []);

  const onGalleryPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      galleryLpFiredRef.current = false;
      clearGalleryLongPress();
      galleryLpStartRef.current = { x: e.clientX, y: e.clientY };
      galleryLpTimerRef.current = window.setTimeout(() => {
        galleryLpTimerRef.current = null;
        galleryLpStartRef.current = null;
        galleryLpFiredRef.current = true;
        galleryVideoVoiceInputRef.current?.click();
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
      }, 480);
    },
    [clearGalleryLongPress],
  );

  const onGalleryPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = galleryLpStartRef.current;
      if (!start || !galleryLpTimerRef.current) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
        clearGalleryLongPress();
      }
    },
    [clearGalleryLongPress],
  );

  const onGalleryTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      galleryLpFiredRef.current = false;
      clearGalleryLongPress();
      const t = e.touches[0];
      galleryLpStartRef.current = { x: t.clientX, y: t.clientY };
      galleryLpTimerRef.current = window.setTimeout(() => {
        galleryLpTimerRef.current = null;
        galleryLpStartRef.current = null;
        galleryLpFiredRef.current = true;
        galleryVideoVoiceInputRef.current?.click();
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
      }, 420);
    },
    [clearGalleryLongPress],
  );

  const onGalleryTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const start = galleryLpStartRef.current;
      if (!start || !galleryLpTimerRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) {
        clearGalleryLongPress();
      }
    },
    [clearGalleryLongPress],
  );

  const onGalleryTouchEnd = useCallback(() => {
    clearGalleryLongPress();
  }, [clearGalleryLongPress]);

  const startRecording = async () => {
    if (Date.now() < blockMicUntilRef.current) return;
    if (isReactNativeWebView()) {
      setRecording(true);
      recordStartRef.current = Date.now();
      postToNativeShell({ type: "voice-record-start" });
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      window.alert(
        "التسجيل الصوتي يتطلب اتصالاً آمناً (HTTPS). في تطبيق Expo يُفعَّل تلقائياً — أعد فتح التطبيق بعد التحديث.",
      );
      return;
    }
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
        stream.getTracks().forEach(t => t.stop());
        const flushAndSend = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          if (blob.size < 64) {
            window.alert("التسجيل قصير جداً أو فارغ — اضغط الميكروفون ثم «إيقاف» بعد ثانية على الأقل.");
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            dispatchSend({
              type: "voice",
              content: String(reader.result),
              durationSec: Math.max(1, Math.round((Date.now() - (recordStartRef.current || Date.now())) / 1000)),
            });
          reader.readAsDataURL(blob);
        };
        queueMicrotask(flushAndSend);
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
    if (isReactNativeWebView()) {
      postToNativeShell({ type: "voice-record-stop" });
      return;
    }

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

  const openMentionProfile = useCallback(
    (uname: string) => {
      const local = state.users.find(x => x.username.toLowerCase() === uname.toLowerCase());
      if (local) {
        startTransition(() => onOpenProfile(local.id));
        return;
      }
      if (!apiBackendEnabled() || !getApiToken()) return;
      void (async () => {
        const row = await apiLookupUserByUsername(uname);
        if (!row) return;
        const user = userFromSearchResult(row);
        mergeDiscoveredUsers([user]);
        startTransition(() => onOpenProfile(user.id));
      })();
    },
    [state.users, onOpenProfile, mergeDiscoveredUsers],
  );

  const renderText = (txt: string, mineBubble: boolean) => {
    const capped = txt.length > 8000 ? txt.slice(0, 8000) + "…" : txt;
    const glassLinks = mineBubble && !isQuranChannel;
    return renderMentionHashtagNodes(capped, {
      renderMention: createMentionRenderer({
        variant: glassLinks ? "mine" : "default",
        users: state.users,
        onUsernameClick: openMentionProfile,
      }),
      renderHashtag: (h, key) => (
        <span key={key} className={glassLinks ? "text-zinc-700 dark:text-zinc-300" : "text-primary"}>
          {h}
        </span>
      ),
    });
  };

  const renderBubbleContent = (m: Message, mine: boolean) => {
    const mc = messageContent(m);
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
        {m.replyTo && (
          <ChatInlineReplyQuote
            replyTo={m.replyTo}
            messages={displayMessages}
            meId={meId}
            state={state}
            mine={mine}
            isQuran={isQuranChannel}
            onJumpToOriginal={scrollToMessageId}
          />
        )}
        {m.type === "text" && messageContent(m).startsWith("__game_invite__:pool:") ? (
          <PoolGameInviteBubble
            message={m}
            mine={mine}
            meId={meId}
            otherId={otherId ?? ""}
            chatId={chat.id}
            onJoin={roomId => setLocalPoolRoomId(roomId)}
          />
        ) : m.type === "text" &&
          ((m.replyContext?.kind === "note" || /^↩️ رد على نوتك:/.test(messageContent(m))) ? (
            <ChatNoteReplyBubble message={m} mine={mine} />
          ) : (
            <span
              dir="auto"
              className="block max-w-full select-none whitespace-pre-wrap break-words text-start [overflow-wrap:anywhere] [word-break:break-word]"
            >
              {renderText(messageContent(m), mine)}
            </span>
          ))}
        {m.type === "shared_group" && (
          <SharedGroupInvitePreview
            inviteCode={mc}
            onJoined={id => {
              if (id) {
                window.dispatchEvent(
                  new CustomEvent("retweet-open-chat", { detail: { chatId: id } }),
                );
              }
            }}
          />
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
            {m.shareText && <span className="mb-1 block select-none whitespace-pre-wrap text-xs opacity-90">{m.shareText}</span>}
            <SharedPostPreview postId={mc} variant="chat" />
          </button>
        )}
        {m.type === "shared_story" &&
          (m.replyContext?.kind === "story" || m.shareText ? (
            <ChatStoryReplyStack message={m} shareText={m.shareText} />
          ) : (
            <button
              type="button"
              className="m-0 max-w-[min(96vw,360px)] border-0 bg-transparent p-0 text-start outline-none ring-0"
              onClick={e => {
                e.stopPropagation();
                openShareFeedFromMessage(m);
              }}
            >
              <SharedStoryChatPreview storyId={mc} />
            </button>
          ))}
        {m.type === "voice" &&
          (mc.startsWith("data:") || isRenderableMediaUrl(mc) ? (
            <InlineVoicePlayer
              src={mc.startsWith("data:") ? mc : resolveMediaUrl(mc)}
              durationSec={m.durationSec}
              isQuran={isQuranChannel}
              mine={mine}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎙️</span>
              <span className="break-all text-xs opacity-80">{mc}</span>
            </div>
          ))}
        {m.type === "sticker" && isStickerImageContent(mc) && (
          <img
            src={mc}
            alt=""
            className={CHAT_STICKER_MEDIA_CLASS}
            loading="lazy"
            decoding="async"
          />
        )}
        {m.type === "sticker" && isStickerVideoContent(mc) && (
          <video
            src={mc.startsWith("data:") ? mc : resolveMediaUrl(mc)}
            className={CHAT_STICKER_MEDIA_CLASS}
            autoPlay
            loop
            muted
            playsInline
            controls={false}
            preload="metadata"
          />
        )}
        {m.type === "sticker" && !isStickerImageContent(mc) && !isStickerVideoContent(mc) && (
          <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-[22px] bg-secondary/40 text-2xl leading-none select-none" title="ملصق">
            {mc}
          </span>
        )}
        {m.type === "drawing" && m.viewOnce && (
          viewOnceOpenedForViewer(m, meId) ? (
            <div className={viewOncePillDoneClass(mine, isQuranChannel)}>رسم · تمت المشاهدة</div>
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
              رسم
            </button>
          )
        )}
        {m.type === "drawing" && !m.viewOnce && (() => {
          const d = parseDrawingPayload(mc);
          return d ? (
            <div className={CHAT_IMAGE_WRAP + " overflow-hidden"}>
              <ChatDrawingCanvas payload={d} className="w-full" maxHeightPx={280} forChatDisplay />
            </div>
          ) : (
            <span className="text-xs opacity-70">رسم</span>
          );
        })()}
        {m.type === "image" && m.viewOnce && (
          viewOnceOpenedForViewer(m, meId) ? (
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
          <button
            type="button"
            aria-label="عرض الصورة بحجم الشاشة"
            className="m-0 block w-full cursor-pointer border-0 bg-transparent p-0 outline-none ring-0 ring-offset-0 focus-visible:ring-2 focus-visible:ring-white/35"
            onClick={e => {
              e.stopPropagation();
              setInlineMediaViewer(m);
            }}
          >
            <div className={CHAT_IMAGE_WRAP}>
              <img
                src={mc}
                alt=""
                draggable={false}
                className={`${CHAT_IMAGE_EL} pointer-events-none align-middle`}
              />
            </div>
          </button>
        )}
        {m.type === "video" && m.viewOnce && (
          viewOnceOpenedForViewer(m, meId) ? (
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
          <button
            type="button"
            aria-label="تكبير مقطع الفيديو"
            className={
              CHAT_VIDEO_WRAP +
              " relative m-0 cursor-pointer border-0 bg-black p-0 text-start shadow-none outline-none ring-0 focus-visible:ring-2 focus-visible:ring-white/30"
            }
            onClick={e => {
              e.stopPropagation();
              setInlineMediaViewer(m);
            }}
          >
            <video src={mc.startsWith("data:") ? mc : resolveMediaUrl(mc)} muted playsInline preload="metadata" className={CHAT_VIDEO_EL + " pointer-events-none"} />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/50 p-3 text-white shadow-md" aria-hidden>
                <Play size={28} fill="currentColor" className="text-white opacity-95" />
              </span>
            </span>
          </button>
        )}
      </>
    );
  };

  const pickSticker = useCallback(
    (content: string, meta?: { createdFromImage?: boolean }) => {
      dispatchSend({ type: "sticker", content });
      if (meta?.createdFromImage) addCreatedStickerContent(content);
      setShowStickers(false);
    },
    [dispatchSend, addCreatedStickerContent],
  );

  const toggleStickerPanel = useCallback(() => {
    startTransition(() => setShowStickers(s => !s));
  }, []);

  const handleVanishPullDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (drawComposeOpen) return;
      if (!isDmRoom || !canPost) return;
      e.preventDefault();
      vanishPullDragRef.current = { pointerId: e.pointerId, startY: e.clientY };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      vanishPullProgRef.current = 0;
    },
    [drawComposeOpen, isDmRoom, canPost],
  );

  const handleVanishPullMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (drawComposeOpen) return;
      const d = vanishPullDragRef.current;
      if (d.pointerId !== e.pointerId || d.pointerId === null) return;
      const dy = d.startY - e.clientY;
      if (dy <= 0) {
        vanishPullProgRef.current = 0;
        return;
      }
      const p = Math.min(1, dy / VANISH_PULL_NEED);
      vanishPullProgRef.current = p;
    },
    [drawComposeOpen],
  );

  const finalizeVanishPull = useCallback(() => {
    const d = vanishPullDragRef.current;
    vanishPullDragRef.current = { pointerId: null, startY: 0 };
    const done = vanishPullProgRef.current >= 0.92;
    vanishPullProgRef.current = 0;
    if (done) {
      setVanishMode(vm => {
        if (vm) setVanishMessages([]);
        return !vm;
      });
      try {
        (navigator as unknown as { vibrate?: (x: number | number[]) => void }).vibrate?.(16);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleVanishPullUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (drawComposeOpen) return;
      const d = vanishPullDragRef.current;
      if (d.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      finalizeVanishPull();
    },
    [drawComposeOpen, finalizeVanishPull],
  );

  const onMessagesVanishPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (drawComposeOpen) return;
      if (!isDmRoom || !canPost) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const fromBottom = r.bottom - e.clientY;
      if (fromBottom < 0 || fromBottom > VANISH_PULL_HIT_PX) return;
      const fromRight = e.clientX - r.left >= r.width - 30;
      if (fromRight) return;
      const tgt = e.target as HTMLElement | null;
      if (!tgt || !el.contains(tgt)) return;
      if (tgt.closest("button, a, input, textarea, select, canvas")) return;
      /* السماح بالبدء من فقاعات الرسائل في أسفل الشاشة — كان استبعاد .touch-manipulation يعطّل الوضع المخفي عملياً */
      e.stopPropagation();
      handleVanishPullDown(e);
    },
    [drawComposeOpen, isDmRoom, canPost, handleVanishPullDown],
  );

  const myOutgoing = useMemo(
    () => visibleMessages.filter(m => m.senderId === meId),
    [visibleMessages, meId],
  );
  const seenFooter = useMemo<string | null>(() => {
    if (chat.isGroup || chat.isChannel || !otherId) return null;
    const otherLastOpen = chat.lastOpenAtByUser?.[otherId] ?? 0;
    const lastMine = myOutgoing[myOutgoing.length - 1];
    if (!lastMine || otherLastOpen < lastMine.createdAt) return null;
    const otherRepliedAfter = visibleMessages.some(m => m.senderId === otherId && m.createdAt >= lastMine.createdAt);
    const lang = state.language;
    if (!otherRepliedAfter) {
      const mins = Math.max(0, Math.floor((Date.now() - otherLastOpen) / 60000));
      return mins === 0
        ? (lang === "en" ? "Seen" : "تمت القراءة")
        : (lang === "en" ? `Seen · ${mins}m` : `تمت القراءة · منذ ${mins} د`);
    }
    return lang === "en" ? "Seen" : "تمت القراءة";
  }, [chat.isGroup, chat.isChannel, otherId, chat.lastOpenAtByUser, myOutgoing, visibleMessages, state.language]);

  const inlineMediaLightboxUser: User | null =
    inlineMediaViewer &&
    !inlineMediaViewer.viewOnce &&
    (inlineMediaViewer.type === "image" || inlineMediaViewer.type === "video")
      ? (userById(state, inlineMediaViewer.senderId) ?? null)
      : null;
  const inlineMediaLightboxLabel =
    inlineMediaLightboxUser != null
      ? `@${inlineMediaLightboxUser.username}`
      : inlineMediaViewer?.senderId === meId
        ? `@${currentUser?.username ?? "?"}`
        : "?";

  const composerHasText = text.trim().length > 0;

  const readComposerBody = useCallback(() => {
    const raw = composerInputRef.current?.value ?? text;
    return raw.trim();
  }, [text]);

  const clearComposer = useCallback(() => {
    composerIgnoreInputUntilRef.current = Date.now() + 320;
    setText("");
    if (meId) clearChatDraft(meId, sendChatId);
    if (composerInputRef.current) {
      composerInputRef.current.value = "";
      composerInputRef.current.style.height = `${CHAT_COMPOSER_LINE_PX}px`;
      composerInputRef.current.style.overflowY = "hidden";
    }
    setReplyingTo(null);
    setMentionPick(null);
  }, [meId, sendChatId]);

  const submitTextMessage = useCallback(() => {
    if (composingRef.current) return;
    const body = readComposerBody();
    if (!body) return;
    const replyTarget = replyingTo;
    const rt = replyTarget
      ? { id: replyTarget.id, content: chatReplyPreview(replyTarget), type: replyTarget.type }
      : undefined;
    clearComposer();
    blockMicUntilRef.current = Date.now() + 520;
    setComposerMicCooldown(true);
    const sent = dispatchSend({
      type: "text",
      content: body,
      replyTo: rt,
      parentMessageId: replyTarget?.id,
    });
    if (!sent) {
      composerIgnoreInputUntilRef.current = 0;
      setText(body);
      if (composerInputRef.current) composerInputRef.current.value = body;
      window.setTimeout(() => setComposerMicCooldown(false), 80);
      return;
    }
    chatHapticSuccess();
    setSendPulse(true);
    window.setTimeout(() => setSendPulse(false), 280);
    window.setTimeout(() => setComposerMicCooldown(false), 480);
    stickToBottomRef.current = true;
    syncComposerDockHeight();
    scrollMessagesToBottom();
    requestAnimationFrame(() => {
      syncComposerDockHeight();
      scrollMessagesToBottom();
      requestAnimationFrame(scrollMessagesToBottom);
    });
  }, [readComposerBody, replyingTo, dispatchSend, clearComposer, syncComposerDockHeight, scrollMessagesToBottom]);

  const edgeSwipeBackBlocked = useMemo(
    () =>
      !!messageContext ||
      !!forwardingMessage ||
      !!cameraCompose ||
      instagramCameraOpen ||
      drawComposeOpen ||
      !!viewOnceOverlay ||
      !!inlineMediaViewer ||
      !!shareFeedOpen ||
      showStickers ||
      recording ||
      showPrivacyMenu,
    [
      messageContext,
      forwardingMessage,
      cameraCompose,
      instagramCameraOpen,
      drawComposeOpen,
      viewOnceOverlay,
      inlineMediaViewer,
      shareFeedOpen,
      showStickers,
      recording,
      showPrivacyMenu,
    ],
  );

  const {
    containerRef: chatSwipeColumnRef,
    panelStyle: chatPanelStyle,
    requestDismiss: requestChatDismiss,
    edgeStripProps,
    panelSwipeProps,
  } = useSlideDismissBack({
    onDismiss: () => {
      if (embedInStack && onAnimatedBack?.()) return;
      onBack();
    },
    blocked: edgeSwipeBackBlocked || (embedInStack && roomDismissBlocked),
    enabled: true,
    dismissPullCssVar: CHAT_DISMISS_PULL_CSS_VAR,
    stackProgressCssVar: embedInStack ? CHAT_STACK_PROGRESS_VAR : undefined,
    embedInStack,
    panelSwipeDismiss: true,
    dismissGesture: "chat",
    onStackProgress,
    resetKey: `${chat.id}-${embedInStack ? "stack" : "solo"}`,
    edgeTopInsetPx: CHAT_ROOM_HEADER_EDGE_INSET_PX,
    edgeBottomInsetPx: 0,
  });

  const chatDismissCtx = useMemo(
    () => ({
      requestDismiss: (opts?: { immediate?: boolean }) => {
        if (embedInStack && onAnimatedBack?.()) return true;
        return requestChatDismiss(opts);
      },
    }),
    [embedInStack, onAnimatedBack, requestChatDismiss],
  );

  const fireRoomBack = useCallback(() => {
    const now = Date.now();
    if (now - roomBackAtRef.current < 200) return;
    roomBackAtRef.current = now;
    if (embedInStack && onAnimatedBack) {
      onAnimatedBack();
      return;
    }
    onBack();
  }, [embedInStack, onAnimatedBack, onBack]);

  const chatEdgeSwipeOnly = false;
  const {
    onPointerDown: panelDismissDown,
    onPointerMove: panelDismissMove,
    onPointerUp: panelDismissUp,
    onPointerCancel: panelDismissCancel,
    onLostPointerCapture: panelDismissLostCapture,
    style: panelDismissTouchStyle,
  } = panelSwipeProps;

  const [roomEntered, setRoomEntered] = useState(embedInStack);
  useLayoutEffect(() => {
    if (embedInStack) {
      setRoomEntered(true);
      return;
    }
    setRoomEntered(false);
    const id = requestAnimationFrame(() => setRoomEntered(true));
    return () => cancelAnimationFrame(id);
  }, [chat.id, embedInStack]);

  const roomEnterStyle: React.CSSProperties = embedInStack
    ? { transform: "none", transition: "none" }
    : {
        transform: roomEntered ? chatPanelStyle.transform : "translate3d(100%, 0, 0)",
        transition: roomEntered
          ? (chatPanelStyle.transition ?? `transform ${SLIDE_DISMISS_MS}ms cubic-bezier(0.25, 1, 0.35, 1)`)
          : "transform 320ms cubic-bezier(0.25, 1, 0.35, 1)",
        boxShadow: chatPanelStyle.boxShadow,
      };

  if (!currentUser || !meId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">تعذّر فتح المحادثة — الجلسة غير متاحة.</p>
        <button
          type="button"
          className="rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
          onClick={onBack}
        >
          رجوع
        </button>
      </div>
    );
  }
  const me = currentUser;
  const nativeShell = isNativeCapacitorShell();

  return (
    <div
      ref={chatSwipeColumnRef}
      data-chat-swipe-column
      data-chat-dismiss-rtl="1"
      className={
        (embedInStack
          ? "chat-room-viewport relative flex h-full min-h-0 w-full flex-col overflow-hidden overscroll-none pointer-events-auto touch-manipulation "
          : (nativeShell
              ? "chat-room-solo absolute inset-0 z-[200] box-border flex justify-center overflow-hidden overscroll-none pointer-events-none touch-manipulation "
              : "chat-room-solo fixed inset-x-0 z-[200] box-border flex justify-center overflow-hidden overscroll-none pointer-events-none touch-manipulation ")) +
        (useIgDm ? "" : "bg-background")
      }
      style={
        embedInStack
          ? {
              ...(!embedInStack ? panelDismissTouchStyle : {}),
              ...(useIgDm && dmPalette && !chromeOnWallpaper ? igDmSurfaceStyle : {}),
            }
          : nativeShell
            ? {
                ...panelDismissTouchStyle,
                ...(useIgDm && dmPalette && !chromeOnWallpaper ? igDmSurfaceStyle : {}),
              }
            : {
                top: 0,
                height: "100dvh",
                maxHeight: "100dvh",
                ...panelDismissTouchStyle,
                ...(useIgDm && dmPalette && !chromeOnWallpaper ? igDmSurfaceStyle : {}),
              }
      }
      {...(chatEdgeSwipeOnly
        ? {}
        : {
            onPointerDownCapture: panelDismissDown,
            onPointerMoveCapture: panelDismissMove,
            onPointerUpCapture: panelDismissUp,
            onPointerCancelCapture: panelDismissCancel,
            onLostPointerCapture: panelDismissLostCapture,
          })}
    >
      {!embedInStack && <div {...edgeStripProps} data-chat-back-edge aria-label="سحب للرجوع من اليمين" />}
      {chromeOnWallpaper && chatWallpaperUrl ? (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-[208] mx-auto w-full max-w-md bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${chatWallpaperUrl})` }}
            aria-hidden
          />
          <div
            className="pointer-events-none fixed inset-0 z-[208] mx-auto w-full max-w-md"
            style={{ backgroundColor: `rgba(0,0,0,${activeWallpaper.overlayOpacity ?? 0.4})` }}
            aria-hidden
          />
        </>
      ) : null}
      <SlideDismissContext.Provider value={chatDismissCtx}>
      <div
        className={
          embedInStack
            ? "relative z-[210] mx-auto h-full w-full min-w-0 max-w-md overflow-hidden overscroll-none pointer-events-auto"
            : "relative z-[210] mx-auto h-full w-full min-w-0 max-w-md overflow-hidden overscroll-none pointer-events-auto"
        }
      >
      <div
        data-chat-room
        className={
          "chat-no-select pointer-events-auto relative flex h-full min-h-0 max-h-full w-full flex-col overflow-hidden " +
          (embedInStack ? "" : "will-change-transform ") +
          themeBg
        }
        style={{
          ...roomEnterStyle,
          ...(chromeOnWallpaper ? { background: "transparent" } : igDmSurfaceStyle),
          ...(dmPalette && !chromeOnWallpaper
            ? { ["--chat-surface" as string]: dmPalette.surface }
            : {}),
        }}
        {...chatNoSelectCaptureHandlers}
      >
      <div
        ref={chatHeaderRef}
        dir={useIgDm ? dmDir : "rtl"}
        data-chat-dismiss-handle
        className={
          "chat-room-header flex w-full shrink-0 items-center gap-2 px-3 py-3 pt-[max(0.75rem,var(--sat))] " +
          (isQuranChannel
            ? "bg-zinc-900 text-zinc-100 border-b border-zinc-700"
            : chromeOnWallpaper
              ? "border-b border-white/10 bg-black/40 text-white backdrop-blur-xl"
              : useIgDm && dmPalette
                ? "border-b border-transparent " + dmPalette.headerTitleClass
                : "border-b border-border bg-background")
        }
        style={
          chromeOnWallpaper
            ? undefined
            : useIgDm && !isQuranChannel
              ? {
                  ...igDmSurfaceStyle,
                  backdropFilter: "blur(24px) saturate(1.6)",
                  WebkitBackdropFilter: "blur(24px) saturate(1.6)",
                  background:
                    igDmSurfaceStyle?.backgroundColor === "#000000" || igDmSurfaceStyle?.backgroundColor === "#000"
                      ? "rgba(0,0,0,0.72)"
                      : "rgba(242,242,247,0.80)",
                  borderBottom:
                    igDmSurfaceStyle?.backgroundColor === "#000000" || igDmSurfaceStyle?.backgroundColor === "#000"
                      ? "0.5px solid rgba(255,255,255,0.10)"
                      : "0.5px solid rgba(0,0,0,0.08)",
                }
              : undefined
        }
      >
        <div className="relative z-[50] flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          data-no-dismiss-drag
          data-chat-back-btn
          aria-label="رجوع"
          className={
            "relative z-[60] flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-[transform,background-color] duration-150 ease-out active:scale-[0.88] " +
            (chromeOnWallpaper
              ? wallpaperIconClass
              : useIgDm && dmPalette
                ? dmPalette.iconBtnClass
                : "text-foreground hover:bg-secondary active:bg-secondary/90")
          }
          onClick={e => {
            e.stopPropagation();
            fireRoomBack();
          }}
          onPointerDown={e => {
            e.stopPropagation();
          }}
          onPointerDownCapture={e => {
            e.stopPropagation();
          }}
          onPointerUpCapture={e => {
            e.stopPropagation();
          }}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fireRoomBack();
            }
          }}
        >
          {useIgDm ? (
            dmRtl ? <ChevronRight size={22} strokeWidth={2} /> : <ChevronLeft size={22} strokeWidth={2} />
          ) : (
            <ChevronRight size={22} strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          onClick={() =>
            chat.isGroup || chat.isChannel
              ? onOpenSettings()
              : otherId && startTransition(() => onOpenProfile(otherId))
          }
          className="relative z-[10] flex min-w-0 flex-1 items-center gap-2 text-start justify-start"
        >
          <Avatar
            name={chat.isGroup ? chat.name! : other?.username || "?"}
            src={chat.isGroup ? chat.avatar : other?.avatar}
            size={36}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
              {chat.isChannel && <Megaphone size={14} />}
              <span className="truncate">{useIgDm && isDmRoom ? `@${other?.username || "?"}` : title}</span>
              {isDmRoom && (chat.streak?.streakCount ?? 0) > 0 && (
                <StreakBadge streak={chat.streak!} compact />
              )}
            </div>
            {useIgDm && isDmRoom && dmPalette && (
              <div className={"flex items-center gap-1.5 text-xs " + dmPalette.headerSubClass}>
                {peerIsTyping && !hideTypingStatus ? (
                  <span
                    className="font-medium animate-pulse"
                    style={{ color: CHAT_DM_ACCENT }}
                  >
                    {state.language === "en" ? "Typing…" : "جاري الكتابة…"}
                  </span>
                ) : peerOnline ? (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#3dd961]" aria-hidden />
                    <span className="text-[#3dd961]">
                      {state.language === "en" ? "Active now" : "متصل الآن"}
                    </span>
                  </>
                ) : null}
              </div>
            )}
            {!useIgDm && peerIsTyping && !hideTypingStatus && !chat.isGroup && !chat.isChannel && (
              <div className="text-xs font-medium text-blue-500 animate-pulse">
                {state.language === "en" ? "Typing…" : "جاري الكتابة…"}
              </div>
            )}
            {(chat.isGroup || chat.isChannel) && (
              <div className={"text-xs " + (isQuranChannel ? "text-zinc-400" : "text-muted-foreground")}>
                {chat.members.length} {t("members")}
              </div>
            )}
          </div>
        </button>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {!isQuranChannel && !chat.isChannel && (
            <>
              <button
                type="button"
                onClick={() => onCall(true)}
                aria-label="مكالمة فيديو"
                className={useIgDm && dmPalette ? dmPalette.iconBtnClass + " touch-manipulation p-1" : undefined}
              >
                <Video size={20} />
              </button>
              <button
                type="button"
                onClick={() => onCall(false)}
                aria-label="مكالمة صوتية"
                className={useIgDm && dmPalette ? dmPalette.iconBtnClass + " touch-manipulation p-1" : undefined}
              >
                <Phone size={20} />
              </button>
            </>
          )}
          {!chat.isGroup && !chat.isChannel && (
            <div className="relative z-50">
              <button
                type="button"
                data-no-dismiss-drag
                data-chat-privacy-menu-btn
                aria-label={state.language === "ar" ? "خيارات المحادثة" : "Chat options"}
                aria-expanded={showPrivacyMenu}
                className={
                  "touch-manipulation rounded-full p-2 " +
                  (useIgDm && dmPalette ? dmPalette.iconBtnClass : "hover:bg-secondary active:bg-secondary/90")
                }
                onPointerDownCapture={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  setShowPrivacyMenu(o => !o);
                }}
              >
                {useIgDm ? <MoreHorizontal size={20} /> : <MoreVertical size={20} />}
              </button>
              {showPrivacyMenu && (
                <div
                  data-chat-privacy-menu
                  className={
                    "absolute end-0 top-10 z-[60] w-48 rounded-lg border shadow-lg " +
                    (useIgDm && dmPalette ? dmPalette.menuPanelClass : "border-border bg-background")
                  }
                  onPointerDownCapture={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setHideReadStatus(!hideReadStatus);
                      setShowPrivacyMenu(false);
                    }}
                    className={
                      "flex w-full items-center justify-between px-4 py-3 text-start " +
                      (useIgDm && dmPalette ? dmPalette.menuItemHoverClass : "hover:bg-secondary")
                    }
                  >
                    <span>إخفاء حالة القراءة</span>
                    {hideReadStatus && <Check size={16} />}
                  </button>
                  <button
                    onClick={() => {
                      setHideTypingStatus(!hideTypingStatus);
                      setShowPrivacyMenu(false);
                    }}
                    className={
                      "flex w-full items-center justify-between px-4 py-3 text-start " +
                      (useIgDm && dmPalette ? dmPalette.menuItemHoverClass : "hover:bg-secondary")
                    }
                  >
                    <span>إخفاء حالة الكتابة</span>
                    {hideTypingStatus && <Check size={16} />}
                  </button>
                </div>
              )}
            </div>
          )}
          {(chat.isGroup || chat.isChannel) && (
            <button type="button" onClick={onOpenSettings}>
              <SettingsIcon size={20} />
            </button>
          )}
          {!isQuranChannel && (
            <button
              type="button"
              aria-label={state.language === "en" ? "Chat theme" : "سمة المحادثة"}
              className={
                "flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full " +
                (chromeOnWallpaper
                  ? wallpaperIconClass
                  : useIgDm && dmPalette
                    ? dmPalette.iconBtnClass
                    : "text-foreground hover:bg-secondary active:bg-secondary/90")
              }
              onClick={() => setShowChatThemePicker(true)}
            >
              <Palette size={20} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="chat-bottom-lift flex min-h-0 flex-1 flex-col overflow-hidden">
      {isDmRoom && vanishMode && (
        <p className="sr-only">
          وضع مخفي — الرسائل الجديدة لا تُحفظ بالكامل. اسحب من أسفل منطقة الإدخال إلى الأعلى لتعطيل الوضع وحذف رسائل هذا الوضع.
        </p>
      )}

      {(chat.pinnedMessageIds || []).some(mid => (chat.messages || []).some(x => x.id === mid)) && (
        <div
          className={
            "no-scrollbar flex shrink-0 flex-nowrap gap-2 overflow-x-scroll overflow-y-hidden overscroll-x-none border-b px-2 py-1.5 touch-pan-x snap-x snap-mandatory " +
            (isQuranChannel ? "border-zinc-700 bg-zinc-900/95" : "border-border bg-muted/45")
          }
        >
          {(chat.pinnedMessageIds || [])
            .filter(mid => (chat.messages || []).some(x => x.id === mid))
            .map(mid => {
              const pm = (chat.messages || []).find(x => x.id === mid)!;
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
                  <span className="min-w-0 flex-1 truncate font-medium">{chatReplyPreview(pm)}</span>
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

      {showDmIntro && (
        <ChatDmIntroCard
          other={other!}
          meId={meId}
          state={state}
          isQuran={isQuranChannel}
          hasMessages={false}
          onOpenProfile={() => startTransition(() => onOpenProfile(otherId!))}
        />
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {useIgDm && chatTimelineRows && (
          <ChatFloatingDatePill
            scrollRef={messagesScrollRef}
            rows={chatTimelineRows}
            visible={!drawComposeOpen && displayMessages.length > 0}
            chromeOnWallpaper={chromeOnWallpaper}
            dayPillBg={dmPalette?.dayPillBg}
            dayPillText={dmPalette?.dayPillText}
          />
        )}
      <div
        ref={messagesScrollRef}
        onScroll={onMessagesScroll}
        onPointerDownCapture={onMessagesVanishPointerDownCapture}
        onPointerMove={handleVanishPullMove}
        onPointerUp={handleVanishPullUp}
        onPointerCancel={handleVanishPullUp}
        dir="ltr"
        className={
          "chat-scroll-pane chat-no-select no-scrollbar relative min-h-0 flex-1 touch-pan-y overscroll-none " +
          (drawComposeOpen ? "overflow-hidden " : "overflow-y-auto ") +
          (isQuranChannel ? "bg-zinc-950" : chromeOnWallpaper ? "bg-transparent" : useIgDm ? "" : "bg-background")
        }
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          overflowAnchor: "none",
          ...(useIgDm && dmPalette && !chromeOnWallpaper ? igDmSurfaceStyle : {}),
        }}
      >
        <div
          className={
            "flex min-h-full w-full flex-col justify-end gap-2 px-3 pt-2 " +
            (isQuranChannel ? "bg-zinc-950" : chromeOnWallpaper ? "bg-transparent" : "")
          }
          style={{
            paddingBottom: "12px",
          }}
        >
        {(hasOlderMessages || loadingOlderUi) && (
          <div className="flex w-full justify-center py-2" aria-busy={loadingOlderUi}>
            {loadingOlderUi ? (
              <div className="flex gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40 [animation-delay:120ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:240ms]" />
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground opacity-60">
                {state.language === "ar" ? "↑ رسائل أقدم" : "↑ Older messages"}
              </span>
            )}
          </div>
        )}
        {rowsToRender.map(row => {
          if (row.kind === "day") {
            return (
              <div key={row.key} data-chat-day={row.key} className="flex w-full justify-center py-2">
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-medium"
                  style={
                    chromeOnWallpaper
                      ? { backgroundColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)" }
                      : dmPalette
                        ? { backgroundColor: dmPalette.dayPillBg, color: dmPalette.dayPillText }
                        : undefined
                  }
                >
                  {row.label}
                </span>
              </div>
            );
          }
          const m = row.message;
          const groupSystemEvent =
            (chat.isGroup || chat.isChannel) && m.type === "text"
              ? parseGroupSystemEvent(messageContent(m))
              : null;
          if (groupSystemEvent) {
            const systemMuted =
              chromeOnWallpaper || dmPalette ? "text-white/70" : "text-muted-foreground";
            const systemUserBtn =
              "font-semibold text-primary underline-offset-2 hover:underline active:opacity-80";
            return (
              <div key={m.id} className="flex w-full justify-center px-3 py-3">
                <p
                  className={
                    "max-w-[94%] text-center text-[13px] leading-snug font-medium " +
                    (chromeOnWallpaper || dmPalette ? "text-white/90" : "text-foreground/90")
                  }
                >
                  <button
                    type="button"
                    className={systemUserBtn}
                    onClick={() => openMentionProfile(groupSystemEvent.actor)}
                  >
                    @{groupSystemEvent.actor}
                  </button>{" "}
                  <span className={systemMuted}>{groupSystemEvent.action}</span>{" "}
                  <button
                    type="button"
                    className={systemUserBtn}
                    onClick={() => openMentionProfile(groupSystemEvent.target)}
                  >
                    @{groupSystemEvent.target}
                  </button>
                </p>
              </div>
            );
          }
          const showPeerAvatar = row.showPeerAvatar;
          const mine = isOwnChatMessage(m.senderId, state, { directMessagePeerId: otherId });
          const senderProfile = userById(state, m.senderId);
          const mc = messageContent(m);
          const bareSticker = m.type === "sticker" && (isStickerImageContent(mc) || isStickerVideoContent(mc));
          const bareImage = m.type === "image" && mc.startsWith("data:") && !m.viewOnce;
          const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(mc) && !m.viewOnce;
          const bareVideo = m.type === "video" && !m.viewOnce;
          const bareVoiceBubble = m.type === "voice";
          const bareViewOnceMedia =
            ((m.type === "image" || m.type === "video") && !!m.viewOnce && mc.startsWith("data:")) ||
            (m.type === "drawing" && !!m.viewOnce);
          const bareMedia =
            bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing;
          const colClass = bareVideo
            ? CHAT_INLINE_MEDIA_COL
            : bareVoiceBubble
              ? "w-max max-w-[min(92vw,288px)] shrink-0"
              : bareImage || bareDrawing
                ? CHAT_INLINE_MEDIA_COL
                : bareSticker || bareViewOnceMedia
                  ? "w-fit max-w-[min(90vw,280px)] shrink"
                  : CHAT_TEXT_BUBBLE_COL;
          const bubbleBase = bareMedia
            ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible outline-none"
            : chatBubbleFilledClass(mine, isQuranChannel, theme, useIgDm, dmPalette ?? undefined);
          const bubbleClass =
            bubbleBase +
            (!bareMedia && vanishMode && m.id.startsWith("vx_")
              ? " ring-2 ring-orange-500/50 border border-orange-400/40"
              : "");
          const bubbleInlineStyle =
            useIgDm && dmPalette && !mine && !bareMedia ? chatDmPeerBubbleStyle(dmPalette) : undefined;
          const showBubbleTime = useIgDm && !bareMedia;
          return (
            <ChatSwipeMessageRow
              key={m.id}
              message={m}
              mine={mine}
              isQuran={isQuranChannel}
              avatarName={!mine && showPeerAvatar ? senderProfile?.username || "?" : undefined}
              avatarSrc={!mine && showPeerAvatar ? senderProfile?.avatar : undefined}
              reservePeerAvatarSlot={!mine && !showPeerAvatar}
              onAvatarClick={
                !mine ? () => startTransition(() => onOpenProfile(m.senderId)) : undefined
              }
              onSwipeReply={() => {
                swipeReplyLockRef.current = true;
                startTransition(() => setReplyingTo(m));
              }}
              onPointerDown={onMsgPointerDown}
              onPointerMove={onMsgPointerMove}
              onPointerUp={onMsgPointerUp}
            >
              <div
                ref={el => {
                  // ref callback لا تُعيد render — يعمل مباشرة على Map بدون state
                  if (el) messageElRefs.current.set(m.id, el);
                  else messageElRefs.current.delete(m.id);
                }}
                className={
                  "relative flex w-max flex-col gap-0.5 " +
                  colClass +
                  " " +
                  (useIgDm ? chatBubbleAlignClasses(mine) : mine ? "items-end self-end" : "items-start self-start")
                }
              >
                {(chat.isGroup || chat.isChannel) && !mine && (
                  <div className="mb-0.5 px-0.5 text-[11px] font-semibold text-muted-foreground">
                    {chat.groupNicknames?.[m.senderId]?.trim() || senderProfile?.username || "?"}
                  </div>
                )}
                <div className={bubbleClass} style={bubbleInlineStyle}>
                  {renderBubbleContent(m, mine)}
                  {showBubbleTime && (
                    <div
                      className="mt-0.5 flex items-center justify-end gap-0.5"
                      style={
                        useIgDm && dmPalette
                          ? { color: mine ? dmPalette.mineTime : dmPalette.peerTime }
                          : undefined
                      }
                    >
                      <span className="text-[11px] tabular-nums leading-none">
                        {formatChatBubbleTime(m.createdAt, state.language)}
                      </span>
                      {mine && !vanishMode && (
                        <ChatMessageStatus status={m.status} mine compact />
                      )}
                    </div>
                  )}
                  {mine && !vanishMode && !useIgDm && (
                    <span className="mt-1 flex justify-end">
                      <ChatMessageStatus status={m.status} mine compact />
                    </span>
                  )}
                </div>
                {m.reactions && m.reactions.length > 0 && (
                  <div
                    className={
                      "-mt-2 z-[1] flex flex-wrap items-center gap-0.5 " +
                      (useIgDm
                        ? chatReactionAlignClasses(mine)
                        : mine
                          ? "self-end pe-1"
                          : "self-start ps-1")
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
            </ChatSwipeMessageRow>
          );
        })}
        {seenFooter && (
          <div className={"text-end text-[11px] px-1 pt-1 " + (isQuranChannel ? "text-zinc-500" : "text-muted-foreground")}>{seenFooter}</div>
        )}
        {isDmRoom && myOutgoing.length > 0 && !seenFooter && !useIgDm && (
          <div className="flex justify-end px-1 pt-0.5">
            <ChatMessageStatus status={myOutgoing[myOutgoing.length - 1]?.status} mine compact />
          </div>
        )}
        </div>
        {isDmRoom && canPost && (
          <div
            role="presentation"
            aria-hidden
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-[12] h-14 touch-none"
            onPointerDown={e => {
              if (e.pointerType === "mouse" && e.button !== 0) return;
              const t = e.target as HTMLElement;
              if (t.closest("button, a, input, textarea, select")) return;
              handleVanishPullDown(e);
            }}
            onPointerMove={handleVanishPullMove}
            onPointerUp={handleVanishPullUp}
            onPointerCancel={handleVanishPullUp}
          />
        )}
        {drawComposeOpen && (
          <ChatDrawComposeModal
            overMessages
            isQuranChannel={isQuranChannel}
            senderName={me.username}
            senderAvatar={me.avatar}
            onClose={() => setDrawComposeOpen(false)}
            onSend={({ type, content, viewOnce }) => {
              const rt = replyingTo ? { id: replyingTo.id, content: chatReplyPreview(replyingTo), type: replyingTo.type } : undefined;
              dispatchSend({
                type,
                content,
                ...(viewOnce ? { viewOnce: true } : {}),
                ...(rt ? { replyTo: rt } : {}),
              });
              setReplyingTo(null);
            }}
          />
        )}
      </div>
      </div>

      {messageContext &&
        (() => {
          const m = messageContext;
          const mine = isOwnChatMessage(m.senderId, state, { directMessagePeerId: otherId });
          const mc = messageContent(m);
          const bareSticker = m.type === "sticker" && (isStickerImageContent(mc) || isStickerVideoContent(mc));
          const bareImage = m.type === "image" && mc.startsWith("data:") && !m.viewOnce;
          const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(mc) && !m.viewOnce;
          const bareVideo = m.type === "video" && !m.viewOnce;
          const bareVoiceBubble = m.type === "voice";
          const bareViewOnceMedia =
            ((m.type === "image" || m.type === "video") && !!m.viewOnce && mc.startsWith("data:")) ||
            (m.type === "drawing" && !!m.viewOnce);
          const bubbleClass =
            bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing
              ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible outline-none"
              : chatBubbleFilledClass(mine, isQuranChannel, theme, useIgDm, dmPalette ?? undefined) +
                " shadow-lg";
          const ctxBubbleStyle =
            useIgDm && dmPalette && !mine ? chatDmPeerBubbleStyle(dmPalette) : undefined;

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
              } else if (m.type === "drawing" && m.viewOnce) {
                await navigator.clipboard.writeText("[رسم مرة واحدة]");
              } else if (m.type === "sticker" && !isStickerImageContent(m.content) && !isStickerVideoContent(m.content)) {
                await navigator.clipboard.writeText(m.content);
              } else if (typeof m.content === "string" && m.content.length < 400_000) {
                await navigator.clipboard.writeText(m.content);
              } else {
                await navigator.clipboard.writeText(`[${m.type}]`);
              }
            } catch {
              try {
                await navigator.clipboard.writeText(chatReplyPreview(m));
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
                    <div className={bubbleClass} style={ctxBubbleStyle}>
                  {renderBubbleContent(m, mine)}
                  {mine && !vanishMode && (
                    <span className="mt-1 flex justify-end">
                      <ChatMessageStatus status={m.status} mine compact />
                    </span>
                  )}
                </div>
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

      {/* Pool game invite modal — داخل ChatRoom مباشرة */}
      {showPoolInviteModal && (
        <div
          className="absolute inset-0 z-[80] flex items-end bg-black/60"
          onClick={() => setShowPoolInviteModal(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-background p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-center text-base font-bold">اختر لعبة 🎮</h3>
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-2xl bg-secondary p-4 text-start hover:bg-secondary/80 active:scale-[0.98] transition-transform"
              onClick={() => {
                setShowPoolInviteModal(false);
                const content = `__game_invite__:pool:${meId}:${Date.now()}`;
                dispatchSend({ type: "text", content });
              }}
            >
              <span className="text-4xl">🎱</span>
              <div>
                <div className="font-bold text-foreground">بلياردو 8 كرات</div>
                <div className="text-sm text-muted-foreground">
                  تحدَّ صديقك في لعبة بلياردو ملحمية
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Pool game screen — داخل ChatRoom */}
      {localPoolRoomId && (
        <PoolGame
          key={localPoolRoomId}
          roomId={localPoolRoomId}
          chatId={sendChatId}
          onClose={() => setLocalPoolRoomId(null)}
          onGameEnd={(winnerId, winnerName) => {
            setLocalPoolRoomId(null);
            const resultText = `🎱 انتهت المباراة\nالفائز: @${winnerName ?? "؟"}`;
            dispatchSend({ type: "text", content: resultText });
          }}
        />
      )}

      {showStickers && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-[34] bg-black/25"
            aria-label="إغلاق الملصقات"
            onClick={() => setShowStickers(false)}
          />
          <div className="relative z-[36] shrink-0 max-h-[72vh]">
            <ChatStickerPicker
              isQuranChannel={isQuranChannel}
              userStickers={state.stickers.filter(s => s.userId === me.id)}
              favoriteStickerContents={me.favoriteStickerContents || []}
              createdStickerContents={me.createdStickerContents || []}
              onPick={pickSticker}
              onClose={() => setShowStickers(false)}
            />
          </div>
        </>
      )}

      <div className="chat-composer-spacer" aria-hidden />
      <div
        ref={composerRef}
        className={
          "chat-composer-dock isolate " +
          (chromeOnWallpaper ? "backdrop-blur-xl bg-black/30" : "")
        }
        style={{ ["--chat-composer-bottom-pad" as string]: composerBottomPad }}
      >
      {!canPost ? (
        <div
          className={
            "p-4 text-center text-sm border-t border-border " +
            "pb-[var(--chat-composer-bottom-pad)] " +
            " " +
            (isQuranChannel ? "text-zinc-400 bg-zinc-900 border-zinc-700" : "text-muted-foreground bg-background")
          }
        >
          <div className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">
            <Lock size={14} />
            الكتابة مقفلة
          </div>
          <p className="mt-2 text-sm">{blockedComposerReason || t("onlyOwner")}</p>
        </div>
      ) : (
        <div
          className={
            isQuranChannel
              ? "border-t border-zinc-700 bg-zinc-900"
              : "bg-transparent"
          }
        >
          {replyingTo && (
            <ChatComposerReplyBar
              isQuran={isQuranChannel}
              authorLabel={
                replyingTo.senderId === me.id
                  ? `${t("chatReplyingTo")} · رسالتك`
                  : `${t("chatReplyingTo")} @${userById(state, replyingTo.senderId)?.username || "?"}`
              }
              preview={chatReplyPreview(replyingTo)}
              onClose={() => setReplyingTo(null)}
            />
          )}
          {!chat.isChannel && mentionPick && (
            <div className="max-h-40 overflow-y-auto border-b border-border/60 bg-card px-2 py-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold hover:bg-secondary"
                onClick={() => pickMention("all")}
              >
                <AtSign size={16} className="shrink-0 text-primary" />
                منشن عام (@all) — إشعار للجميع
              </button>
              {groupMentionOptions.map(u => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm hover:bg-secondary"
                  onClick={() => pickMention(u.username)}
                >
                  <Avatar name={u.username} src={u.avatar} size={28} />
                  @{u.username}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={e => {
              e.preventDefault();
              submitTextMessage();
            }}
            className="chat-composer-bar bg-transparent px-3 pt-2 pb-2"
          >
            {useIgDm ? (
            <div dir="ltr" className="relative flex min-h-[44px] items-end gap-2.5">
              <div
                dir="ltr"
                className="flex min-h-[44px] min-w-0 flex-1 flex-nowrap items-center gap-0.5 rounded-[24px] px-2 py-1"
                style={
                  dmPalette
                    ? {
                        backgroundColor: chromeOnWallpaper
                          ? "rgba(255,255,255,0.12)"
                          : dmPalette.composerField,
                      }
                    : undefined
                }
              >
              {!composerHasText &&
                (recording ? (
                  <button
                    type="button"
                    className={
                      "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-red-500 " +
                      (dmPalette?.composerIconClass ?? "hover:bg-white/10")
                    }
                    aria-label={t("stop")}
                    onClick={stopRecording}
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : composerMicCooldown ? (
                  <div className="h-8 w-8 shrink-0 touch-none pointer-events-none" aria-hidden />
                ) : (
                  <>
                    <button
                      type="button"
                      className={
                        "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full transition " +
                        (dmPalette?.composerIconClass ?? "text-zinc-300 hover:bg-white/10")
                      }
                      style={{ touchAction: "none" }}
                      aria-label="تسجيل صوتي"
                      onClick={() => {
                        if (Date.now() < blockMicUntilRef.current) return;
                        void startRecording();
                      }}
                    >
                      <Mic size={19} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      {...galleryLongPressBtnProps}
                      className={
                        "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full transition " +
                        (dmPalette?.composerIconClass ?? "text-zinc-300 hover:bg-white/10")
                      }
                      aria-label="معرض الصور"
                      onClick={() => {
                        setPlusAttachOpen(false);
                        onGalleryButtonClick();
                      }}
                      onPointerDown={e => {
                        setPlusAttachOpen(false);
                        onGalleryPointerDown(e);
                      }}
                      onPointerMove={onGalleryPointerMove}
                      onPointerUp={clearGalleryLongPress}
                      onPointerCancel={clearGalleryLongPress}
                      onPointerLeave={clearGalleryLongPress}
                      onTouchStart={onGalleryTouchStart}
                      onTouchMove={onGalleryTouchMove}
                      onTouchEnd={onGalleryTouchEnd}
                      onTouchCancel={onGalleryTouchEnd}
                    >
                      <ImageIcon size={19} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={
                        "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full transition " +
                        (dmPalette?.composerIconClass ?? "text-zinc-300 hover:bg-white/10")
                      }
                      aria-label="إيموجي وملصقات"
                      onClick={() => {
                        setPlusAttachOpen(false);
                        toggleStickerPanel();
                      }}
                    >
                      <Sticker size={19} strokeWidth={2} />
                    </button>
                  </>
                ))}
              <MentionComposerField
                textareaRef={composerInputRef}
                rows={1}
                dir="auto"
                value={text}
                onChange={onComposerChange}
                mentionVariant="composer"
                wrapperClassName="chat-allow-select min-w-0 flex-1"
                overlayClassName={
                  "py-1.5 text-[16px] leading-5 " +
                  (dmPalette ? dmPalette.composerTextClass : "text-white")
                }
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={e => {
                  composingRef.current = false;
                  onComposerChange(e.currentTarget.value);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitTextMessage();
                  }
                }}
                onFocus={onComposerFocus}
                placeholder={t("typeMessage")}
                aria-label={t("typeMessage")}
                className={
                  "chat-allow-select no-scrollbar min-h-[20px] min-w-0 max-h-[100px] flex-1 resize-none overflow-y-hidden py-1.5 text-[16px] leading-5 whitespace-pre-wrap break-words bg-transparent outline-none " +
                  (dmPalette
                    ? dmPalette.composerTextClass + " " + dmPalette.composerPlaceholderClass
                    : "text-white caret-white placeholder:text-zinc-500")
                }
                style={{ height: CHAT_COMPOSER_LINE_PX }}
              />
              {composerHasText ? (
                <button
                  type="button"
                  className={
                    "relative z-[57] flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.18)] transition-all duration-150 hover:opacity-90 active:scale-[0.88] " +
                    (sendPulse ? "chat-send-pulse" : "")
                  }
                  style={{
                    background: "rgba(255,255,255,1)",
                    color: "#000",
                  }}
                  aria-label={t("send")}
                  onPointerUp={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    blockMicUntilRef.current = Date.now() + 520;
                    submitTextMessage();
                  }}
                >
                  <Send size={17} strokeWidth={2.5} className="pointer-events-none ltr:-rotate-12" style={{ color: "#000" }} />
                </button>
              ) : null}
              </div>
              <div ref={plusAttachMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  className={
                    "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full transition active:scale-[0.88] hover:opacity-90 " +
                    (dmPalette?.composerIconClass ?? "text-white/80 hover:bg-white/10")
                  }
                  aria-label="إرفاق"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation();
                    setPlusAttachOpen(o => !o);
                  }}
                >
                  <Plus size={20} strokeWidth={2.25} />
                </button>
                {plusAttachOpen && (
                  <div
                    className="absolute bottom-[calc(100%+12px)] end-0 z-[60] min-w-[13rem] overflow-hidden rounded-[22px] py-1.5"
                    style={{
                      backdropFilter: "blur(28px) saturate(1.8)",
                      WebkitBackdropFilter: "blur(28px) saturate(1.8)",
                      background:
                        igDmSurfaceStyle?.backgroundColor === "#000000" || igDmSurfaceStyle?.backgroundColor === "#000"
                          ? "rgba(30,30,30,0.88)"
                          : "rgba(255,255,255,0.82)",
                      border:
                        igDmSurfaceStyle?.backgroundColor === "#000000" || igDmSurfaceStyle?.backgroundColor === "#000"
                          ? "0.5px solid rgba(255,255,255,0.12)"
                          : "0.5px solid rgba(0,0,0,0.08)",
                      boxShadow: "0 8px 40px rgba(0,0,0,0.30), 0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  >
                    <button
                      type="button"
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-medium transition-colors duration-100 " +
                        (dmPalette?.attachMenuItemClass ?? "text-white hover:bg-white/10")
                      }
                      onClick={() => {
                        setPlusAttachOpen(false);
                        setInstagramCameraOpen(true);
                      }}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                        <Camera size={15} strokeWidth={2} />
                      </span>
                      <span>{state.language === "ar" ? "كاميرا" : "Camera"}</span>
                    </button>
                    <button
                      type="button"
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-medium transition-colors duration-100 " +
                        (dmPalette?.attachMenuItemClass ?? "text-white hover:bg-white/10")
                      }
                      onClick={() => {
                        setPlusAttachOpen(false);
                        galleryMediaInputRef.current?.click();
                      }}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                        <ImageIcon size={15} strokeWidth={2} />
                      </span>
                      <span>{state.language === "ar" ? "الصور" : "Photos"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isGuest}
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-medium transition-colors duration-100 " +
                        (dmPalette?.attachMenuItemClass ?? "text-white hover:bg-white/10") +
                        (isGuest ? " cursor-not-allowed opacity-40" : "")
                      }
                      onClick={openGalleryVideoVoiceStudio}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                        <Video size={15} strokeWidth={2} />
                      </span>
                      <span>
                        {state.language === "ar" ? "استديو — مقطع كصوت" : "Studio — voice clip"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={isGuest}
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-medium transition-colors duration-100 " +
                        (dmPalette?.attachMenuItemClass ?? "text-white hover:bg-white/10") +
                        (isGuest ? " cursor-not-allowed opacity-40" : "")
                      }
                      onClick={() => {
                        setPlusAttachOpen(false);
                        if (isGuest) { notifyGuestActionBlocked(); return; }
                        setShowStickers(true);
                      }}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                        <Sticker size={15} strokeWidth={2} />
                      </span>
                      <span>{state.language === "ar" ? "ملصقات" : "Stickers"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isGuest}
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-medium transition-colors duration-100 " +
                        (dmPalette?.attachMenuItemClass ?? "text-white hover:bg-white/10") +
                        (isGuest ? " cursor-not-allowed opacity-40" : "")
                      }
                      onClick={() => {
                        setPlusAttachOpen(false);
                        if (isGuest) { notifyGuestActionBlocked(); return; }
                        setDrawComposeOpen(true);
                      }}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                        <PenLine size={15} strokeWidth={2} />
                      </span>
                      <span>{state.language === "ar" ? "رسم وكتابة" : "Draw"}</span>
                    </button>
                    {isDmRoom && (
                      <button
                        type="button"
                        disabled={isGuest}
                        className={
                          "flex w-full items-center gap-3 px-4 py-3 text-start text-[14px] font-medium transition-colors duration-100 " +
                          (dmPalette?.attachMenuItemClass ?? "text-white hover:bg-white/10") +
                          (isGuest ? " cursor-not-allowed opacity-40" : "")
                        }
                        onClick={() => {
                          setPlusAttachOpen(false);
                          if (isGuest) { notifyGuestActionBlocked(); return; }
                          setShowPoolInviteModal(true);
                        }}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[13px]">🎱</span>
                        <span>{state.language === "ar" ? "إنشاء لعبة" : "Game"}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            ) : (
            <div dir="ltr" className="relative flex min-h-[44px] items-end gap-2.5">
            <div
              className={
                "relative flex min-h-[44px] min-w-0 flex-1 flex-nowrap items-center gap-0.5 rounded-[24px] px-2 py-1 " +
                (isQuranChannel ? "bg-zinc-900" : "bg-secondary/80 dark:bg-zinc-800/90")
              }
            >
              {!composerHasText && !recording && !composerMicCooldown && (
              <>
              <button
                type="button"
                className={
                  "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/85 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "")
                }
                aria-label="تسجيل صوتي"
                onClick={() => {
                  if (Date.now() < blockMicUntilRef.current) return;
                  void startRecording();
                }}
              >
                <Mic size={19} strokeWidth={2} className="pointer-events-none" />
              </button>
              <button
                type="button"
                {...galleryLongPressBtnProps}
                className={
                  "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/85 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "")
                }
                style={{ touchAction: "none" }}
                aria-label="معرض الصور"
                onClick={() => {
                  setPlusAttachOpen(false);
                  onGalleryButtonClick();
                }}
                onPointerDown={e => {
                  setPlusAttachOpen(false);
                  onGalleryPointerDown(e);
                }}
                onPointerMove={onGalleryPointerMove}
                onPointerUp={clearGalleryLongPress}
                onPointerCancel={clearGalleryLongPress}
                onPointerLeave={clearGalleryLongPress}
                onTouchStart={onGalleryTouchStart}
                onTouchMove={onGalleryTouchMove}
                onTouchEnd={onGalleryTouchEnd}
                onTouchCancel={onGalleryTouchEnd}
              >
                <ImageIcon size={19} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={
                  "flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/85 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "")
                }
                aria-label="ملصقات"
                onClick={() => {
                  setPlusAttachOpen(false);
                  toggleStickerPanel();
                }}
              >
                <Sticker size={19} strokeWidth={2} />
              </button>
              </>
              )}
              {recording && (
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                  aria-label={t("stop")}
                  onClick={stopRecording}
                >
                  <Square size={15} fill="currentColor" />
                </button>
              )}
              {composerMicCooldown && !composerHasText && !recording && (
                <div className="h-8 w-8 shrink-0 touch-none pointer-events-none" aria-hidden />
              )}
              <MentionComposerField
                textareaRef={composerInputRef}
                rows={1}
                dir="auto"
                value={text}
                onChange={onComposerChange}
                mentionVariant={isQuranChannel ? "composerQuran" : "composer"}
                wrapperClassName="chat-allow-select min-w-0 flex-1"
                overlayClassName={
                  "py-1.5 text-[16px] leading-5 " +
                  (isQuranChannel ? "text-emerald-50" : "text-zinc-900 dark:text-zinc-50")
                }
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={e => {
                  composingRef.current = false;
                  onComposerChange(e.currentTarget.value);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitTextMessage();
                  }
                }}
                onFocus={onComposerFocus}
                placeholder={t("typeMessage")}
                aria-label={t("typeMessage")}
                className={
                  "chat-allow-select no-scrollbar min-h-[20px] min-w-0 max-h-[100px] flex-1 resize-none overflow-y-hidden py-1.5 text-[16px] leading-5 whitespace-pre-wrap break-words outline-none " +
                  (isQuranChannel
                    ? "caret-emerald-200 placeholder:text-emerald-200/55"
                    : "caret-zinc-800 placeholder:text-zinc-500/65 dark:caret-zinc-200 dark:placeholder:text-zinc-400/60")
                }
                style={{ height: CHAT_COMPOSER_LINE_PX }}
              />

              {composerHasText ? (
                <button
                  type="button"
                  className="relative z-[57] flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#0084ff] text-white shadow-sm transition hover:bg-[#0073e6] active:scale-[0.97]"
                  aria-label={t("send")}
                  onPointerUp={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    blockMicUntilRef.current = Date.now() + 520;
                    submitTextMessage();
                  }}
                >
                  <Send size={18} strokeWidth={2.25} className="pointer-events-none ltr:-rotate-12" />
                </button>
              ) : null}
            </div>
            <div ref={plusAttachMenuRef} className="relative shrink-0">
              <button
                type="button"
                className={
                  "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/90 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "")
                }
                aria-label="إرفاق"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  setPlusAttachOpen(o => !o);
                }}
              >
                <Plus size={19} strokeWidth={2.25} />
              </button>
              {plusAttachOpen && (
                <div
                  className={
                    "absolute bottom-[calc(100%+10px)] end-0 z-[60] min-w-[12rem] overflow-hidden rounded-2xl border py-1 shadow-xl " +
                    (isQuranChannel ? "border-zinc-700 bg-zinc-900" : "border-border bg-popover")
                  }
                >
                  <button
                    type="button"
                    className={
                      "flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-secondary " +
                      (isQuranChannel ? "text-zinc-100" : "")
                    }
                    onClick={() => {
                      setPlusAttachOpen(false);
                      setInstagramCameraOpen(true);
                    }}
                  >
                    <Camera size={18} /> <span>{state.language === "ar" ? "كاميرا" : "Camera"}</span>
                  </button>
                  <button
                    type="button"
                    disabled={isGuest}
                    className={
                      "flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-secondary " +
                      (isQuranChannel ? "text-zinc-100" : "") +
                      (isGuest ? " cursor-not-allowed opacity-40" : "")
                    }
                    onClick={() => {
                      setPlusAttachOpen(false);
                      if (isGuest) { notifyGuestActionBlocked(); return; }
                      setDrawComposeOpen(true);
                    }}
                  >
                    <PenLine size={18} /> <span>رسم وكتابة</span>
                  </button>
                  <button
                    type="button"
                    disabled={isGuest}
                    className={
                      "flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-secondary " +
                      (isQuranChannel ? "text-zinc-100" : "") +
                      (isGuest ? " cursor-not-allowed opacity-40" : "")
                    }
                    onClick={openGalleryVideoVoiceStudio}
                  >
                    <Video size={18} /> <span>استديو — مقطع كصوت</span>
                  </button>
                  {isDmRoom && (
                    <button
                      type="button"
                      disabled={isGuest}
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-secondary " +
                        (isQuranChannel ? "text-zinc-100" : "") +
                        (isGuest ? " cursor-not-allowed opacity-40" : "")
                      }
                      onClick={() => {
                        setPlusAttachOpen(false);
                        if (isGuest) { notifyGuestActionBlocked(); return; }
                        setShowPoolInviteModal(true);
                      }}
                    >
                      <span>🎱</span> <span>إنشاء لعبة</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            </div>
            )}

              <input
                ref={galleryMediaInputRef}
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={onGalleryMediaPick}
              />
              <input
                ref={galleryVideoVoiceInputRef}
                type="file"
                accept="video/*,audio/*"
                hidden
                onChange={onGalleryVideoVoicePick}
              />
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
          </form>
        </div>
      )}
      </div>
      </div>
      <InstagramCamera
        open={instagramCameraOpen}
        language={state.language}
        onClose={() => setInstagramCameraOpen(false)}
        onCapture={cap => setCameraCompose({ kind: cap.kind, dataUrl: cap.dataUrl })}
        onFallback={() => cameraCaptureRef.current?.click()}
      />
      {cameraCompose && (
        <CameraCaptureShareScreen
          draft={cameraCompose}
          language={state.language}
          mode="chat"
          onSendToChat={payload => {
            dispatchSend({
              type: payload.type,
              content: payload.content,
              ...(payload.shareText ? { shareText: payload.shareText } : {}),
            });
          }}
          onClose={() => setCameraCompose(null)}
        />
      )}
      {viewOnceOverlay && (
        <ViewOnceMediaOverlay
          media={viewOnceOverlay.type === "video" ? "video" : viewOnceOverlay.type === "drawing" ? "drawing" : "image"}
          src={viewOnceOverlay.content}
          onClose={() => {
            markViewOnceOpened(chat.id, viewOnceOverlay.id);
            setViewOnceOverlay(null);
          }}
        />
      )}
      {inlineMediaViewer &&
        !inlineMediaViewer.viewOnce &&
        (inlineMediaViewer.type === "image" || inlineMediaViewer.type === "video") && (
          <ChatInlineMediaLightbox
            media={inlineMediaViewer.type === "video" ? "video" : "image"}
            src={inlineMediaViewer.content}
            sender={inlineMediaLightboxUser}
            senderLabel={inlineMediaLightboxLabel}
            onClose={() => setInlineMediaViewer(null)}
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
      <ChatThemePickerSheet
        open={showChatThemePicker}
        selectedId={wallpaperId}
        language={state.language}
        onClose={() => setShowChatThemePicker(false)}
        onSelect={id => {
          setWallpaperId(id);
          saveChatWallpaperForChat(chat, meId, id);
          setShowChatThemePicker(false);
        }}
      />
      </div>
      </div>
      </SlideDismissContext.Provider>
    </div>
  );
}