import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { createPortal } from "react-dom";
import { useLockPageScroll } from "@/hooks/useLockPageScroll";
import {
  useSlideDismissBack,
  APP_COLUMN_MAX_PX,
  SLIDE_DISMISS_MS,
  SLIDE_DISMISS_EASE,
  chatStackLayerTransforms,
  isDocumentRtl,
} from "@/hooks/useSlideDismissBack";
import { useVisualViewportLayout } from "@/hooks/useVisualViewportLayout";
import { SlideDismissBackButton, SlideDismissShell } from "../SlideDismissShell";
import { QURAN_CHANNEL_ID, isProfileNoteActive, useApp, userById, visibleChatMessages } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ChatDmIntroCard } from "../chat/ChatDmIntroCard";
import { ChatStickerPicker } from "../chat/ChatStickerPicker";
import { ChatCameraComposeModal, ViewOnceMediaOverlay, type CameraComposeDraft } from "../chat/ChatCameraComposeModal";
import { ChatDrawComposeModal } from "../chat/ChatDrawComposeModal";
import { ChatDrawingCanvas } from "../chat/ChatDrawingCanvas";
import { parseDrawingPayload } from "../chat/drawingPayload";
import { ChatInlineMediaLightbox } from "../chat/ChatInlineMediaLightbox";
import { ChatSharedFeedOverlay, type ChatShareFeedItem } from "../chat/ChatSharedFeedOverlay";
import { SharedPostPreview, SharedStoryChatPreview } from "../SharedPostPreview";
import { SharedGroupInvitePreview } from "../chat/SharedGroupInvitePreview";
import { ChatNoteReplyBubble, ChatStoryReplyStack } from "../chat/ChatReplyContext";
import { ChatSwipeMessageRow } from "../chat/ChatSwipeMessageRow";
import { isOwnChatMessage, resolveActiveViewerId } from "@/lib/chatViewer";
import { chatMergeKey, findChatByOpenId, openChatIdFor } from "@/lib/dmChatId";
import { ChatInlineReplyQuote } from "../chat/ChatInlineReplyQuote";
import { ChatComposerReplyBar } from "../chat/ChatComposerReplyBar";
import { GroupDetailsScreen } from "../chat/GroupDetailsScreen";
import { EXTENDED_REACTION_EMOJIS } from "@/lib/reactionEmojiGrid";
import { isStickerImageContent, isStickerVideoContent } from "@/lib/stickerUtils";
import { renderMentionHashtagNodes } from "@/lib/renderMentionHashtagText";
import { Mic, Image as ImageIcon, Sticker, Phone, Video, MicOff, MonitorUp, X, Plus, ArrowRight, Settings as SettingsIcon, Check, Camera, Search, Square, Megaphone, Users, LogOut, AtSign, MoreVertical, ChevronLeft, Reply, Forward, Copy, Trash2, Flag, MoreHorizontal, ChevronRight, Pin, Play, Pause, Star, Bell, BellOff, Mail, Send, PenLine, SquarePen } from "lucide-react";
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
/** 0…1 — تقدّم فتح المحادثة (قائمة تزيح لليمين + الخيط من اليسار) */
export const CHAT_STACK_PROGRESS_VAR = "--retweet-chat-stack-progress";
const CHAT_STACK_OPEN_FRACTION = 0.34;

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

/** فقاعة نصية في الشات؛ رسائلي: زجاج شفاف بنفس منطق رسالة الفويس (بدون أزرق) */
function chatBubbleFilledClass(mine: boolean, isQuran: boolean): string {
  const base = "inline-block w-max max-w-full rounded-2xl px-3 py-2 text-sm align-top ";
  if (isQuran) {
    return (
      base +
      (mine
        ? "bg-emerald-950/88 text-emerald-50 shadow-sm ring-1 ring-emerald-800/35"
        : "bg-zinc-800 text-zinc-100 shadow-sm ring-1 ring-zinc-600/40")
    );
  }
  if (mine) {
    return (
      base +
      "border-0 shadow-none ring-0 outline-none backdrop-blur-xl backdrop-saturate-150 " +
      "bg-black/[0.052] text-zinc-900 dark:bg-white/[0.065] dark:text-zinc-50"
    );
  }
  return base + "bg-zinc-100 text-zinc-900 shadow-sm ring-1 ring-black/[0.07] dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/12";
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
  if (last.type === "drawing") return last.viewOnce ? "رسم (مرة واحدة)" : "رسم";
  if (last.type === "video") return last.viewOnce ? "فيديو (مرة واحدة)" : "فيديو";
  if (last.type === "voice") return "رسالة صوتية";
  if (last.type === "shared_post") return "منشور";
  if (last.type === "shared_story") return "ستوري";
  return `[${last.type}]`;
}

/** نفس معاينة الرسالة المختصرة داخل ChatRoom (مثبتات، رد، حافظة، نسخ…) */
function chatReplyPreview(m: Message): string {
  if (m.type === "text") return truncateText(m.content, 100);
  if (m.type === "sticker") return (isStickerImageContent(m.content) || isStickerVideoContent(m.content)) ? "[ملصق]" : truncateText(m.content, 40);
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
  if (m.type === "text") return truncateText(m.content, 220);
  if (m.type === "sticker") return truncateText(m.content, 48);
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
  if (m.type === "text")
    return (
      <span className="block max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-start [overflow-wrap:anywhere] [word-break:break-word]">
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
  if (m.type === "voice") {
    if (m.content.startsWith("data:") || isRenderableMediaUrl(m.content)) {
      return (
        <InlineVoicePlayer
          src={m.content.startsWith("data:") ? m.content : resolveMediaUrl(m.content)}
          durationSec={m.durationSec}
          isQuran={isQuran}
          mine={bubbleMine}
        />
      );
    }
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-xl">🎙️</span>
        <span className="break-all text-xs opacity-80">{m.content}</span>
      </span>
    );
  }
  if (m.type === "sticker" && isStickerImageContent(m.content)) {
    return (
      <img
        src={m.content}
        alt=""
        className={CHAT_STICKER_MEDIA_CLASS}
        loading="lazy"
        decoding="async"
      />
    );
  }
  if (m.type === "sticker" && isStickerVideoContent(m.content)) {
    return (
      <video
        src={m.content}
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
        {m.content}
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
    const p = parseDrawingPayload(m.content);
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
          src={m.content}
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
          src={m.content}
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
/** نسبة من عرض عمود التطبيق تكفي لفتح المحادثة عند رفع الإصبع (كان ~97% من العرض الكامل) */
const PEEK_OPEN_CHAT_FRACTION = 0.5;
/** أقل من هذا + إيماءة قصيرة نفتح التقاط الكاميرا */
const PEEK_CAMERA_TAP_FRACTION = 0.2;

/** سحب من جهة أيقونة الكاميرا نحو عرض المحادثة (معاينة مثل السناب) */
function ChatListRowWithPeek({
  chat: c,
  me,
  onOpenChat,
  onStackDrag,
  onStackDragEnd,
}: {
  chat: Chat;
  me: { id: string };
  onOpenChat: (id: string) => void;
  onStackDrag?: (chatId: string, px: number) => void;
  onStackDragEnd?: (chatId: string, px: number) => void;
}) {
  const { state, openOrCreateChat, sendMessage, toggleChatListPin, toggleChatMute, deleteChat, isGuest, joinChannel } = useApp();
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
  const rowOpenDownRef = useRef<{ x0: number; y0: number; pointerId: number } | null>(null);
  const rowOpenArmedRef = useRef(false);

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
    if (prev <= 0 && peekPx > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [peekPx]);

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
          queueMicrotask(() => {
            onOpenChat(openChatIdFor(c, me.id));
          });
        } else if (cap > 0 && px < cap * PEEK_CAMERA_TAP_FRACTION && down && Date.now() - down.downAt < 520) {
          cameraInputRef.current?.click();
        }
        return;
      }
      if (!down) return;
      const duration = Date.now() - down.downAt;
      const distSq = (e.clientX - down.x0) ** 2 + (e.clientY - down.y0) ** 2;
      if (duration < CAMERA_TAP_MAX_DURATION_MS && distSq < 200) {
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
    const rtl = typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
    return rtl ? e.clientX - down.x0 : down.x0 - e.clientX;
  };

  const onRowOpenPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || c.isGroup || c.isChannel) return;
    rowOpenDownRef.current = { x0: e.clientX, y0: e.clientY, pointerId: e.pointerId };
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
    const pull = rowOpenPullPx(e);
    const dx = e.clientX - down.x0;
    const dy = e.clientY - down.y0;
    if (!rowOpenArmedRef.current) {
      if (pull < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && dy * dy > 64) {
        rowOpenDownRef.current = null;
        return;
      }
      rowOpenArmedRef.current = true;
    }
    const cap = capWidth();
    const px = Math.max(0, Math.min(cap, pull));
    onStackDrag?.(openChatIdFor(c, me.id), px);
  };

  const onRowOpenPointerEnd = (e: React.PointerEvent) => {
    const down = rowOpenDownRef.current;
    rowOpenDownRef.current = null;
    const armed = rowOpenArmedRef.current;
    rowOpenArmedRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!armed || !down) return;
    const cap = capWidth();
    const pull = rowOpenPullPx(e);
    const px = Math.max(0, Math.min(cap, pull));
    onStackDragEnd?.(openChatIdFor(c, me.id), px);
  };

  const onCameraPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const down = cameraDownRef.current;
    if (!down) return;
    const rtl = typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
    /** سحب لفتح المعاينة: ثابت من أول إحداثية x للضغط على الكاميرا */
    const openPull = rtl ? e.clientX - down.x0 : down.x0 - e.clientX;

    if (!cameraPeekArmedRef.current) {
      if (openPull >= CAMERA_EARLY_PULL_PX) {
        clearCameraLongPress();
        cameraPeekArmedRef.current = true;
        const cap = capWidth();
        const v = Math.max(0, Math.min(cap, openPull));
        peekRef.current = v;
        setPeekPx(v);
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

                  {(c.pinnedMessageIds || []).some(mid => c.messages.some(x => x.id === mid)) && (
                    <div
                      className={
                        "no-scrollbar flex shrink-0 flex-nowrap gap-2 overflow-x-scroll overflow-y-hidden overscroll-x-none border-b px-2 py-1.5 touch-pan-x snap-x snap-mandatory " +
                        (isQuranPeek ? "border-zinc-700 bg-zinc-900/95" : "border-border bg-muted/45")
                      }
                    >
                      {(c.pinnedMessageIds || [])
                        .filter(mid => c.messages.some(x => x.id === mid))
                        .map(mid => {
                          const pm = c.messages.find(x => x.id === mid)!;
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
                      "chat-scroll-pane relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-none " +
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
                        "flex w-full flex-col gap-2 px-3 pt-3 pb-28 " +
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
                      const bareSticker = m.type === "sticker" && (isStickerImageContent(m.content) || isStickerVideoContent(m.content));
                      const bareImage = m.type === "image" && m.content.startsWith("data:") && !m.viewOnce;
                      const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(m.content) && !m.viewOnce;
                      const bareVideo = m.type === "video" && !m.viewOnce;
                      const bareVoiceBubble = m.type === "voice";
                      const bareViewOnceMedia =
                        ((m.type === "image" || m.type === "video") && !!m.viewOnce && m.content.startsWith("data:")) ||
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
                          : chatBubbleFilledClass(mine, isQuranPeek);
                      return (
                        <ChatSwipeMessageRow
                          key={m.id}
                          message={m}
                          mine={mine}
                          isQuran={isQuranPeek}
                          avatarName={!mine ? sender?.username || "?" : undefined}
                          avatarSrc={!mine ? sender?.avatar : undefined}
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
                    <div className="px-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-1" dir="ltr">
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

      <div className="relative overflow-visible border-b border-zinc-100 dark:border-zinc-800">
        <div className="relative z-20 flex items-center gap-3 bg-white dark:bg-background px-4 py-3 active:bg-zinc-50">
          <div
            className="flex min-w-0 flex-1 items-center gap-3 touch-manipulation"
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
                onOpenChat(openChatIdFor(c, me.id));
              }}
            >
              <RSocialAvatar name={displayName} src={avatarSrc} size={52} />
              {hasUnread && <span className="absolute -top-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 ring-2 ring-background" aria-hidden />}
            </div>
            <button
              type="button"
              onClick={() => {
                if (skipAvatarClickRef.current) return;
                onOpenChat(openChatIdFor(c, me.id));
              }}
              className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-3 pe-3 text-start outline-none touch-manipulation"
              style={{ touchAction: "pan-y" }}
              onPointerDown={onRowOpenPointerDown}
              onPointerMove={onRowOpenPointerMove}
              onPointerUp={onRowOpenPointerEnd}
              onPointerCancel={onRowOpenPointerEnd}
            >
              <div className="font-semibold text-sm flex min-w-0 items-center gap-1">
                {c.isChannel && <Megaphone size={12} className="shrink-0" aria-hidden />}
                <span className="min-w-0 truncate">
                  {c.isGroup || c.isChannel ? c.name || "Group" : displayNameFromUsername(other?.username || displayName)}
                </span>
                {isListPinned && (
                  <span className="inline-flex shrink-0" title={t("pinnedBar")}>
                    <Pin size={12} className="fill-amber-400/35 text-amber-600 dark:text-amber-400" aria-hidden />
                  </span>
                )}
              </div>
              <div className={"text-sm truncate " + (hasUnread ? "text-zinc-700 font-medium" : "text-zinc-500")}>
                {last ? lastMessagePreview(last) : "No messages yet"}
              </div>
            </button>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 ps-1">
            {last && <span className="text-xs text-zinc-400 tabular-nums">{formatChatListTime(last.createdAt)}</span>}
            {hasUnread && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold text-white" style={{ backgroundColor: RS_BADGE }}>1</span>
            )}
          </div>
          <button
            type="button"
            ref={cameraBtnRef}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            aria-label="التقاط صورة: اضغط سريعاً. أو اسحب من الكاميرا نحو الشاشة / اضغط مطوّلاً ثم اسحب لمعاينة المحادثة"
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
              onOpenChat(openChatIdFor(c, me.id));
            } else if (otherId) {
              const ch = openOrCreateChat(otherId);
              if (!ch) {
                if (isGuest) notifyGuestActionBlocked();
                else window.alert("تعذّر فتح المحادثة.");
                setCameraDraft(null);
                return;
              }
              sendMessage(ch.id, payload);
              onOpenChat(openChatIdFor(ch, me.id));
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
  /** إخفاء الشريط السفلي (قائمة إنشاء مجموعة/قناة، إلخ) */
  onHideBottomNav?: (hidden: boolean) => void;
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
  onActiveChatChange,
  resumeThreadToProfileUserId,
  onExitThreadToProfile,
}: Props) {
  const { state, currentUser, accountSessionKey, openOrCreateChat, setNote, sendMessage, isGuest, replyToProfileNoteAsDm } = useApp();
  const [profileNoteReply, setProfileNoteReply] = useState<{ userId: string; note: string } | null>(null);
  const [profileNoteReplyDraft, setProfileNoteReplyDraft] = useState("");
  const t = useT();
  const me = currentUser!;
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [showCreate, setShowCreate] = useState<null | "menu" | "group" | "channel">(null);
  const [showCall, setShowCall] = useState<string | null>(null);
  const [callVideo, setCallVideo] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallRing | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [stackDrag, setStackDrag] = useState<{ chatId: string; px: number } | null>(null);
  const [stackProgress, setStackProgress] = useState(1);
  const [stackSpring, setStackSpring] = useState(false);
  const stackCapRef = useRef(
    typeof window !== "undefined" ? Math.min(window.innerWidth, APP_COLUMN_MAX_PX) : APP_COLUMN_MAX_PX,
  );
  const stackProgressRef = useRef(0);
  const stackOpenDragRef = useRef(false);
  const [stackClosingId, setStackClosingId] = useState<string | null>(null);

  const syncStackProgress = useCallback((p: number) => {
    const clamped = Math.max(0, Math.min(1, p));
    stackProgressRef.current = clamped;
    setStackProgress(clamped);
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(CHAT_STACK_PROGRESS_VAR, String(clamped));
    }
  }, []);

  const syncStackProgressFromRoom = useCallback(
    (p: number) => {
      if (stackOpenDragRef.current) return;
      syncStackProgress(p);
    },
    [syncStackProgress],
  );

  const [search, setSearch] = useState("");
  const [noteInput, setNoteInput] = useState(me.note || "");
  const [editingNote, setEditingNote] = useState(false);
  const [showGames, setShowGames] = useState(false);
  const [gameType, setGameType] = useState<"billiards" | "football">("billiards");
  useEffect(() => {
    if (!initialChatId) return;
    const found = findChatByOpenId(state.chats, initialChatId, me.id);
    setOpenChat(found ? openChatIdFor(found, me.id) : initialChatId);
    onConsumedInitialChat?.();
  }, [initialChatId, onConsumedInitialChat, state.chats, me.id]);

  /** بعد دمج DM قديم: openChat يبقى id عشوائي — نحدّثه لـ dm:… */
  useEffect(() => {
    if (!openChat) return;
    const found = findChatByOpenId(state.chats, openChat, me.id);
    if (!found) return;
    const canonical = openChatIdFor(found, me.id);
    if (canonical !== openChat) setOpenChat(canonical);
  }, [state.chats, openChat, me.id]);

  const prevAccountIdRef = useRef(me.id);
  /** عند تبديل الحساب: إغلاق الغرفة ومسح حالة المكدس (لا يُنفَّذ عند أول mount) */
  useEffect(() => {
    if (prevAccountIdRef.current === me.id) return;
    prevAccountIdRef.current = me.id;
    setOpenChat(null);
    setStackDrag(null);
    setStackClosingId(null);
    setStackSpring(false);
    setShowCall(null);
    setIncomingCall(null);
    setShowGroupSettings(false);
    syncStackProgress(0);
    onActiveChatChange?.(null);
  }, [me.id, syncStackProgress, onActiveChatChange]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (id) {
        const found = findChatByOpenId(state.chats, id, me.id);
        setOpenChat(found ? openChatIdFor(found, me.id) : id);
      }
    };
    window.addEventListener("retweet-open-chat", onOpen);
    return () => window.removeEventListener("retweet-open-chat", onOpen);
  }, [state.chats, me.id]);

  useEffect(() => {
    onThreadOpen?.(!!openChat || !!stackDrag || !!stackClosingId);
    onHideBottomNav?.(!!openChat || !!stackDrag || !!stackClosingId || showCreate != null);
  }, [openChat, stackDrag, stackClosingId, showCreate, onThreadOpen, onHideBottomNav]);

  const onStackDrag = useCallback(
    (chatId: string, px: number) => {
      stackOpenDragRef.current = true;
      setStackClosingId(null);
      setStackSpring(false);
      setStackDrag({ chatId, px });
      const cap = stackCapRef.current;
      syncStackProgress(cap > 0 ? px / cap : 0);
    },
    [syncStackProgress],
  );

  const onStackDragEnd = useCallback(
    (chatId: string, px: number) => {
      stackOpenDragRef.current = false;
      const cap = stackCapRef.current;
      if (cap > 0 && px >= cap * CHAT_STACK_OPEN_FRACTION) {
        syncStackProgress(1);
        setStackDrag(null);
        setStackClosingId(null);
        setStackSpring(false);
        const found = findChatByOpenId(state.chats, chatId, me.id);
        setOpenChat(found ? openChatIdFor(found, me.id) : chatId);
        return;
      }
      setStackClosingId(chatId);
      setStackDrag(null);
      setStackSpring(true);
      syncStackProgress(0);
      window.setTimeout(() => {
        setStackClosingId(null);
        setStackSpring(false);
      }, SLIDE_DISMISS_MS);
    },
    [syncStackProgress, state.chats, me.id],
  );

  useLayoutEffect(() => {
    if (!openChat) {
      if (!stackDrag) {
        syncStackProgress(0);
        if (typeof document !== "undefined") {
          document.documentElement.style.removeProperty(CHAT_STACK_PROGRESS_VAR);
        }
      }
      return;
    }
    if (stackClosingId) return;
    setStackDrag(null);
    if (stackProgressRef.current >= 0.98) {
      setStackSpring(false);
      return;
    }
    setStackSpring(true);
    syncStackProgress(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncStackProgress(1);
        window.setTimeout(() => setStackSpring(false), 340);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [openChat, stackClosingId, syncStackProgress]);
  useEffect(() => {
    onActiveChatChange?.(openChat);
  }, [openChat, onActiveChatChange]);

  useLockPageScroll(!!openChat || !!stackDrag);

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
        isProfileNoteActive(u) &&
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

  const chatInbox = (
    <div className="chat-inbox-pane flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none bg-white pb-4 dark:bg-background">
      {isGuest && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-950 dark:text-amber-100">
          وضع الزائر: يمكنك تصفّح القوائم فقط. سجّل الدخول من تبويب «أنا» لإرسال رسائل أو فتح محادثات.
        </div>
      )}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowRequests(true)}
          className="relative mt-1 p-1 rounded-lg hover:bg-zinc-100 touch-manipulation"
          aria-label={t("requests")}
        >
          <Mail size={26} strokeWidth={1.75} className="text-zinc-900" />
          {messageRequests.length > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {messageRequests.length > 9 ? "9+" : messageRequests.length}
            </span>
          )}
        </button>
        <button
          type="button"
          disabled={isGuest}
          onClick={() => !isGuest && setShowCreate("menu")}
          className="mt-1 p-1 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 touch-manipulation"
          aria-label="Compose"
        >
          <SquarePen size={22} strokeWidth={1.75} className="text-zinc-900" />
        </button>
      </div>
      <h1 className="px-4 text-[2rem] font-bold leading-tight text-zinc-900 dark:text-zinc-50 tracking-tight">{t("chat")}</h1>

      <div className="px-4 mt-1 flex w-full flex-col gap-2">
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
                      onClick={() => {
                        if (isGuest) {
                          notifyGuestActionBlocked();
                          return;
                        }
                        setProfileNoteReply({ userId: u.id, note: u.note });
                      }}
                      className={
                        "min-h-[44px] max-w-[8.5rem] rounded-2xl border border-transparent bg-secondary px-2.5 py-2 text-start text-[11px] font-ios-emoji leading-snug transition hover:bg-secondary/85 active:scale-[0.98] " +
                        (profileNoteReply?.userId === u.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "")
                      }
                      title="اضغط للرد على النوت في الخاص"
                      aria-label={`رد على نوت ${u.username}`}
                    >
                      <span className="line-clamp-3 [overflow-wrap:anywhere]">{u.note}</span>
                    </button>
                  )
                ) : (
                  isMine && (
                    <button onClick={() => setEditingNote(true)} className="text-[10px] bg-primary/20 text-primary rounded-2xl px-2 py-1">
                      {t("addNote")}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isMine) setEditingNote(true);
                    else if (u.note) {
                      if (isGuest) {
                        notifyGuestActionBlocked();
                        return;
                      }
                      setProfileNoteReply({ userId: u.id, note: u.note });
                    } else startTransition(() => onOpenProfile(u.id));
                  }}
                >
                  <Avatar name={u.username} src={u.avatar} size={56} />
                </button>
                <span className="text-xs">{isMine ? "أنت" : u.username}</span>
              </div>
            );
          })}
        </div>

        {profileNoteReply && (
          <div
            className="w-full rounded-2xl border border-border bg-card p-3 shadow-sm"
            dir="rtl"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  ردّ على نوت{" "}
                  <span className="font-semibold text-foreground">
                    @{userById(state, profileNoteReply.userId)?.username ?? "…"}
                  </span>
                  <span className="text-muted-foreground"> — يُرسل في الخاص</span>
                </p>
                <p className="mt-2 max-h-20 overflow-y-auto rounded-xl bg-secondary/70 px-3 py-2 text-sm font-ios-emoji leading-snug text-foreground/90 [overflow-wrap:anywhere]">
                  {profileNoteReply.note}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="إغلاق"
                onClick={() => setProfileNoteReply(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="profile-note-reply-input">
              ردك
            </label>
            <textarea
              id="profile-note-reply-input"
              value={profileNoteReplyDraft}
              onChange={e => setProfileNoteReplyDraft(e.target.value)}
              placeholder="اكتب ردك… سيصله في المحادثة الخاصة معك"
              rows={3}
              disabled={isGuest}
              className="mt-1 w-full resize-none rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 font-ios-emoji"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isGuest || !profileNoteReplyDraft.trim()}
                onClick={() => {
                  if (isGuest) {
                    notifyGuestActionBlocked();
                    return;
                  }
                  const res = replyToProfileNoteAsDm({
                    friendId: profileNoteReply.userId,
                    noteText: profileNoteReply.note,
                    replyText: profileNoteReplyDraft.trim(),
                  });
                  if (res) {
                    setProfileNoteReply(null);
                    setOpenChat(res.chatId);
                  }
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
              >
                <Send size={16} className="shrink-0" strokeWidth={2.25} />
                إرسال في الخاص
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-secondary"
                onClick={() => {
                  const id = profileNoteReply.userId;
                  setProfileNoteReply(null);
                  startTransition(() => onOpenProfile(id));
                }}
              >
                الملف الشخصي
              </button>
            </div>
          </div>
        )}

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

      <div className="mt-2 border-t border-zinc-100 dark:border-zinc-800">
        {sortedFilteredChats.map(c => (
          <ChatListRowWithPeek
            key={c.id}
            chat={c}
            me={me}
            onOpenChat={id => {
              setStackSpring(true);
              setOpenChat(id);
            }}
            onStackDrag={onStackDrag}
            onStackDragEnd={onStackDragEnd}
          />
        ))}
        {sortedFilteredChats.length === 0 && <p className="text-center text-zinc-500 py-10 text-sm">{t("noChats")}</p>}
      </div>

      {showCreate === "menu" && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50" role="presentation" onClick={() => setShowCreate(null)}>
          <div className="bg-background w-full rounded-t-3xl p-4 max-w-md mx-auto" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate("group")} className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl"><Users /> {t("newGroup")}</button>
            <button onClick={() => setShowCreate("channel")} className="w-full flex items-center gap-3 p-3 hover:bg-secondary rounded-2xl"><Megaphone /> {t("newChannel")}</button>
          </div>
        </div>
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
                    setOpenChat(openChatIdFor(ch, me.id));
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
  const activeStackChatId = openChat ?? stackDrag?.chatId ?? stackClosingId ?? null;

  if (activeStackChatId) {
    const chat = findChatByOpenId(state.chats, activeStackChatId, me.id);
    if (!chat) {
      setOpenChat(null);
      setStackDrag(null);
      setStackClosingId(null);
      return null;
    }
    if (showGroupSettings && openChat && (chat.isGroup || chat.isChannel))
      return (
        <GroupDetailsScreen
          chat={chat}
          messages={chat.messages}
          onBack={() => setShowGroupSettings(false)}
          onOpenProfile={onOpenProfile}
          onCreateNewGroup={() => {
            setShowGroupSettings(false);
            setOpenChat(null);
            setShowCreate("group");
          }}
        />
      );
    const showInboxStack = !chat.isGroup && !chat.isChannel;
    const cap = stackCapRef.current;
    const chatOpenKey = openChatIdFor(chat, me.id);
    const dragProgress =
      stackDrag && stackDrag.chatId === chatOpenKey && cap > 0
        ? Math.min(1, stackDrag.px / cap)
        : openChat === chatOpenKey || stackClosingId === chatOpenKey
          ? stackProgress
          : 0;
    const stackTransition = stackSpring ? `transform ${SLIDE_DISMISS_MS}ms ${SLIDE_DISMISS_EASE}` : "none";
    const { inbox: inboxTransform, room: roomTransform } = chatStackLayerTransforms(
      dragProgress,
      cap,
      isDocumentRtl(),
    );
    const isInteractiveDrag = !!(stackDrag && stackDrag.chatId === chat.id);

    const chatStackOverlay = (
      <div className="fixed inset-0 z-[220] isolate overflow-hidden overscroll-none bg-black">
        {showInboxStack && (
          <div
            className="absolute inset-0 z-[1] overflow-hidden bg-background pb-[env(safe-area-inset-bottom,0px)] [transform:translateZ(0)]"
            style={{
              transform: inboxTransform,
              transition: stackTransition,
              pointerEvents: isInteractiveDrag || dragProgress < 0.98 ? "auto" : "none",
            }}
          >
            <div className="h-full w-full overflow-hidden overscroll-none pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]">
              {chatInbox}
            </div>
          </div>
        )}
        <div
          className="absolute inset-0 z-[2] flex w-full flex-col overflow-hidden bg-black [transform:translateZ(0)]"
          style={{
            transform: roomTransform,
            transition: stackTransition,
            pointerEvents: "auto",
          }}
        >
          <ChatRoom
            key={`${accountSessionKey}-${chat.id}`}
            chat={chat}
            embedInStack
            onStackProgress={syncStackProgressFromRoom}
            onBack={() => {
              if (resumeThreadToProfileUserId && onExitThreadToProfile) {
                onExitThreadToProfile(resumeThreadToProfileUserId);
              }
              stackOpenDragRef.current = false;
              if (!openChat) return;
              setStackClosingId(chatOpenKey);
              setStackDrag(null);
              setStackSpring(true);
              syncStackProgress(0);
              window.setTimeout(() => {
                setOpenChat(null);
                setStackClosingId(null);
                setStackSpring(false);
              }, SLIDE_DISMISS_MS);
            }}
            onCall={(video) => {
              setCallVideo(video);
              setShowCall(chat.id);
            }}
            onOpenSettings={() => setShowGroupSettings(true)}
            onOpenProfile={onOpenProfile}
          />
        </div>
      </div>
    );

    return typeof document !== "undefined" ? createPortal(chatStackOverlay, document.body) : chatStackOverlay;
  }
    if (showRequests) return <RequestsList chats={messageRequests} onBack={() => setShowRequests(false)} onOpen={(id) => { setShowRequests(false); setOpenChat(id); }} onOpenProfile={onOpenProfile} />;
  if (showCreate === "group" || showCreate === "channel") return <CreateGroup mode={showCreate} onBack={() => setShowCreate(null)} onCreated={(id) => { setShowCreate(null); setOpenChat(id); }} />;

  const caller = incomingCall ? userById(state, incomingCall.fromUserId) : null;

  return (
    <>
      {incomingCall && !showCall && (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[250] mx-auto max-w-md px-3">
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
      {chatInbox}
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
  const others = state.users.filter(u => u.id !== me.id && !me.blocked.includes(u.id));

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    void (async () => {
      const token = getApiToken();
      if (apiBackendEnabled() && token) {
        setAvatarBusy(true);
        const up = await apiUploadMedia(token, f);
        setAvatarBusy(false);
        e.target.value = "";
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
    })();
  };

  const create = () => {
    if (mode === "group" && selected.length < 2) { alert("اختر شخصين على الأقل"); return; }
    const c = mode === "group" ? createGroup(name || "مجموعة", avatar, selected) : createChannel(name || "قناة", avatar, selected);
    if (c) onCreated(c.id);
  };

  return (
    <SlideDismissShell onDismiss={onBack} variant="inline" className="flex-1 bg-background">
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4"><SlideDismissBackButton onDismiss={onBack}><ArrowRight /></SlideDismissBackButton><h2 className="font-bold">{mode === "group" ? t("newGroup") : t("newChannel")}</h2></div>
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
            <select value={avatar} onChange={e => setAvatar(e.target.value)} className="text-sm bg-secondary rounded-xl px-3 py-1.5">
              {(mode === "channel" ? ["📢","📰","📚","🕌","⭐","🎙️"] : ["👥","🎉","🚀","💬","🌟","❤️","🔥","🎨"]).map(e => <option key={e} value={e}>{e} أيقونة</option>)}
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
    </SlideDismissShell>
  );
}

function ChatRoom({
  chat,
  onBack,
  onCall,
  onOpenSettings,
  onOpenProfile,
  embedInStack = false,
  onStackProgress,
}: {
  chat: Chat;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onOpenSettings: () => void;
  onOpenProfile: (id: string) => void;
  embedInStack?: boolean;
  onStackProgress?: (progress: number) => void;
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
  const t = useT();
  const viewerId = resolveActiveViewerId(state) ?? currentUser?.id ?? "";
  const me = currentUser!;
  const [text, setText] = useState("");
  const [mentionPick, setMentionPick] = useState<{ query: string; start: number } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [plusAttachOpen, setPlusAttachOpen] = useState(false);
  const [theme, setTheme] = useState<"default" | "blue" | "pink">("default");
  const [recording, setRecording] = useState(false);
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [hideReadStatus, setHideReadStatus] = useState(false);
  const [hideTypingStatus, setHideTypingStatus] = useState(false);
  const [isTyping] = useState(false);
  const [vanishMode, setVanishMode] = useState(false);
  const [vanishMessages, setVanishMessages] = useState<Message[]>([]);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const sendChatId = useMemo(() => chatMergeKey(chat, me.id), [chat, me.id]);
  const chatIdRef = useRef(sendChatId);
  chatIdRef.current = sendChatId;
  const dispatchSendRef = useRef<(msg: Omit<Message, "id" | "senderId" | "createdAt">) => boolean>(
    () => false,
  );
  const composerInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
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
  const isMember = chat.members.includes(me.id);
  const canPost = !chat.isChannel || (chat.hosts || []).includes(me.id);
  const isGroupChat = chat.isGroup && !chat.isChannel;
  const isDmRoom = !chat.isGroup && !chat.isChannel;
  const groupMentionOptions = useMemo(() => {
    if (!isGroupChat || !mentionPick) return [];
    const q = mentionPick.query;
    const members = chat.members
      .map(id => userById(state, id))
      .filter((u): u is User => !!u && u.id !== me.id);
    const filtered = q ? members.filter(u => u.username.toLowerCase().includes(q)) : members;
    return filtered.slice(0, 10);
  }, [isGroupChat, mentionPick, chat.members, state.users, me.id]);
  const onComposerChange = (v: string) => {
    setText(v);
    if (!isGroupChat) {
      setMentionPick(null);
      return;
    }
    const m = v.match(/@([a-z0-9_]*)$/i);
    if (m && m.index != null) {
      setMentionPick({ query: (m[1] || "").toLowerCase(), start: m.index });
    } else {
      setMentionPick(null);
    }
  };
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
  const noMessagesYet = displayMessages.length === 0;
  const showDmIntro = isDmRoom && !!other && !!otherId && !vanishMode && noMessagesYet;
  const [messageContext, setMessageContext] = useState<Message | null>(null);
  const [moreReactionEmoji, setMoreReactionEmoji] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [cameraCompose, setCameraCompose] = useState<CameraComposeDraft | null>(null);
  const [drawComposeOpen, setDrawComposeOpen] = useState(false);
  const [viewOnceOverlay, setViewOnceOverlay] = useState<Message | null>(null);
  const [inlineMediaViewer, setInlineMediaViewer] = useState<Message | null>(null);
  const [shareFeedOpen, setShareFeedOpen] = useState<null | { items: ChatShareFeedItem[]; initialIndex: number }>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const vv = useVisualViewportLayout();
  const keyboardOpen = vv.keyboardInset > 8;
  const scrollMessagesToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);
  /** false عندما يمرّر المستخدم لأعلى لقراءة قديم — لا نعيده للأسفل تلقائياً عند وصول رسالة جديدة */
  const stickToBottomRef = useRef(true);
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
        setVanishMessages(v => [...v, { ...msg, id, senderId: me.id, createdAt: Date.now() }]);
        return true;
      }
      return sendMessage(sendChatId, msg);
    },
    [isDmRoom, vanishMode, sendChatId, me.id, sendMessage],
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
    void loadChatMessages(sendChatId);
  }, [sendChatId, loadChatMessages]);

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

  const onMsgPointerUp = useCallback(
    (e: React.PointerEvent, m: Message) => {
      clearLongPress();
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
    [clearLongPress, me.id, chat.id, addMessageReaction, isGuest],
  );

  useEffect(() => {
    if (chat.isGroup || chat.isChannel) return;
    markChatOpened(chat.id);
  }, [chat.id, chat.isGroup, chat.isChannel, markChatOpened]);

  const lastMessageId = chat.messages[chat.messages.length - 1]?.id;
  useEffect(() => {
    markChatRead(chat.id);
  }, [chat.id, lastMessageId, markChatRead]);

  useEffect(() => {
    setMoreReactionEmoji(false);
  }, [messageContext?.id]);

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
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

  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < 72;
  }, []);

  useLayoutEffect(() => {
    if (messageContext) return;
    if (!stickToBottomRef.current) return;
    scrollMessagesToBottom();
  }, [chat.messages.length, vanishMessages.length, messageContext, scrollMessagesToBottom]);

  useLayoutEffect(() => {
    if (!keyboardOpen) return;
    stickToBottomRef.current = true;
    scrollMessagesToBottom();
    const t = window.setTimeout(scrollMessagesToBottom, 120);
    return () => window.clearTimeout(t);
  }, [keyboardOpen, vv.keyboardInset, scrollMessagesToBottom]);

  const VANISH_PULL_NEED = 120;
  /** ارتفاع النطاق من أسفل منطقة التمرير لبدء سحب الوضع المخفي */
  const VANISH_PULL_HIT_PX = 140;

  const isQuranChannel = chat.id === QURAN_CHANNEL_ID;
  const themeBg = isQuranChannel
    ? "bg-black text-white"
    : theme === "blue" ? "bg-blue-50 dark:bg-blue-950" : theme === "pink" ? "bg-pink-50 dark:bg-pink-950" : "bg-background";

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
        const reader = new FileReader();
        reader.onload = () =>
          dispatchSend({
            type: "voice",
            content: String(reader.result),
            durationSec,
          });
        reader.readAsDataURL(file);
      })();
    },
    [dispatchSend],
  );

  const onGalleryMediaPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const msgType = f.type.startsWith("video/") ? "video" : "image";
      const reader = new FileReader();
      reader.onload = () => dispatchSend({ type: msgType, content: String(reader.result) });
      reader.readAsDataURL(f);
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
      renderMention: (uname, key) => {
        const u = state.users.find(x => x.username.toLowerCase() === uname.toLowerCase());
        if (u) {
          return (
            <button
              key={key}
              type="button"
              onClick={e => {
                e.stopPropagation();
                openMentionProfile(uname);
              }}
              className={
                glassLinks ? "text-zinc-800 underline underline-offset-2 dark:text-zinc-200" : "text-primary underline"
              }
            >
              <AtSign size={12} className="inline" />
              {uname}
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={e => {
              e.stopPropagation();
              openMentionProfile(uname);
            }}
            className={
              glassLinks
                ? "text-zinc-800 underline underline-offset-2 dark:text-zinc-200"
                : "text-primary underline"
            }
          >
            @{uname}
          </button>
        );
      },
      renderHashtag: (h, key) => (
        <span key={key} className={glassLinks ? "text-zinc-700 dark:text-zinc-300" : "text-primary"}>
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
          <ChatInlineReplyQuote
            replyTo={m.replyTo}
            messages={displayMessages}
            meId={me.id}
            state={state}
            mine={mine}
            isQuran={isQuranChannel}
          />
        )}
        {m.type === "text" &&
          ((m.replyContext?.kind === "note" || /^↩️ رد على نوتك:/.test(m.content)) ? (
            <ChatNoteReplyBubble message={m} mine={mine} />
          ) : (
            <span
              dir="auto"
              className="block max-w-full whitespace-pre-wrap break-words text-start [overflow-wrap:anywhere] [word-break:break-word]"
            >
              {renderText(m.content, mine)}
            </span>
          ))}
        {m.type === "shared_group" && (
          <SharedGroupInvitePreview
            inviteCode={m.content}
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
            {m.shareText && <span className="mb-1 block whitespace-pre-wrap text-xs opacity-90">{m.shareText}</span>}
            <SharedPostPreview postId={m.content} variant="chat" />
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
              <SharedStoryChatPreview storyId={m.content} />
            </button>
          ))}
        {m.type === "voice" &&
          (m.content.startsWith("data:") || isRenderableMediaUrl(m.content) ? (
            <InlineVoicePlayer
              src={m.content.startsWith("data:") ? m.content : resolveMediaUrl(m.content)}
              durationSec={m.durationSec}
              isQuran={isQuranChannel}
              mine={mine}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎙️</span>
              <span className="break-all text-xs opacity-80">{m.content}</span>
            </div>
          ))}
        {m.type === "sticker" && isStickerImageContent(m.content) && (
          <img
            src={m.content}
            alt=""
            className={CHAT_STICKER_MEDIA_CLASS}
            loading="lazy"
            decoding="async"
          />
        )}
        {m.type === "sticker" && isStickerVideoContent(m.content) && (
          <video
            src={m.content}
            className={CHAT_STICKER_MEDIA_CLASS}
            autoPlay
            loop
            muted
            playsInline
            controls={false}
            preload="metadata"
          />
        )}
        {m.type === "sticker" && !isStickerImageContent(m.content) && !isStickerVideoContent(m.content) && (
          <span className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-2 rounded-[22px] bg-secondary/40 text-2xl leading-none select-none" title="ملصق">
            {m.content}
          </span>
        )}
        {m.type === "drawing" && m.viewOnce && (
          viewOnceOpenedForViewer(m, me.id) ? (
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
          const d = parseDrawingPayload(m.content);
          return d ? (
            <div className={CHAT_IMAGE_WRAP + " overflow-hidden"}>
              <ChatDrawingCanvas payload={d} className="w-full" maxHeightPx={280} forChatDisplay />
            </div>
          ) : (
            <span className="text-xs opacity-70">رسم</span>
          );
        })()}
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
                src={m.content}
                alt=""
                draggable={false}
                className={`${CHAT_IMAGE_EL} pointer-events-none align-middle`}
              />
            </div>
          </button>
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
            <video src={m.content} muted playsInline preload="metadata" className={CHAT_VIDEO_EL + " pointer-events-none"} />
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
      const tgt = e.target as HTMLElement | null;
      if (!tgt || !el.contains(tgt)) return;
      if (tgt.closest("button, a, input, textarea, select, canvas")) return;
      /* السماح بالبدء من فقاعات الرسائل في أسفل الشاشة — كان استبعاد .touch-manipulation يعطّل الوضع المخفي عملياً */
      e.stopPropagation();
      handleVanishPullDown(e);
    },
    [drawComposeOpen, isDmRoom, canPost, handleVanishPullDown],
  );

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

  const inlineMediaLightboxUser: User | null =
    inlineMediaViewer &&
    !inlineMediaViewer.viewOnce &&
    (inlineMediaViewer.type === "image" || inlineMediaViewer.type === "video")
      ? (userById(state, inlineMediaViewer.senderId) ?? null)
      : null;
  const inlineMediaLightboxLabel =
    inlineMediaLightboxUser != null
      ? `@${inlineMediaLightboxUser.username}`
      : inlineMediaViewer?.senderId === me.id
        ? `@${me.username}`
        : "?";

  const composerHasText = text.trim().length > 0;

  const readComposerBody = useCallback(() => {
    const raw = composerInputRef.current?.value ?? text;
    return raw.trim();
  }, [text]);

  const submitTextMessage = useCallback(() => {
    const body = readComposerBody();
    if (!body) return;
    const rt = replyingTo
      ? { id: replyingTo.id, content: chatReplyPreview(replyingTo), type: replyingTo.type }
      : undefined;
    const sent = dispatchSend({ type: "text", content: body, replyTo: rt });
    if (!sent) return;
    blockMicUntilRef.current = Date.now() + 520;
    setComposerMicCooldown(true);
    setText("");
    if (composerInputRef.current) composerInputRef.current.value = "";
    setReplyingTo(null);
    setMentionPick(null);
    window.setTimeout(() => setComposerMicCooldown(false), 480);
  }, [readComposerBody, replyingTo, dispatchSend]);

  const edgeSwipeBackBlocked = useMemo(
    () =>
      !!messageContext ||
      !!forwardingMessage ||
      !!cameraCompose ||
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
      drawComposeOpen,
      viewOnceOverlay,
      inlineMediaViewer,
      shareFeedOpen,
      showStickers,
      recording,
      showPrivacyMenu,
    ],
  );

  const { containerRef: chatSwipeColumnRef, panelStyle: chatPanelStyle, requestDismiss: requestChatDismiss, edgeStripProps } =
    useSlideDismissBack({
      onDismiss: onBack,
      blocked: edgeSwipeBackBlocked,
      dismissPullCssVar: CHAT_DISMISS_PULL_CSS_VAR,
      stackProgressCssVar: embedInStack ? CHAT_STACK_PROGRESS_VAR : undefined,
      embedInStack,
      onStackProgress,
      resetKey: chat.id,
      edgeBottomInsetPx: keyboardOpen ? 56 : 80,
    });

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

  return (
    <div
      className={
        (embedInStack
          ? "relative h-full w-full "
          : "fixed inset-x-0 z-[200] box-border flex justify-center ") +
        "overflow-hidden overscroll-none bg-black pointer-events-none"
      }
      style={embedInStack ? undefined : { top: vv.offsetTop, height: vv.height, bottom: "auto" }}
    >
      <div
        ref={chatSwipeColumnRef}
        className={
          embedInStack
            ? "relative h-full w-full min-w-0 overflow-hidden overscroll-none"
            : "relative mx-auto h-full w-full min-w-0 max-w-md overflow-hidden overscroll-none"
        }
      >
      <div
        className={
          "pointer-events-auto relative flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden " +
          (embedInStack ? "" : "will-change-transform ") +
          themeBg
        }
        style={roomEnterStyle}
      >
      <div {...edgeStripProps} />
      <div
        dir="rtl"
        className={
          "relative z-40 flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] " +
          (isQuranChannel ? "bg-zinc-900 text-zinc-100 border-zinc-700" : "bg-background")
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
        {/* Back + profile (يمين في RTL) */}
        <button
          type="button"
          onClick={() => {
            if (embedInStack) {
              onBack();
              return;
            }
            if (!requestChatDismiss()) onBack();
          }}
          className="touch-manipulation rounded-full p-2 transition-transform duration-150 ease-out hover:bg-secondary active:scale-[0.88]"
          aria-label="رجوع"
        >
          <ChevronRight size={22} />
        </button>
        
        {/* Center - User info */}
        <button type="button" onClick={() => (chat.isGroup || chat.isChannel) ? onOpenSettings() : (otherId && startTransition(() => onOpenProfile(otherId)))} className="flex items-center gap-2 flex-1 min-w-0 text-start justify-start">
          <Avatar name={chat.isGroup ? chat.name! : other?.username || "?"} src={chat.isGroup ? chat.avatar : other?.avatar} size={36} />
          <div className="min-w-0">
            <div className="font-semibold text-sm flex items-center gap-1 truncate">{chat.isChannel && <Megaphone size={14} />}{title}</div>
            {isTyping && !hideTypingStatus && !chat.isGroup && !chat.isChannel && (
              <div className="text-xs text-blue-500 font-medium">يكتب...</div>
            )}
            {(chat.isGroup || chat.isChannel) && <div className={"text-xs " + (isQuranChannel ? "text-zinc-400" : "text-muted-foreground")}>{chat.members.length} {t("members")}</div>}
          </div>
        </button>
        </div>
        
        {/* Actions (يسار في RTL) */}
        <div className="flex shrink-0 items-center gap-2">
          {!isQuranChannel && !chat.isChannel && (
            <>
              <button type="button" onClick={() => onCall(false)} aria-label="مكالمة صوتية"><Phone size={20} /></button>
              <button type="button" onClick={() => onCall(true)} aria-label="مكالمة فيديو"><Video size={20} /></button>
            </>
          )}
          {!chat.isGroup && !chat.isChannel && (
            <div className="relative">
              <button type="button" onClick={() => setShowPrivacyMenu(!showPrivacyMenu)} className="p-1 rounded-full hover:bg-secondary">
                <MoreVertical size={20} />
              </button>
              {showPrivacyMenu && (
                <div className="absolute end-0 top-8 z-50 w-48 rounded-lg border border-border bg-background shadow-lg">
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

      {isDmRoom && vanishMode && (
        <p className="sr-only">
          وضع مخفي — الرسائل الجديدة لا تُحفظ بالكامل. اسحب من أسفل منطقة الإدخال إلى الأعلى لتعطيل الوضع وحذف رسائل هذا الوضع.
        </p>
      )}

      {(chat.pinnedMessageIds || []).some(mid => chat.messages.some(x => x.id === mid)) && (
        <div
          className={
            "no-scrollbar flex shrink-0 flex-nowrap gap-2 overflow-x-scroll overflow-y-hidden overscroll-x-none border-b px-2 py-1.5 touch-pan-x snap-x snap-mandatory " +
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
          meId={me.id}
          state={state}
          isQuran={isQuranChannel}
          hasMessages={false}
          onOpenProfile={() => startTransition(() => onOpenProfile(otherId!))}
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
          "chat-scroll-pane relative z-10 min-h-0 flex-1 touch-pan-y overscroll-none " +
          (drawComposeOpen ? "overflow-hidden " : "overflow-y-auto ") +
          (isQuranChannel ? "bg-zinc-950" : "bg-background")
        }
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div
          className={
            "flex min-h-full w-full flex-col justify-end gap-2 px-3 pt-2 pb-2 " +
            (isQuranChannel ? "bg-zinc-950" : "")
          }
        >
        {displayMessages.map(m => {
          const mine = isOwnChatMessage(m.senderId, state, { directMessagePeerId: otherId });
          const senderProfile = userById(state, m.senderId);
          const bareSticker = m.type === "sticker" && (isStickerImageContent(m.content) || isStickerVideoContent(m.content));
          const bareImage = m.type === "image" && m.content.startsWith("data:") && !m.viewOnce;
          const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(m.content) && !m.viewOnce;
          const bareVideo = m.type === "video" && !m.viewOnce;
          const bareVoiceBubble = m.type === "voice";
          const bareViewOnceMedia =
            ((m.type === "image" || m.type === "video") && !!m.viewOnce && m.content.startsWith("data:")) ||
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
          const bubbleBase =
            bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing
              ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible outline-none"
              : chatBubbleFilledClass(mine, isQuranChannel);
          const bubbleClass =
            bubbleBase +
            (!(bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing) && vanishMode && m.id.startsWith("vx_")
              ? " ring-2 ring-orange-500/50 border border-orange-400/40"
              : "");
          return (
            <ChatSwipeMessageRow
              key={m.id}
              message={m}
              mine={mine}
              isQuran={isQuranChannel}
              avatarName={!mine ? senderProfile?.username || "?" : undefined}
              avatarSrc={!mine ? senderProfile?.avatar : undefined}
              onSwipeReply={() => startTransition(() => setReplyingTo(m))}
              onPointerDown={onMsgPointerDown}
              onPointerMove={onMsgPointerMove}
              onPointerUp={onMsgPointerUp}
            >
              <div
                ref={el => {
                  if (el) messageElRefs.current.set(m.id, el);
                  else messageElRefs.current.delete(m.id);
                }}
                className={
                  "relative flex w-max flex-col gap-0.5 " +
                  colClass +
                  " " +
                  (mine ? "items-end self-end" : "items-start self-start")
                }
              >
                <div className={bubbleClass}>{renderBubbleContent(m, mine)}</div>
                {m.reactions && m.reactions.length > 0 && (
                  <div
                    className={
                      "-mt-2 z-[1] flex flex-wrap items-center gap-0.5 " +
                      (mine ? "self-end pe-1" : "self-start ps-1")
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

      {messageContext &&
        (() => {
          const m = messageContext;
          const mine = isOwnChatMessage(m.senderId, state, { directMessagePeerId: otherId });
          const bareSticker = m.type === "sticker" && (isStickerImageContent(m.content) || isStickerVideoContent(m.content));
          const bareImage = m.type === "image" && m.content.startsWith("data:") && !m.viewOnce;
          const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(m.content) && !m.viewOnce;
          const bareVideo = m.type === "video" && !m.viewOnce;
          const bareVoiceBubble = m.type === "voice";
          const bareViewOnceMedia =
            ((m.type === "image" || m.type === "video") && !!m.viewOnce && m.content.startsWith("data:")) ||
            (m.type === "drawing" && !!m.viewOnce);
          const bubbleClass =
            bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing
              ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible outline-none"
              : chatBubbleFilledClass(mine, isQuranChannel) + " shadow-lg";

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

      <div ref={composerRef} className="relative z-[56] shrink-0 isolate">
      {!canPost ? (
        <div
          className={
            "p-4 text-center text-sm border-t border-border " +
            (keyboardOpen ? "pb-1.5" : "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]") +
            " " +
            (isQuranChannel ? "text-zinc-400 bg-zinc-900 border-zinc-700" : "text-muted-foreground bg-background")
          }
        >
          {t("onlyOwner")}
        </div>
      ) : (
        <div
          className={
            "border-t border-border " +
            (isQuranChannel ? "bg-zinc-900 border-zinc-700" : "bg-background")
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
          {isGroupChat && mentionPick && (
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
            className={"px-2 pt-1 " + (keyboardOpen ? "pb-1.5" : "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]")}
          >
            <div
              dir="ltr"
              className={
                "relative flex min-h-[44px] h-12 flex-nowrap items-center gap-1 rounded-full border px-1.5 shadow-sm " +
                (isQuranChannel
                  ? "border-zinc-800/95 bg-[#1a1a1a]"
                  : "border-border bg-muted dark:border-zinc-800 dark:bg-[#1c1c1c]")
              }
            >
              {!composerHasText && (
              <button
                type="button"
                className={
                  "flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full transition hover:bg-black/[0.06] active:scale-[0.97] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "text-zinc-950 dark:text-white")
                }
                aria-label="كاميرا"
                onClick={() => {
                  setPlusAttachOpen(false);
                  cameraCaptureRef.current?.click();
                }}
              >
                <Camera size={21} strokeWidth={2} className="pointer-events-none text-current" />
              </button>
              )}
              <input
                ref={composerInputRef}
                value={text}
                onChange={e => onComposerChange(e.target.value)}
                onInput={e => onComposerChange(e.currentTarget.value)}
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
                onFocus={() => {
                  stickToBottomRef.current = true;
                  scrollMessagesToBottom();
                  window.setTimeout(scrollMessagesToBottom, 120);
                }}
                placeholder={t("typeMessage")}
                className={
                  "min-h-0 min-w-0 flex-1 bg-transparent py-0 text-[15px] leading-5 outline-none " +
                  (isQuranChannel
                    ? "text-emerald-50 caret-emerald-200 placeholder:text-emerald-200/55"
                    : "text-zinc-900 caret-zinc-800 placeholder:text-zinc-500/65 dark:text-zinc-50 dark:caret-zinc-200 dark:placeholder:text-zinc-400/60")
                }
              />

              {composerHasText ? (
                <button
                  type="button"
                  className="relative z-[57] flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#0084ff] text-white shadow-sm transition hover:bg-[#0073e6] active:scale-[0.97]"
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
              ) : recording ? (
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                  aria-label={t("stop")}
                  onClick={stopRecording}
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : composerMicCooldown ? (
                <div
                  className="h-10 w-10 shrink-0 touch-none pointer-events-none"
                  aria-hidden
                />
              ) : (
                <button
                  type="button"
                  className={
                    "flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/85 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                    (isQuranChannel ? "text-zinc-200" : "")
                  }
                  aria-label="تسجيل صوتي"
                  onClick={() => {
                    if (Date.now() < blockMicUntilRef.current) return;
                    void startRecording();
                  }}
                >
                  <Mic size={21} strokeWidth={2} className="pointer-events-none" />
                </button>
              )}

              {!composerHasText && (
              <>
              <button
                type="button"
                className={
                  "flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/85 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "")
                }
                aria-label="الاستديو: ضغطة للصور والفيديو، ضغط مطوّل لمقاطع كرسالة صوتية"
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
              >
                <ImageIcon size={21} strokeWidth={2} />
              </button>

              <button
                type="button"
                className={
                  "flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-foreground/85 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                  (isQuranChannel ? "text-zinc-200" : "")
                }
                aria-label="ملصقات"
                onClick={() => {
                  setPlusAttachOpen(false);
                  toggleStickerPanel();
                }}
              >
                <Sticker size={21} strokeWidth={2} />
              </button>

              <div ref={plusAttachMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  className={
                    "flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full border text-foreground/90 transition hover:bg-black/[0.06] dark:hover:bg-white/10 " +
                    (isQuranChannel ? "border-zinc-600/80 text-zinc-200" : "border-muted-foreground/40")
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
                      disabled={isGuest}
                      className={
                        "flex w-full items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-secondary " +
                        (isQuranChannel ? "text-zinc-100" : "") +
                        (isGuest ? " cursor-not-allowed opacity-40" : "")
                      }
                      onClick={() => {
                        setPlusAttachOpen(false);
                        if (isGuest) {
                          notifyGuestActionBlocked();
                          return;
                        }
                        setDrawComposeOpen(true);
                      }}
                    >
                      <PenLine size={18} /> <span>رسم وكتابة</span>
                    </button>
                  </div>
                )}
              </div>
              </>
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
            </div>
          </form>
        </div>
      )}
      </div>
      {cameraCompose && (
        <ChatCameraComposeModal
          draft={cameraCompose}
          senderName={me.username}
          senderAvatar={me.avatar}
          onClose={() => setCameraCompose(null)}
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
      </div>
      </div>
    </div>
  );
}