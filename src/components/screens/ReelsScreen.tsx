import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useIsTabActive } from "@/lib/tabActiveContext";
import { useApp, userById, visibleMediaNotes, isMutual } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { MediaNote, Post, ProfileReturnContext } from "@/lib/types";
import { NoteReplySheet } from "../NoteReplySheet";
import { useT } from "@/lib/i18n";
import { Avatar } from "../Avatar";
import { ShareSheet } from "../ShareSheet";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Volume2,
  VolumeX,
  X,
  MoreVertical,
  Music2,
  Pause,
} from "lucide-react";
import { PostOptionsMenu, CommentOptionsMenu } from "../PostOptionsMenu";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { isReelFeedPost, normalizePostMedia, type NormalizedPostMedia } from "@/lib/postMedia";
import { REEL_SAFE_CONTENT_RATIO } from "@/lib/reelsSpec";

/* ═══════════════════════════════════════
   ReelMediaPlayer — مشغّل الفيديو بملء الشاشة
═══════════════════════════════════════ */
const ReelMediaPlayer = memo(function ReelMediaPlayer({
  media,
  active,
  soundOn,
  paused,
  onDoubleTap,
  onHoldStart,
  onHoldEnd,
}: {
  media: NormalizedPostMedia;
  active: boolean;
  soundOn: boolean;
  paused: boolean;
  onDoubleTap: (x: number, y: number) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !media.hasVideo) return;
    if (active) {
      v.muted = !soundOn;
      const play = v.play();
      if (play) play.catch(() => { v.muted = true; void v.play(); });
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [active, soundOn, media.hasVideo, media.videoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !media.hasVideo || !active) return;
    if (paused) v.pause();
    else {
      const p = v.play();
      if (p) p.catch(() => { /* ignore */ });
    }
  }, [paused, active, media.hasVideo]);

  /* pointer handlers — Double Tap + Hold to Pause */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== "touch") return;
    const now = Date.now();
    const prev = lastTapRef.current;

    if (prev && now - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 60) {
      lastTapRef.current = null;
      onDoubleTap(e.clientX, e.clientY);
      return;
    }
    lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      onHoldStart();
    }, 380);
  };

  const onPointerUp = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    onHoldEnd();
  };

  const frameClass = "absolute inset-0 flex items-center justify-center bg-black";
  /** فيديوهات مُعالَجة على الخادم (9:16) — ملء الشاشة؛ غير ذلك contain بدون تشويه */
  const fillFrame =
    !!media.videoUrl &&
    (/\/media\/videos\//.test(media.videoUrl) || media.videoUrl.includes(".mp4"));

  return (
    <div
      className="absolute inset-0 cursor-pointer reel-safe-stage"
      style={
        {
          ["--reel-safe-bottom-ratio" as string]: String(1 - REEL_SAFE_CONTENT_RATIO),
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {media.hasVideo && media.videoUrl ? (
        <div className={frameClass}>
          <video
            ref={videoRef}
            src={media.videoUrl}
            loop
            playsInline
            preload="auto"
            poster={media.posterUrl || undefined}
            className={
              "h-full w-full " + (fillFrame ? "object-cover object-center" : "object-contain")
            }
          />
        </div>
      ) : media.hasImage && media.imageUrl ? (
        <div className={frameClass}>
          <img
            src={media.imageUrl}
            alt=""
            className={
              "h-full w-full " + (fillFrame ? "object-cover object-center" : "object-contain")
            }
          />
        </div>
      ) : (
        <div className={frameClass + " text-6xl"}>
          {media.emojiFallback || "🎬"}
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════
   HeartBurst — أنيميشن قلب عند Double Tap
═══════════════════════════════════════ */
function HeartBurst({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y }}
    >
      <Heart
        size={96}
        className="fill-white stroke-white drop-shadow-[0_0_24px_rgba(255,255,255,0.6)] animate-reel-heart"
      />
    </div>
  );
}

/* ═══════════════════════════════════════
   PausedOverlay
═══════════════════════════════════════ */
function PausedOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/30">
      <div className="rounded-full bg-black/50 p-5 backdrop-blur-sm">
        <Pause size={44} className="fill-white stroke-white" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ReelSlide — حاوية شريحة واحدة
═══════════════════════════════════════ */
const REEL_SLIDE_HEIGHT_FALLBACK =
  "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))";

const ReelSlide = memo(function ReelSlide({
  reelId,
  slideHeightPx,
  children,
}: {
  reelId: string;
  slideHeightPx: number;
  children: ReactNode;
}) {
  const slideStyle =
    slideHeightPx > 0
      ? { height: slideHeightPx, minHeight: slideHeightPx }
      : { height: REEL_SLIDE_HEIGHT_FALLBACK, minHeight: REEL_SLIDE_HEIGHT_FALLBACK };

  return (
    <section
      data-reel-slide
      data-reel-id={reelId}
      className="relative w-full shrink-0 overflow-hidden bg-black"
      style={slideStyle}
    >
      {children}
    </section>
  );
});

/* ═══════════════════════════════════════
   SideActionButton — زر جانبي عائم
═══════════════════════════════════════ */
function SideActionButton({
  onClick,
  label,
  icon,
  count,
  active,
  activeColor = "text-rose-500",
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
  activeColor?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={
        "flex flex-col items-center gap-1 transition-transform duration-100 " +
        (pressed ? "scale-75" : "scale-100") +
        " " +
        (active ? activeColor : "text-white")
      }
      style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.55))" }}
    >
      {icon}
      {count != null && (
        <span className="text-xs font-semibold leading-none drop-shadow-sm">
          {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
        </span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════
   ReelsScreen — الشاشة الرئيسية
═══════════════════════════════════════ */
export function ReelsScreen({
  onOpenProfile,
  onOpenChat,
  restoreFromProfileContext = null,
  onConsumedRestoreFromProfile,
}: {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenChat: (chatId: string) => void;
  restoreFromProfileContext?: ProfileReturnContext | null;
  onConsumedRestoreFromProfile?: () => void;
}) {
  const { state, toggleLike, currentUser, addComment, isGuest, refreshFromServer } =
    useApp();
  const isTabActive = useIsTabActive("reels");
  const t = useT();
  const me = currentUser!;

  const guestBlock = () => {
    if (!isGuest) return false;
    notifyGuestActionBlocked();
    return true;
  };

  const [tab, setTab] = useState<"all" | "friends">("all");
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [reelPullHint, setReelPullHint] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [reelMenuId, setReelMenuId] = useState<string | null>(null);
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);
  /* Double Tap Heart */
  const [heartBurst, setHeartBurst] = useState<{ id: string; x: number; y: number } | null>(null);
  /* Hold to Pause — يتتبع state لكل ريل نشط */
  const [holdPaused, setHoldPaused] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef({ y0: 0, active: false });
  const activeReelIdRef = useRef<string | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const snapLockRef = useRef(false);
  const [slideHeightPx, setSlideHeightPx] = useState(0);

  const unlockSound = useCallback(() => setSoundUnlocked(true), []);

  /* تحديث عند تفعيل التبويب */
  useEffect(() => {
    if (!isTabActive) return;
    refreshFromServer();
  }, [refreshFromServer, isTabActive]);

  /* منع overscroll على الصفحة */
  useEffect(() => {
    document.documentElement.classList.add("retweet-overscroll-lock");
    return () => document.documentElement.classList.remove("retweet-overscroll-lock");
  }, []);

  /* Pull to refresh */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      pullRef.current = { y0: e.touches[0].clientY, active: el.scrollTop <= 0 };
    };
    const onEnd = (e: TouchEvent) => {
      if (!pullRef.current.active) return;
      pullRef.current.active = false;
      const dy = (e.changedTouches[0]?.clientY ?? pullRef.current.y0) - pullRef.current.y0;
      if (el.scrollTop <= 0 && dy > 72) {
        refreshFromServer();
        setReelPullHint(true);
        window.setTimeout(() => setReelPullHint(false), 1200);
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [refreshFromServer]);

  /* قائمة الريلز */
  const allReels = useMemo(() => {
    const seen = new Set<string>();
    return state.posts
      .filter(p => {
        if (!p?.id || !isReelFeedPost(p) || seen.has(p.id)) return false;
        seen.add(p.id);
        const author = userById(state, p.userId);
        if (!author) return true;
        if (author.blocked.includes(me.id) || me.blocked.includes(author.id)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.posts, state.users, me.id, me.blocked]);

  const reels = tab === "friends"
    ? allReels.filter(p => me.following.includes(p.userId))
    : allReels;

  const reelIdSetKey = useMemo(() => reels.map(r => r.id).sort().join("|"), [reels]);

  /* قياس ارتفاع الشريحة */
  useLayoutEffect(() => {
    if (!isTabActive) return;
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setSlideHeightPx(h);
    };
    measure();
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [isTabActive, tab, reelPullHint, reelIdSetKey]);

  /* الريل الأول عند تغيير القائمة */
  useEffect(() => {
    const first = reels[0]?.id ?? null;
    if (!first) {
      setActiveReelId(null);
      activeReelIdRef.current = null;
      return;
    }
    if (!activeReelIdRef.current || !reels.some(r => r.id === activeReelIdRef.current)) {
      setActiveReelId(first);
      activeReelIdRef.current = first;
      const el = scrollRef.current;
      if (el && slideHeightPx > 0) el.scrollTo({ top: 0, behavior: "auto" });
      else if (el) el.scrollTop = 0;
    }
  }, [reelIdSetKey, tab, slideHeightPx]);

  useEffect(() => {
    activeReelIdRef.current = activeReelId;
    /* إلغاء Hold عند تغيير الريل */
    setHoldPaused(false);
  }, [activeReelId]);

  /* Snap to nearest */
  const snapToNearestReel = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const root = scrollRef.current;
      const h = slideHeightPx;
      if (!root || h <= 0 || reels.length === 0 || snapLockRef.current) return;
      const idx = Math.min(reels.length - 1, Math.max(0, Math.round(root.scrollTop / h)));
      const targetTop = idx * h;
      const id = reels[idx]!.id;
      if (Math.abs(root.scrollTop - targetTop) > 2) {
        snapLockRef.current = true;
        root.scrollTo({ top: targetTop, behavior });
        window.setTimeout(() => { snapLockRef.current = false; }, behavior === "smooth" ? 320 : 48);
      }
      if (id !== activeReelIdRef.current) {
        activeReelIdRef.current = id;
        setActiveReelId(id);
      }
    },
    [reels, slideHeightPx],
  );

  const syncActiveReelFromScroll = useCallback(() => {
    const root = scrollRef.current;
    const h = slideHeightPx;
    if (!root || h <= 0 || reels.length === 0) return;
    const idx = Math.min(reels.length - 1, Math.max(0, Math.round(root.scrollTop / h)));
    const id = reels[idx]!.id;
    if (id !== activeReelIdRef.current) {
      activeReelIdRef.current = id;
      setActiveReelId(id);
    }
  }, [reels, slideHeightPx]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || reels.length === 0 || slideHeightPx <= 0) return;
    const onScroll = () => {
      if (snapLockRef.current) return;
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        syncActiveReelFromScroll();
      });
    };
    const onScrollEnd = () => snapToNearestReel("auto");
    const onTouchEnd = () => {
      window.setTimeout(() => {
        const h = slideHeightPx;
        if (!root || h <= 0) return;
        const off = root.scrollTop % h;
        if (off > 6 && off < h - 6) snapToNearestReel("auto");
      }, 80);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("scrollend", onScrollEnd, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    syncActiveReelFromScroll();
    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("scrollend", onScrollEnd);
      root.removeEventListener("touchend", onTouchEnd);
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [reelIdSetKey, slideHeightPx, syncActiveReelFromScroll, snapToNearestReel]);

  /* استعادة السياق بعد زيارة بروفايل */
  useLayoutEffect(() => {
    if (!restoreFromProfileContext || restoreFromProfileContext.tab !== "reels") return;
    const d = restoreFromProfileContext;
    onConsumedRestoreFromProfile?.();
    if (!d.postId) return;
    const p = state.posts.find(x => x.id === d.postId);
    if (!p || !isReelFeedPost(p)) return;
    if (d.commentsOpen) setCommentsFor(p);
    else setCommentsFor(null);
    setActiveReelId(p.id);
    activeReelIdRef.current = p.id;
    queueMicrotask(() => {
      const root = scrollRef.current;
      const h = slideHeightPx;
      if (!root || h <= 0) return;
      const idx = reels.findIndex(r => r.id === d.postId);
      if (idx < 0) return;
      root.scrollTo({ top: idx * h, behavior: "auto" });
    });
  }, [restoreFromProfileContext, state.posts, onConsumedRestoreFromProfile, reels, slideHeightPx]);

  const effectiveSoundOn = soundOn && soundUnlocked;

  /* Double Tap Like */
  const handleDoubleTap = useCallback(
    (postId: string, x: number, y: number) => {
      if (guestBlock()) return;
      const post = reels.find(r => r.id === postId);
      if (!post) return;
      /* إضافة لايك دائماً عند Double Tap (مثل Instagram) */
      if (!post.likes.includes(me.id)) toggleLike(postId);
      try {
        (navigator as unknown as { vibrate?: (p: number) => void }).vibrate?.(15);
      } catch { /* ignore */ }
      setHeartBurst({ id: postId, x, y });
      window.setTimeout(() => setHeartBurst(prev => (prev?.id === postId ? null : prev)), 800);
    },
    [reels, me.id, toggleLike, isGuest],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black text-white overscroll-none">

      {/* ── Glassmorphism Top Bar (مثل Instagram) ── */}
      <div
        className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex items-end justify-between pb-2 pt-[env(safe-area-inset-top,0px)]"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)",
          backdropFilter: "none",
        }}
      >
        {/* Tabs */}
        <div className="flex flex-1 items-center justify-center gap-6 px-4">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={
              "pb-1 text-[15px] font-semibold transition-all duration-200 " +
              (tab === "all"
                ? "border-b-2 border-white text-white"
                : "text-white/55")
            }
          >
            ريلز
          </button>
          <button
            type="button"
            onClick={() => setTab("friends")}
            className={
              "pb-1 text-[15px] font-semibold transition-all duration-200 " +
              (tab === "friends"
                ? "border-b-2 border-white text-white"
                : "text-white/55")
            }
          >
            أصدقاء
          </button>
        </div>

        {/* Sound toggle */}
        {reels.length > 0 && (
          <button
            type="button"
            onClick={() => { unlockSound(); setSoundOn(s => !s); }}
            className="absolute end-4 bottom-2 rounded-full bg-black/35 p-2 backdrop-blur-sm"
            aria-label={soundOn ? "كتم الصوت" : "تشغيل الصوت"}
          >
            {soundOn && effectiveSoundOn
              ? <Volume2 size={20} />
              : <VolumeX size={20} />}
          </button>
        )}
      </div>

      {/* Pull hint */}
      {reelPullHint && (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-50 flex justify-center">
          <span className="rounded-full bg-white/20 px-4 py-1.5 text-xs font-medium backdrop-blur-md">
            تم التحديث ✓
          </span>
        </div>
      )}

      {/* Double Tap Heart Burst */}
      {heartBurst && <HeartBurst x={heartBurst.x} y={heartBurst.y} />}

      {/* Scroll Container */}
      <div
        ref={scrollRef}
        data-no-tab-swipe
        className="reels-snap-viewport no-scrollbar mx-auto h-full min-h-0 w-full max-w-md flex-1 overflow-y-scroll overscroll-none"
        onPointerDown={unlockSound}
        onTouchStart={unlockSound}
      >
        {reels.length === 0 && (
          <p
            className="flex items-center justify-center text-center text-white/60 px-4 text-sm"
            style={{ minHeight: REEL_SLIDE_HEIGHT_FALLBACK }}
          >
            {t("noReels")}
          </p>
        )}

        {reels.map(r => {
          const slideH = slideHeightPx > 0 ? slideHeightPx : 0;
          const u = userById(state, r.userId);
          const media = normalizePostMedia(r);
          const liked = r.likes.includes(me.id);
          const notes = visibleMediaNotes(state, "post", r.id, me.id).slice(0, 8);
          const isActive = isTabActive && activeReelId === r.id;

          return (
            <ReelSlide key={r.id} reelId={r.id} slideHeightPx={slideH}>
              {/* Fuild fill */}
              <ReelMediaPlayer
                media={media}
                active={isActive}
                soundOn={effectiveSoundOn}
                paused={isActive && holdPaused}
                onDoubleTap={(x, y) => handleDoubleTap(r.id, x, y)}
                onHoldStart={() => { if (isActive) setHoldPaused(true); }}
                onHoldEnd={() => setHoldPaused(false)}
              />

              {/* Hold to Pause overlay */}
              {isActive && holdPaused && <PausedOverlay />}

              {/* Bottom gradient */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
                style={{
                  height: "65%",
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.38) 45%, transparent 100%)",
                }}
              />

              {/* ── خيارات الريل (صاحبه فقط) ── */}
              {r.userId === me.id && (
                <div className="absolute top-[calc(env(safe-area-inset-top,0px)+3.5rem)] end-4 z-30">
                  <button
                    type="button"
                    onClick={() => setReelMenuId(reelMenuId === r.id ? null : r.id)}
                    className="rounded-full bg-black/40 p-2 text-white backdrop-blur-sm"
                    aria-label="خيارات الريل"
                  >
                    <MoreVertical size={20} />
                  </button>
                  {reelMenuId === r.id && (
                    <PostOptionsMenu
                      post={r}
                      onClose={() => setReelMenuId(null)}
                      onDeleted={() => {
                        setReelMenuId(null);
                        if (commentsFor?.id === r.id) setCommentsFor(null);
                      }}
                    />
                  )}
                </div>
              )}

              {/* ── أزرار جانبية عائمة (مثل Instagram) ── */}
              <div
                className="absolute end-3 z-20 flex flex-col items-center gap-5"
                style={{
                  bottom: "max(5.5rem, calc(var(--retweet-nav-float-inset, 3.5rem) + 56px))",
                }}
              >
                {/* Like */}
                <SideActionButton
                  onClick={() => { if (guestBlock()) return; toggleLike(r.id); }}
                  label="إعجاب"
                  icon={
                    <Heart
                      size={30}
                      strokeWidth={liked ? 0 : 1.75}
                      className={liked ? "fill-rose-500 text-rose-500" : "fill-transparent text-white"}
                      style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.6))" }}
                    />
                  }
                  count={r.likes.length}
                  active={liked}
                  activeColor="text-rose-500"
                />

                {/* Comment */}
                <SideActionButton
                  onClick={() => setCommentsFor(r)}
                  label="تعليقات"
                  icon={<MessageCircle size={30} strokeWidth={1.75} style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.6))" }} />}
                  count={r.comments.length}
                />

                {/* Share */}
                <SideActionButton
                  onClick={() => { if (guestBlock()) return; setSharePost(r); }}
                  label="مشاركة"
                  icon={<Send size={28} strokeWidth={1.75} style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.6))" }} />}
                />

                {/* Save / Bookmark */}
                <SideActionButton
                  onClick={() => { if (guestBlock()) return; /* TODO: save */ }}
                  label="حفظ"
                  icon={<Bookmark size={28} strokeWidth={1.75} style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.6))" }} />}
                />

                {/* Sound indicator / disc */}
                <div className="h-9 w-9 overflow-hidden rounded-full border-2 border-white/50 shadow-lg">
                  <Avatar name={u?.username || "?"} src={u?.avatar} size={36} />
                </div>
              </div>

              {/* ── معلومات الريل (أسفل اليسار/اليمين) ── */}
              <div
                className="absolute start-3 z-20 max-w-[min(62%,calc(100%-5.5rem))] pe-1"
                style={{
                  bottom: "max(5.5rem, calc(var(--retweet-nav-float-inset, 3.5rem) + 56px))",
                  paddingInlineEnd: "var(--reel-safe-inline-end, 4.5rem)",
                }}
              >
                {/* Notes */}
                {notes.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5 max-h-14 overflow-y-auto no-scrollbar">
                    {notes.map(n => {
                      const nu = userById(state, n.authorId);
                      if (!nu) return null;
                      const show = n.authorId === me.id || isMutual(state, me.id, n.authorId);
                      if (!show) return null;
                      const canReplyNote = n.authorId !== me.id;
                      return (
                        <div
                          key={n.id}
                          className="flex items-center gap-1 rounded-full border border-white/20 bg-black/50 py-0.5 ps-1 pe-2 backdrop-blur-sm max-w-[12rem]"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenProfile(nu.id, { tab: "reels" })}
                            className="shrink-0 ring-1 ring-white/30 rounded-full"
                          >
                            <Avatar name={nu.username} src={nu.avatar} size={20} />
                          </button>
                          {canReplyNote ? (
                            <button
                              type="button"
                              onClick={() => { if (guestBlock()) return; setNoteToReply(n); }}
                              className="text-[10px] leading-snug text-white/90 line-clamp-1 text-start hover:underline"
                            >
                              {n.text}
                            </button>
                          ) : (
                            <span className="text-[10px] leading-snug text-white/90 line-clamp-1">{n.text}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Username */}
                <button
                  type="button"
                  onClick={() => u && onOpenProfile(u.id, { tab: "reels" })}
                  className="mb-1 flex items-center gap-1.5"
                >
                  <Avatar name={u?.username || "?"} src={u?.avatar} size={28} className="ring-2 ring-white/40" />
                  <span className="text-[14px] font-semibold drop-shadow-sm">
                    @{u?.username ?? "user"}
                  </span>
                  {u && <VerifiedMarkForUser user={u} size={15} />}
                </button>

                {/* Caption */}
                {r.text ? (
                  <p className="text-[13px] leading-snug text-white/90 line-clamp-2 drop-shadow-sm">
                    {r.text}
                  </p>
                ) : null}

                {/* Audio row */}
                <div className="mt-1.5 flex items-center gap-1.5 text-white/70">
                  <Music2 size={13} className="shrink-0" />
                  <span className="text-[11px] truncate">
                    {u?.username ? `${u.username} · صوت أصلي` : "صوت أصلي"}
                  </span>
                </div>
              </div>
            </ReelSlide>
          );
        })}
      </div>

      {/* ── Sheets & Modals ── */}
      {sharePost && (
        <ShareSheet target={{ kind: "post", post: sharePost }} onClose={() => setSharePost(null)} />
      )}

      <NoteReplySheet
        note={noteToReply}
        contentLabelAr="الريلز"
        onClose={() => setNoteToReply(null)}
        onSent={onOpenChat}
      />

      {/* Comments Sheet */}
      {commentsFor && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setCommentsFor(null)}
        >
          <div
            className="w-full max-w-md mx-auto flex flex-col rounded-t-3xl"
            style={{
              background: "rgba(18,18,18,0.97)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              maxHeight: "68vh",
              paddingBottom: "env(safe-area-inset-bottom,0px)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>

            <div className="flex items-center justify-between px-4 pb-3">
              <span className="text-[15px] font-semibold text-white">
                {commentsFor.comments.length > 0
                  ? `${commentsFor.comments.length} تعليق`
                  : "تعليقات"}
              </span>
              <button type="button" onClick={() => setCommentsFor(null)} aria-label="إغلاق">
                <X size={22} className="text-white/70" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-4 no-scrollbar">
              {commentsFor.comments.map(c => {
                const cu = userById(state, c.userId);
                return (
                  <div key={c.id} className="flex gap-2.5 text-sm">
                    <button
                      type="button"
                      onClick={() =>
                        cu &&
                        onOpenProfile(cu.id, {
                          postId: commentsFor.id,
                          tab: "reels",
                          commentsOpen: true,
                        })
                      }
                    >
                      <Avatar name={cu?.username || "?"} src={cu?.avatar} size={34} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="font-semibold text-white/90"
                        onClick={() =>
                          cu &&
                          onOpenProfile(cu.id, {
                            postId: commentsFor.id,
                            tab: "reels",
                            commentsOpen: true,
                          })
                        }
                      >
                        @{cu?.username}
                      </button>{" "}
                      <span className="text-white/75">{c.text}</span>
                    </div>
                    {c.userId === me.id && (
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCommentMenuId(commentMenuId === c.id ? null : c.id)
                          }
                          className="rounded-full p-1 text-white/50"
                          aria-label="خيارات التعليق"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {commentMenuId === c.id && commentsFor && (
                          <CommentOptionsMenu
                            postId={commentsFor.id}
                            commentId={c.id}
                            authorId={c.userId}
                            onClose={() => setCommentMenuId(null)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {commentsFor.comments.length === 0 && (
                <p className="py-8 text-center text-white/40 text-sm">لا تعليقات بعد</p>
              )}
            </div>

            {!isGuest ? (
              <form
                className="flex gap-2 px-4 pt-2 pb-2 border-t border-white/10"
                onSubmit={e => {
                  e.preventDefault();
                  if (!commentDraft.trim()) return;
                  addComment(commentsFor.id, commentDraft);
                  setCommentDraft("");
                }}
              >
                <Avatar name={me.username} src={me.avatar} size={32} className="shrink-0" />
                <input
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  placeholder="أضف تعليقاً..."
                  className="flex-1 rounded-full bg-white/10 px-4 py-2 text-[14px] text-white placeholder-white/35 outline-none"
                  style={{ caretColor: "white" }}
                />
                {commentDraft.trim() && (
                  <button
                    type="submit"
                    className="self-center text-[14px] font-bold text-sky-400"
                  >
                    إرسال
                  </button>
                )}
              </form>
            ) : (
              <p className="border-t border-white/10 px-4 py-3 text-center text-xs text-white/40">
                سجّل الدخول للتعليق
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
