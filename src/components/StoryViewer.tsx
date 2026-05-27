import { useCallback, useEffect, useRef, useState } from "react";
import {
  useApp,
  userById,
  visibleMediaNotes,
  isMutual,
  storiesForUser,
} from "@/lib/store";
import {
  firstUnseenStoryIndex,
  nextAuthorInTray,
  prevAuthorInTray,
} from "@/lib/storyTray";
import { preloadStoryUrls } from "@/lib/storyPreload";
import { StoryViewsSheet } from "./stories/StoryViewsSheet";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { MediaNote } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ShareSheet } from "./ShareSheet";
import { NoteReplySheet } from "./NoteReplySheet";
import { StoryStickerLayer } from "./story/StoryStickerLayer";
import { VerifiedMarkForUser } from "./VerifiedBadge";
import { normalizeStoryMedia } from "@/lib/storyMedia";
import { lockStoryFullscreen } from "@/lib/storyChrome";
import { X, Send, Share2, Bookmark, ChevronLeft, Heart, ChevronUp } from "lucide-react";

const STORY_SEGMENT_CAP_MS = 5000;

export function StoryViewer({
  userId,
  trayRing,
  initialStoryId,
  openOrigin,
  onClose,
  onOpenProfile,
  onOpenChat,
  onRequestAuthor,
}: {
  userId: string;
  /** ترتيب شريط الستوري (للتنقل الأفقي بين الحسابات) */
  trayRing: string[];
  initialStoryId?: string;
  /** موضع الصورة الدائرية لأنيميشن الفتح */
  openOrigin?: DOMRect;
  onClose: () => void;
  onOpenProfile?: (id: string) => void;
  onOpenChat?: (chatId: string) => void;
  /** الانتقال لحساب ستوري آخر، أو `null` للإغلاق */
  onRequestAuthor?: (id: string | null) => void;
}) {
  const { state, currentUser, openOrCreateChat, sendMessage, toggleStoryLike, recordStoryView, deleteStory, isGuest } =
    useApp();
  const me = currentUser!;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const author = userById(state, userId);
  const stories = storiesForUser(state, userId, me.id);

  const ring = trayRing.length > 0 ? trayRing : [userId];

  const [i, setI] = useState(0);
  const pendingStoryIdRef = useRef(initialStoryId);
  const [entering, setEntering] = useState(true);
  const [userSlideX, setUserSlideX] = useState(0);
  const [userSlideSpring, setUserSlideSpring] = useState(false);
  const horizDragRef = useRef<{
    pointerId: number;
    startX: number;
    startSlideX: number;
    lastX: number;
    lastT: number;
    velocity: number;
    axis: "none" | "h" | "v";
  } | null>(null);
  const viewportWRef = useRef(typeof window !== "undefined" ? window.innerWidth : 390);
  const cappedStoryIndex = stories.length > 0 ? Math.min(Math.max(0, i), stories.length - 1) : 0;
  const curStoryForHooks = stories.length > 0 ? stories[cappedStoryIndex] : undefined;

  const [reply, setReply] = useState("");
  const [shareStoryId, setShareStoryId] = useState<string | null>(null);
  const [noteToReply, setNoteToReply] = useState<MediaNote | null>(null);
  const [showHighlightModal, setShowHighlightModal] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState("");

  const snapRef = useRef({ storiesLen: stories.length, userId, ring });
  snapRef.current = { storiesLen: stories.length, userId, ring };

  const canReplyToStories = userId === me.id || (author?.allowStoryReplies !== false);

  const [segmentMs, setSegmentMs] = useState(STORY_SEGMENT_CAP_MS);
  const deadlineRef = useRef(0);
  const advanceTimerRef = useRef<number | null>(null);
  const holdRemainingRef = useRef(0);
  const isHoldingProgressRef = useRef(false);
  const [middleHold, setMiddleHold] = useState(false);
  const [topChromeVisible, setTopChromeVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chromeHideTimerRef = useRef<number | null>(null);
  const [ownViewsOpen, setOwnViewsOpen] = useState(false);
  const ownPullRef = useRef<{ y0: number; pointerId: number } | null>(null);
  const [dismissY, setDismissY] = useState(0);
  const [dismissSpring, setDismissSpring] = useState(false);
  const dismissDragRef = useRef<{
    pointerId: number;
    startY: number;
    startDismissY: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const viewportHRef = useRef(typeof window !== "undefined" ? window.innerHeight : 800);
  const dismissDoneRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const gestureRafRef = useRef<number | null>(null);
  const pendingGestureRef = useRef<{ x?: number; y?: number }>({});

  useEffect(() => {
    const releaseFullscreen = lockStoryFullscreen();
    document.documentElement.classList.add("retweet-story-open");
    return () => {
      releaseFullscreen();
      document.documentElement.classList.remove("retweet-story-open");
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      dismissDoneRef.current = false;
    };
  }, []);

  const closeViewer = useCallback(() => {
    if (dismissDoneRef.current) return;
    dismissDoneRef.current = true;
    onCloseRef.current();
  }, []);

  const showTopChrome = useCallback(() => {
    setTopChromeVisible(true);
    if (chromeHideTimerRef.current != null) window.clearTimeout(chromeHideTimerRef.current);
    chromeHideTimerRef.current = window.setTimeout(() => {
      chromeHideTimerRef.current = null;
      setTopChromeVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    showTopChrome();
    return () => {
      if (chromeHideTimerRef.current != null) window.clearTimeout(chromeHideTimerRef.current);
    };
  }, [userId, curStoryForHooks?.id, showTopChrome]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !curStoryForHooks) return;
    const media = normalizeStoryMedia(curStoryForHooks);
    if (!media.hasVideo) return;

    const playWithSound = () => {
      v.muted = false;
      v.volume = 1;
      const p = v.play();
      if (p) {
        p.catch(() => {
          v.muted = true;
          void v.play();
        });
      }
    };

    playWithSound();
    v.addEventListener("loadeddata", playWithSound, { once: true });
    return () => v.removeEventListener("loadeddata", playWithSound);
  }, [curStoryForHooks?.id, curStoryForHooks?.video, curStoryForHooks?.image]);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current != null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const goToNextAuthor = useCallback(() => {
    const nextU = nextAuthorInTray(ring, userId);
    if (nextU) {
      pendingStoryIdRef.current = undefined;
      onRequestAuthor?.(nextU);
      return true;
    }
    if (onRequestAuthor) onRequestAuthor(null);
    else closeViewer();
    return false;
  }, [onRequestAuthor, ring, userId, closeViewer]);

  const goToPrevAuthor = useCallback(() => {
    const prevU = prevAuthorInTray(ring, userId);
    if (prevU) {
      pendingStoryIdRef.current = undefined;
      onRequestAuthor?.(prevU);
      return true;
    }
    return false;
  }, [onRequestAuthor, ring, userId]);

  const goForward = useCallback(() => {
    clearAdvanceTimer();
    setI(prev => {
      const { storiesLen, userId: uid } = snapRef.current;
      if (prev < storiesLen - 1) return prev + 1;
      goToNextAuthor();
      return prev;
    });
  }, [goToNextAuthor, clearAdvanceTimer]);

  const goBack = useCallback(() => {
    setI(prev => {
      if (prev > 0) return prev - 1;
      goToPrevAuthor();
      return prev;
    });
  }, [goToPrevAuthor]);

  const goForwardRef = useRef(goForward);
  goForwardRef.current = goForward;

  useEffect(() => {
    setDismissY(0);
    setDismissSpring(false);
    setUserSlideX(0);
    setUserSlideSpring(false);
    setEntering(true);
    const t = window.setTimeout(() => setEntering(false), 400);
    const list = storiesForUser(state, userId, me.id);
    const fromId = pendingStoryIdRef.current;
    let start = 0;
    if (fromId) {
      const fi = list.findIndex(s => s.id === fromId);
      start = fi >= 0 ? fi : 0;
      pendingStoryIdRef.current = undefined;
    } else {
      start = firstUnseenStoryIndex(list, me.id);
    }
    setI(start);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- إعادة ضبط الشريحة عند تغيير الحساب فقط
  }, [userId]);

  useEffect(() => {
    const onResize = () => {
      viewportHRef.current = window.innerHeight;
      viewportWRef.current = window.innerWidth;
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (gestureRafRef.current != null) {
        cancelAnimationFrame(gestureRafRef.current);
        gestureRafRef.current = null;
      }
    };
  }, []);

  const finishDismiss = useCallback(() => {
    if (dismissDoneRef.current) return;
    const h = viewportHRef.current;
    setDismissSpring(true);
    setDismissY(h);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      closeViewer();
    }, 280);
  }, [closeViewer]);

  const snapDismissBack = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDismissSpring(true);
    setDismissY(0);
    window.setTimeout(() => setDismissSpring(false), 320);
  }, []);

  useEffect(() => {
    if (stories.length === 0) return;
    setI(prev => Math.min(prev, stories.length - 1));
  }, [stories.length]);

  useEffect(() => {
    if (!author) {
      const t = window.setTimeout(() => closeViewer(), 0);
      return () => clearTimeout(t);
    }
  }, [author, closeViewer]);

  useEffect(() => {
    if (!curStoryForHooks?.id) return;
    setSegmentMs(STORY_SEGMENT_CAP_MS);
    isHoldingProgressRef.current = false;
    setMiddleHold(false);
  }, [curStoryForHooks?.id]);

  const armAdvanceTimer = useCallback(() => {
    clearAdvanceTimer();
    if (!author || stories.length === 0 || isHoldingProgressRef.current) return;
    const ms = Math.max(0, deadlineRef.current - Date.now());
    if (ms <= 0) {
      goForwardRef.current();
      return;
    }
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      goForwardRef.current();
    }, ms);
  }, [author, stories.length, clearAdvanceTimer]);

  const pauseProgressForHold = useCallback(() => {
    if (isHoldingProgressRef.current) return;
    isHoldingProgressRef.current = true;
    holdRemainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    clearAdvanceTimer();
  }, [clearAdvanceTimer]);

  const resumeProgressAfterHold = useCallback(() => {
    if (!isHoldingProgressRef.current) return;
    isHoldingProgressRef.current = false;
    deadlineRef.current = Date.now() + holdRemainingRef.current;
    armAdvanceTimer();
  }, [armAdvanceTimer]);

  useEffect(() => {
    if (!curStoryForHooks?.id || userId === me.id || isGuest) return;
    recordStoryView(curStoryForHooks.id);
  }, [curStoryForHooks?.id, userId, me.id, isGuest, recordStoryView]);

  useEffect(() => {
    setOwnViewsOpen(false);
  }, [curStoryForHooks?.id, userId]);

  useEffect(() => {
    if (!author || stories.length === 0) return;
    if (ownViewsOpen) {
      clearAdvanceTimer();
      return;
    }
    deadlineRef.current = Date.now() + segmentMs;
    armAdvanceTimer();
    return () => clearAdvanceTimer();
  }, [i, stories.length, author, userId, segmentMs, ownViewsOpen, armAdvanceTimer, clearAdvanceTimer]);

  useEffect(() => {
    if (!author || stories.length === 0) return;
    const idx = Math.min(Math.max(0, i), stories.length - 1);
    const urls: string[] = [];
    for (let off = -1; off <= 2; off++) {
      const s = stories[idx + off];
      if (!s) continue;
      const m = normalizeStoryMedia(s);
      if (m.imageUrl) urls.push(m.imageUrl);
      if (m.videoUrl) urls.push(m.videoUrl);
    }
    preloadStoryUrls(urls);
  }, [userId, i, stories, author]);

  if (!author) {
    return null;
  }

  if (stories.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center p-6 text-white">
        <button type="button" className="absolute top-3 end-3 p-2 rounded-full bg-white/10" onClick={closeViewer} aria-label="إغلاق">
          <X size={24} />
        </button>
        <p className="text-center text-base mb-2 mt-8">لا توجد ستوريات لهذا الحساب حالياً.</p>
        {userId === me.id && <p className="text-center text-sm text-white/70 mb-6">أنشئ ستوري من زر + ثم اختر «ستوري».</p>}
        <button type="button" className="bg-[#0095F6] px-8 py-2.5 rounded-full font-semibold" onClick={closeViewer}>
          رجوع
        </button>
      </div>
    );
  }

  const displayIdx = Math.min(Math.max(0, i), stories.length - 1);
  const cur = stories[displayIdx];
  const storyMedia = normalizeStoryMedia(cur);
  const storyLiked = (cur.likes || []).includes(me.id);
  const storyNotes = visibleMediaNotes(state, "story", cur.id, me.id).slice(0, 8);

  const submitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    if (!reply.trim() || !canReplyToStories || userId === me.id) return;
    const chat = openOrCreateChat(userId);
    if (!chat) {
      if (isGuest) notifyGuestActionBlocked();
      else window.alert("تعذّر فتح المحادثة.");
      return;
    }
    sendMessage(chat.id, {
      type: "shared_story",
      content: cur.id,
      shareText: reply.trim(),
      replyContext: { kind: "story", storyId: cur.id, storyAuthorId: userId },
    });
    setReply("");
  };

  const saveAsHighlight = () => {
    if (!highlightTitle.trim() || userId !== me.id) return;
    alert(`تم حفظ الهايلايت "${highlightTitle}" بنجاح!`);
    setShowHighlightModal(false);
    setHighlightTitle("");
  };

  const handleDeleteCurrentStory = () => {
    if (userId !== me.id || !cur?.id) return;
    if (!window.confirm("حذف هذه الستوري؟")) return;
    const remaining = stories.length - 1;
    const atLast = displayIdx >= remaining && remaining > 0;
    deleteStory(cur.id);
    setOwnViewsOpen(false);
    if (remaining <= 0) {
      if (onRequestAuthor) onRequestAuthor(null);
      else closeViewer();
      return;
    }
    if (atLast) setI((prev) => Math.max(0, prev - 1));
  };

  const onOwnZonePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || ownViewsOpen) return;
    ownPullRef.current = { y0: e.clientY, pointerId: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onOwnZonePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ownPullRef.current;
    if (!p || e.pointerId !== p.pointerId || ownViewsOpen) return;
    const pull = p.y0 - e.clientY;
    if (pull > 96) setOwnViewsOpen(true);
  };

  const endOwnZonePull = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ownPullRef.current;
    ownPullRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (ownViewsOpen || !p || e.pointerId !== p.pointerId) return;
    const pull = p.y0 - e.clientY;
    if (pull > 44) setOwnViewsOpen(true);
  };

  const dismissProgress = dismissY / Math.max(1, viewportHRef.current);
  const dismissScale = Math.max(0.88, 1 - dismissProgress * 0.1);
  const backdropOpacity = Math.max(0, 1 - dismissProgress * 0.9);

  const snapUserSlideBack = useCallback(() => {
    setUserSlideSpring(true);
    setUserSlideX(0);
    window.setTimeout(() => setUserSlideSpring(false), 280);
  }, []);

  const onGesturePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || ownViewsOpen) return;
    if ((e.target as HTMLElement).closest("[data-story-interactive]")) return;
    horizDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startSlideX: userSlideX,
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      axis: "none",
    };
    dismissDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startDismissY: dismissY,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
    setDismissSpring(false);
    setUserSlideSpring(false);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onGesturePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = horizDragRef.current;
    const p = dismissDragRef.current;
    if (!h || !p || e.pointerId !== h.pointerId || ownViewsOpen) return;

    const dx = e.clientX - h.startX;
    const dy = e.clientY - p.startY;

    if (h.axis === "none") {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        h.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
    }

    const now = performance.now();
    const dt = Math.max(1, now - h.lastT);
    h.velocity = (e.clientX - h.lastX) / dt;
    h.lastX = e.clientX;
    h.lastT = now;

    if (h.axis === "h") {
      const w = viewportWRef.current;
      const atStart = !prevAuthorInTray(ring, userId) && dx > 0;
      const atEnd = !nextAuthorInTray(ring, userId) && dx < 0;
      let x = h.startSlideX + dx;
      if (atStart && x > 0) x *= 0.35;
      if (atEnd && x < 0) x *= 0.35;
      pendingGestureRef.current.x = Math.max(-w, Math.min(w, x));
      if (gestureRafRef.current == null) {
        gestureRafRef.current = requestAnimationFrame(() => {
          gestureRafRef.current = null;
          if (typeof pendingGestureRef.current.x === "number") {
            setUserSlideX(pendingGestureRef.current.x);
          }
        });
      }
      return;
    }

    if (h.axis === "v") {
      const ddy = Math.max(0, dy);
      p.velocity = (e.clientY - p.lastY) / dt;
      p.lastY = e.clientY;
      p.lastT = now;
      pendingGestureRef.current.y = p.startDismissY + ddy;
      if (gestureRafRef.current == null) {
        gestureRafRef.current = requestAnimationFrame(() => {
          gestureRafRef.current = null;
          if (typeof pendingGestureRef.current.y === "number") {
            setDismissY(pendingGestureRef.current.y);
          }
        });
      }
    }
  };

  const endGestureDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = horizDragRef.current;
    const p = dismissDragRef.current;
    horizDragRef.current = null;
    dismissDragRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (!h || !p || e.pointerId !== h.pointerId || ownViewsOpen) return;

    if (h.axis === "h") {
      const w = viewportWRef.current;
      const x = userSlideX;
      const rtl =
        typeof document !== "undefined" &&
        document.documentElement.getAttribute("dir") === "rtl";
      const goNext = rtl ? x > w * 0.22 || h.velocity > 0.35 : x < -w * 0.22 || h.velocity < -0.35;
      const goPrev = rtl ? x < -w * 0.22 || h.velocity < -0.35 : x > w * 0.22 || h.velocity > 0.35;
      if (goNext) {
        setUserSlideSpring(true);
        setUserSlideX(rtl ? w : -w);
        window.setTimeout(() => {
          goToNextAuthor();
          setUserSlideX(0);
          setUserSlideSpring(false);
        }, 220);
      } else if (goPrev) {
        setUserSlideSpring(true);
        setUserSlideX(rtl ? -w : w);
        window.setTimeout(() => {
          goToPrevAuthor();
          setUserSlideX(0);
          setUserSlideSpring(false);
        }, 220);
      } else {
        snapUserSlideBack();
      }
      return;
    }

    if (h.axis === "v") {
      const vh = viewportHRef.current;
      const dy = Math.max(0, e.clientY - p.startY) + p.startDismissY;
      if (dy > vh * 0.42 || p.velocity > 0.42) finishDismiss();
      else snapDismissBack();
    }
  };

  const heroScale = openOrigin
    ? Math.max(0.35, Math.min(1, (openOrigin.width * 1.1) / viewportWRef.current))
    : 1;
  const heroTx = openOrigin
    ? openOrigin.left + openOrigin.width / 2 - viewportWRef.current / 2
    : 0;
  const heroTy = openOrigin
    ? openOrigin.top + openOrigin.height / 2 - viewportHRef.current / 2
    : 0;

  return (
    <div className="fixed inset-0 z-[200] touch-none">
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: backdropOpacity,
          transition: dismissSpring ? "opacity 0.32s cubic-bezier(0.25, 1, 0.35, 1)" : "none",
        }}
        aria-hidden
      />
      <div
        className={
          "absolute inset-0 flex flex-col bg-black " + (entering ? "story-viewer-enter" : "")
        }
        style={{
          transform: entering
            ? `translate3d(${heroTx}px, ${heroTy}px, 0) scale(${heroScale})`
            : `translate3d(${userSlideX}px, ${dismissY}px, 0) scale(${dismissScale})`,
          transformOrigin: "center center",
          transition:
            dismissSpring || userSlideSpring
              ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)"
              : entering
                ? undefined
                : "none",
          willChange: "transform",
        }}
        onPointerDown={onGesturePointerDown}
        onPointerMove={onGesturePointerMove}
        onPointerUp={endGestureDrag}
        onPointerCancel={endGestureDrag}
      >
      <div
        className={
          "absolute inset-x-0 top-0 z-50 flex flex-col pt-[max(0.25rem,env(safe-area-inset-top,0px))] " +
          "bg-gradient-to-b from-black/75 via-black/40 to-transparent transition-opacity duration-300 " +
          (topChromeVisible && !ownViewsOpen ? "opacity-100" : "opacity-0 pointer-events-none")
        }
      >
      <div className="flex gap-1 p-2 shrink-0">
        {stories.map((seg, idx) => (
          <div key={seg.id} className="flex-1 h-[2px] bg-white/35 rounded-full overflow-hidden">
            <div
              key={idx === displayIdx ? `${seg.id}-active` : seg.id}
              className={
                "h-full bg-white rounded-full " +
                (idx < displayIdx ? "w-full" : idx === displayIdx ? "w-0 animate-story-seg" : "w-0")
              }
              style={
                idx === displayIdx
                  ? {
                      animationDuration: `${segmentMs / 1000}s`,
                      animationPlayState: middleHold || ownViewsOpen ? "paused" : "running",
                    }
                  : idx < displayIdx
                    ? { width: "100%" }
                    : undefined
              }
            />
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 px-3 text-white" data-story-interactive>
        <button type="button" onClick={closeViewer} className="p-2" aria-label="رجوع">
          <ChevronLeft size={24} />
        </button>

        <button type="button" onClick={() => onOpenProfile?.(author.id)} className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar name={author.username} src={author.avatar} size={32} />
          <span className="text-sm font-semibold inline-flex items-center gap-1">
            @{author.username}
            <VerifiedMarkForUser user={author} size={16} />
          </span>
        </button>

        {cur.audience === "close" && <span className="text-xs bg-green-600 px-2 py-0.5 rounded-full">مقربون</span>}

        <div className="flex items-center gap-1">
          {userId !== me.id && (
            <button
              type="button"
              className={"p-2 rounded-full " + (storyLiked ? "text-red-500" : "text-white hover:bg-white/10")}
              onClick={e => {
                e.stopPropagation();
                if (isGuest) {
                  notifyGuestActionBlocked();
                  return;
                }
                toggleStoryLike(cur.id);
              }}
              aria-label="إعجاب"
            >
              <Heart size={22} className={storyLiked ? "fill-current" : ""} />
            </button>
          )}
          {userId === me.id && (
            <button type="button" className="p-2" onClick={() => setShowHighlightModal(true)} aria-label="حفظ كهايلايت">
              <Bookmark size={20} />
            </button>
          )}
          <button type="button" className="p-2" onClick={() => setShareStoryId(cur.id)} aria-label="مشاركة">
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {storyNotes.length > 0 && (
        <div className="flex justify-center gap-3 flex-wrap px-2 py-2 shrink-0">
          {storyNotes.map(n => {
            const nu = userById(state, n.authorId);
            if (!nu) return null;
            if (n.authorId !== me.id && !isMutual(state, me.id, n.authorId)) return null;
            const canReplyNote = onOpenChat && n.authorId !== me.id;
            return (
              <div key={n.id} className="flex flex-col items-center max-w-[4.5rem]">
                {canReplyNote ? (
                  <button
                    type="button"
                    title="رد في الخاص"
                    onClick={() => {
                      if (isGuest) {
                        notifyGuestActionBlocked();
                        return;
                      }
                      setNoteToReply(n);
                    }}
                    className="text-[10px] leading-tight text-start bg-white/10 rounded-xl px-1.5 py-0.5 mb-1 line-clamp-2 text-white hover:bg-white/20 w-full"
                  >
                    {n.text}
                  </button>
                ) : (
                  <div className="text-[10px] leading-tight text-start bg-white/10 rounded-xl px-1.5 py-0.5 mb-1 line-clamp-2 text-white w-full">
                    {n.text}
                  </div>
                )}
                <button type="button" onClick={() => onOpenProfile?.(nu.id)}>
                  <Avatar name={nu.username} src={nu.avatar} size={32} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden text-white"
        onPointerDown={e => {
          if ((e.target as HTMLElement).closest("[data-story-interactive]")) return;
          showTopChrome();
        }}
      >
        <div className="relative z-10 flex h-full w-full max-h-full max-w-full items-center justify-center">
          {storyMedia.hasVideo ? (
            <video
              ref={videoRef}
              key={cur.id}
              src={storyMedia.videoUrl}
              className="max-h-full max-w-full object-contain select-none touch-manipulation"
              playsInline
              autoPlay
              loop={false}
              controls={false}
              onPointerDown={() => {
                const v = videoRef.current;
                if (v?.muted) {
                  v.muted = false;
                  v.volume = 1;
                  void v.play();
                }
              }}
              onLoadedMetadata={e => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) {
                  setSegmentMs(Math.min(STORY_SEGMENT_CAP_MS, Math.max(1000, Math.ceil(d * 1000))));
                }
              }}
              onEnded={() => goForwardRef.current()}
            />
          ) : storyMedia.hasImage ? (
            <img
              src={storyMedia.imageUrl}
              className="max-h-full max-w-full object-contain select-none touch-manipulation"
              alt=""
              draggable={false}
            />
          ) : (
            <span className="text-7xl select-none touch-manipulation">
              {storyMedia.emojiFallback || cur.image || "📷"}
            </span>
          )}
          <StoryStickerLayer story={cur} storyAuthorId={author.id} onOpenProfile={onOpenProfile} />
        </div>
        <div
          className="absolute inset-y-0 start-[26%] end-[28%] z-[35] touch-none"
          onPointerDown={e => {
            if (e.button !== 0) return;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            pauseProgressForHold();
            setMiddleHold(true);
          }}
          onPointerUp={e => {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            resumeProgressAfterHold();
            setMiddleHold(false);
          }}
          onPointerCancel={e => {
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            resumeProgressAfterHold();
            setMiddleHold(false);
          }}
        />
        <button
          type="button"
          data-story-interactive
          className="absolute inset-y-0 start-0 w-[26%] z-40 bg-transparent touch-manipulation select-none"
          aria-label="الستوري السابق"
          onClick={e => {
            e.stopPropagation();
            goBack();
          }}
        />
        <button
          type="button"
          data-story-interactive
          className="absolute inset-y-0 end-0 w-[28%] z-40 bg-transparent touch-manipulation select-none"
          aria-label="الستوري التالي"
          onClick={e => {
            e.stopPropagation();
            goForward();
          }}
        />
      </div>

      {canReplyToStories && userId !== me.id && !isGuest && (
        <form onSubmit={submitReply} className="flex shrink-0 gap-2 border-t border-white/10 bg-black/80 p-3" data-story-interactive>
          <input
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="رد على الستوري..."
            className="flex-1 bg-white/10 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/50 outline-none"
            onClick={e => e.stopPropagation()}
          />
          <button type="submit" className="p-2 rounded-full bg-primary text-primary-foreground" aria-label="إرسال">
            <Send size={20} />
          </button>
        </form>
      )}
      {userId === me.id && (
        <div
          className="z-[45] flex shrink-0 touch-none select-none flex-col items-center justify-center gap-0.5 border-t border-white/5 bg-gradient-to-t from-black via-black/95 to-black/40 px-4 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))]"
          style={{ touchAction: "none" }}
          data-story-interactive
          onPointerDown={onOwnZonePointerDown}
          onPointerMove={onOwnZonePointerMove}
          onPointerUp={endOwnZonePull}
          onPointerCancel={endOwnZonePull}
        >
          <ChevronUp className="text-white/55" size={22} strokeWidth={2.25} aria-hidden />
          <span className="text-[11px] font-medium text-white/40 tracking-wide">اسحب لأعلى</span>
          <button
            type="button"
            className="mt-1 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] active:scale-[0.94] active:opacity-80"
            onPointerDown={e => e.stopPropagation()}
            onClick={() => setOwnViewsOpen(true)}
          >
            المشاهدات ({(cur.viewedByUserIds || []).length})
          </button>
        </div>
      )}

      {shareStoryId && <ShareSheet target={{ kind: "story", storyId: shareStoryId }} onClose={() => setShareStoryId(null)} />}
      {noteToReply && onOpenChat && (
        <NoteReplySheet note={noteToReply} contentLabelAr="ستوري" onClose={() => setNoteToReply(null)} onSent={onOpenChat} />
      )}

      {showHighlightModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-background rounded-3xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4">حفظ كهايلايت</h3>
            <p className="text-sm text-muted-foreground mb-4">سيتم حفظ هذه القصة كهايلايت دائم في ملفك الشخصي</p>
            <input
              type="text"
              placeholder="عنوان الهايلايت"
              value={highlightTitle}
              onChange={e => setHighlightTitle(e.target.value)}
              className="w-full bg-input rounded-2xl px-4 py-3 outline-none mb-4"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowHighlightModal(false)} className="flex-1 py-3 rounded-2xl bg-secondary font-semibold">
                إلغاء
              </button>
              <button type="button" onClick={saveAsHighlight} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      <StoryViewsSheet
        open={userId === me.id && ownViewsOpen}
        story={cur}
        state={state}
        onClose={() => setOwnViewsOpen(false)}
        onOpenProfile={onOpenProfile}
        onDelete={handleDeleteCurrentStory}
      />
      </div>
    </div>
  );
}
