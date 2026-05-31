import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { blurActiveElement, runNavigationDismiss } from "@/lib/navigationDismiss";
import { registerPointerBackLayer } from "@/lib/globalPointerBackRouter";
import {
  CHAT_EDGE_SWIPE_HIT_PX,
  chatDismissClampTx,
  chatDismissOffscreenTx,
  chatDismissPanelTranslate,
  chatDismissProgress,
  chatDismissReleaseTarget,
  clampDismissTranslate,
  dismissReleaseTargetTx,
  dismissTranslateToProgress,
  isChatDismissSwipeDelta,
  isDismissSwipeDelta,
  isDocumentRtl,
  isPointerInChatDismissStartZone,
  isPointerOnDismissEdge,
  type DismissGestureProfile,
} from "@/lib/edgeSwipeDismiss";

export {
  isDocumentRtl,
  EDGE_SWIPE_HIT_PX,
  CHAT_EDGE_SWIPE_HIT_PX,
  CHAT_SWIPE_COMMIT_PX,
  CHAT_DISMISS_FLING_VX,
  type DismissGestureProfile,
} from "@/lib/edgeSwipeDismiss";

export const APP_COLUMN_MAX_PX = 448;
export const SLIDE_DISMISS_MS = 260;
export const SLIDE_DISMISS_EASE = "cubic-bezier(0.25, 1, 0.35, 1)";

/** مرحلة انتقال مكدس المحادثة — فتح (من اليمين) أو إغلاق (نحو اليسار) */
export type ChatStackTransitionPhase = "open" | "close";

/**
 * تحويلات مكدس المحادثة (قائمة + غرفة).
 * RTL: الغرفة من اليمين (+w) → 0 عند الفتح، القائمة 0 → +w؛ عند الإغلاق العكس.
 */
export function chatStackLayerTransforms(
  progress: number,
  widthPx: number,
  rtl = isDocumentRtl(),
  opts?: { phase?: ChatStackTransitionPhase; /** @deprecated */ roomExitsToStart?: boolean },
) {
  const p = Math.max(0, Math.min(1, progress));
  const w = Math.max(260, Math.round(widthPx));
  if (rtl) {
    const inboxTx = Math.round(p * w);
    return {
      inbox: `translate3d(${inboxTx}px, 0, 0)`,
      room: `translate3d(${w - inboxTx}px, 0, 0)`,
    };
  }
  const inboxTx = Math.round(-p * w);
  const roomTx = Math.round((p - 1) * w);
  return {
    inbox: `translate3d(${inboxTx}px, 0, 0)`,
    room: `translate3d(${roomTx}px, 0, 0)`,
  };
}

/**
 * فتح المحادثة من القائمة بسحب يسار→يمين: الغرفة من اليسار، القائمة لليمين.
 */
export function chatStackOpenFromLeftTransforms(progress: number, widthPx: number) {
  const p = Math.max(0, Math.min(1, progress));
  const w = Math.max(260, Math.round(widthPx));
  const inboxTx = Math.round(p * w);
  return {
    inbox: `translate3d(${inboxTx}px, 0, 0)`,
    room: `translate3d(${inboxTx - w}px, 0, 0)`,
  };
}

export type UseSlideDismissBackOptions = {
  onDismiss: () => void;
  enabled?: boolean;
  blocked?: boolean;
  dismissPullCssVar?: string;
  stackProgressCssVar?: string;
  embedInStack?: boolean;
  /** embedInStack + chat: يُمرَّر tx (بكسل). غير ذلك: progress 0…1 */
  onStackProgress?: (value: number, phase?: "move" | "end" | "start") => void;
  resetKey?: string | number;
  edgeBottomInsetPx?: number;
  /** لا تغطّي شريط الحافة رأس الشاشة (أزرار الرجوع والقائمة في RTL) */
  edgeTopInsetPx?: number;
  /** سحب أفقي على اللوحة (بعد تجاوز عتبة الحافة أو سحب أفقي واضح) */
  panelSwipeDismiss?: boolean;
  /** محادثة: حافة يمين + سحب لليسار؛ باقي التطبيق: حافة يسار + سحب لليمين في RTL */
  dismissGesture?: DismissGestureProfile;
  /** انزلاق عند فتح اللوحة (مثل إعدادات / تعديل البروفايل) */
  animateOnMount?: boolean;
};

export function useSlideDismissBack({
  onDismiss,
  enabled = true,
  blocked = false,
  dismissPullCssVar,
  stackProgressCssVar,
  embedInStack = false,
  onStackProgress,
  resetKey,
  edgeBottomInsetPx = 80,
  edgeTopInsetPx = 0,
  panelSwipeDismiss = false,
  dismissGesture = "app",
  animateOnMount = false,
}: UseSlideDismissBackOptions) {
  const dismissProfile = dismissGesture;
  const dismissRtl = dismissProfile === "chat" ? true : isDocumentRtl();
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(
    typeof window !== "undefined" ? Math.min(window.innerWidth, APP_COLUMN_MAX_PX) : APP_COLUMN_MAX_PX,
  );
  const liveTxRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    startTx: number;
    fromPanel: boolean;
    fromEdge: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    startTx: 0,
    fromPanel: false,
    fromEdge: false,
  });
  const panelPendingRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const edgePendingRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const velocityRef = useRef(0);
  const moveSampleRef = useRef({ x: 0, t: 0 });
  const dismissingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingTxRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const blockedRef = useRef(blocked);
  enabledRef.current = enabled;
  blockedRef.current = blocked;

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onStackProgressRef = useRef(onStackProgress);
  onStackProgressRef.current = onStackProgress;

  const [slideTx, setSlideTx] = useState(0);
  const [slideSpring, setSlideSpring] = useState(false);

  const clampTx = useCallback(
    (tx: number) => {
      const w = widthRef.current;
      return dismissProfile === "chat" ? chatDismissClampTx(tx, w) : clampDismissTranslate(tx, w, dismissRtl, dismissProfile);
    },
    [dismissProfile, dismissRtl],
  );

  const stackOpenProgress = useCallback(
    (tx: number) => {
      const w = widthRef.current;
      return dismissProfile === "chat" ? chatDismissProgress(tx, w) : dismissTranslateToProgress(tx, w, dismissRtl, dismissProfile);
    },
    [dismissProfile, dismissRtl],
  );

  const notifyStackDismissStart = useCallback(() => {
    if (!embedInStack || dismissProfile !== "chat") return;
    onStackProgressRef.current?.(liveTxRef.current, "start");
  }, [embedInStack, dismissProfile]);

  const notifyStackProgress = useCallback(
    (tx: number, phase: "move" | "end" = "move") => {
      if (embedInStack && dismissProfile === "chat") {
        onStackProgressRef.current?.(tx, phase);
        return;
      }
      const p = stackOpenProgress(tx);
      onStackProgressRef.current?.(p, phase);
      if (stackProgressCssVar && typeof document !== "undefined") {
        document.documentElement.style.setProperty(stackProgressCssVar, String(p));
      }
    },
    [embedInStack, dismissProfile, stackOpenProgress, stackProgressCssVar],
  );

  const flushTx = useCallback(
    (tx: number, phase: "move" | "end" = "move") => {
      liveTxRef.current = tx;
      if (embedInStack) {
        notifyStackProgress(tx, phase);
        return;
      }
      setSlideTx(tx);
    },
    [embedInStack, notifyStackProgress],
  );

  const scheduleTx = useCallback(
    (tx: number) => {
      pendingTxRef.current = tx;
      if (rafRef.current !== null) return;
      const tick = () => {
        rafRef.current = null;
        const next = pendingTxRef.current;
        if (next === null) return;
        pendingTxRef.current = null;
        flushTx(next);
        if (pendingTxRef.current !== null) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [flushTx],
  );

  const cancelScheduledTx = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingTxRef.current = null;
  }, []);

  const dismissOffscreenTx = useCallback(() => {
    const w = widthRef.current;
    if (dismissProfile === "chat") return chatDismissOffscreenTx(w);
    return dismissRtl ? w : -w;
  }, [dismissProfile, dismissRtl]);

  const finishDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    blurActiveElement();
    cancelScheduledTx();
    const target = dismissOffscreenTx();
    if (embedInStack) {
      setSlideSpring(true);
      flushTx(target, "end");
      window.setTimeout(() => {
        try {
          runNavigationDismiss(() => onDismissRef.current());
        } finally {
          dismissingRef.current = false;
        }
      }, SLIDE_DISMISS_MS);
      return;
    }
    setSlideSpring(true);
    setSlideTx(target);
    window.setTimeout(() => {
      try {
        runNavigationDismiss(() => onDismissRef.current());
      } finally {
        dismissingRef.current = false;
      }
    }, SLIDE_DISMISS_MS);
  }, [embedInStack, flushTx, cancelScheduledTx, dismissOffscreenTx]);

  const requestDismiss = useCallback(
    (opts?: { immediate?: boolean }): boolean => {
      if (!enabled || blocked) return false;
      if (opts?.immediate) {
        if (dismissingRef.current) return false;
        dismissingRef.current = true;
        cancelScheduledTx();
        blurActiveElement();
        runNavigationDismiss(() => {
          try {
            onDismissRef.current();
          } finally {
            dismissingRef.current = false;
          }
        }, { immediate: true });
        return true;
      }
      if (dismissingRef.current) return false;
      finishDismiss();
      return true;
    },
    [enabled, blocked, finishDismiss, cancelScheduledTx],
  );

  const snapBack = useCallback(() => {
    cancelScheduledTx();
    setSlideSpring(true);
    if (embedInStack) {
      flushTx(0, "end");
    } else {
      setSlideTx(0);
    }
    liveTxRef.current = 0;
    window.setTimeout(() => setSlideSpring(false), SLIDE_DISMISS_MS);
  }, [embedInStack, flushTx, cancelScheduledTx]);

  useEffect(() => {
    dismissingRef.current = false;
    cancelScheduledTx();
    liveTxRef.current = 0;
    if (!embedInStack) {
      setSlideTx(0);
    }
    setSlideSpring(false);
    dragRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startTx: 0,
      fromPanel: false,
      fromEdge: false,
    };
    panelPendingRef.current = null;
  }, [resetKey, embedInStack, cancelScheduledTx]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect().width;
      widthRef.current = Math.max(260, Math.min(r || window.innerWidth, APP_COLUMN_MAX_PX));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const mountEnterDoneRef = useRef(false);
  useLayoutEffect(() => {
    if (!animateOnMount || embedInStack || !enabled) return;
    if (mountEnterDoneRef.current) return;
    mountEnterDoneRef.current = true;
    const w = Math.max(260, widthRef.current);
    const startTx = dismissRtl ? w : -w;
    cancelScheduledTx();
    liveTxRef.current = startTx;
    setSlideSpring(false);
    setSlideTx(startTx);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setSlideSpring(true);
        setSlideTx(0);
        liveTxRef.current = 0;
        window.setTimeout(() => setSlideSpring(false), SLIDE_DISMISS_MS);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [animateOnMount, embedInStack, enabled, dismissRtl, cancelScheduledTx]);

  useLayoutEffect(() => {
    if (embedInStack) return;
    const w = Math.max(260, widthRef.current);
    const openProgress = stackOpenProgress(slideTx);
    onStackProgressRef.current?.(openProgress, "move");
    if (stackProgressCssVar) {
      document.documentElement.style.setProperty(stackProgressCssVar, String(openProgress));
    }
    if (!dismissPullCssVar) return;
    const p = Math.min(1, Math.abs(slideTx) / w);
    document.documentElement.style.setProperty(dismissPullCssVar, String(p));
  }, [slideTx, dismissPullCssVar, stackProgressCssVar, embedInStack, stackOpenProgress]);

  useEffect(() => {
    return () => {
      cancelScheduledTx();
      if (dismissPullCssVar) document.documentElement.style.removeProperty(dismissPullCssVar);
      if (stackProgressCssVar) document.documentElement.style.removeProperty(stackProgressCssVar);
    };
  }, [dismissPullCssVar, stackProgressCssVar, cancelScheduledTx]);

  const clearPanelPending = useCallback(() => {
    panelPendingRef.current = null;
    edgePendingRef.current = null;
  }, []);

  const isInteractiveDismissTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest("[data-chat-back-btn], [data-profile-back-btn]")) return true;
    return !!target.closest(
      "button, a, input, select, textarea, label, [role='switch'], [role='button'], [data-no-dismiss-drag], [data-profile-scroll], [data-profile-menu-btn], [data-chat-privacy-menu-btn], [data-profile-menu], [data-chat-privacy-menu]",
    );
  };

  const isChatDismissStart = (clientX: number, target: EventTarget | null) => {
    const root = containerRef.current;
    if (!root) return false;
    const rect = root.getBoundingClientRect();
    return isPointerInChatDismissStartZone(clientX, rect, target);
  };

  const beginDrag = useCallback(
    (pointerId: number, startX: number, startY: number, fromPanel: boolean, fromEdge: boolean) => {
      setSlideSpring(false);
      velocityRef.current = 0;
      moveSampleRef.current = { x: startX, t: performance.now() };
      dragRef.current = {
        pointerId,
        startX,
        startY,
        startTx: liveTxRef.current,
        fromPanel,
        fromEdge,
      };
      notifyStackDismissStart();
    },
    [notifyStackDismissStart],
  );

  /** يعادل onHorizontalDragEnd — إطلاق السحب وتحديد الإغلاق أو الارتداد */
  const finishDragGesture = useCallback(
    (pointerId: number) => {
      if (edgePendingRef.current?.pointerId === pointerId) {
        clearPanelPending();
        return;
      }
      const d = dragRef.current;
      if (d.pointerId === null || d.pointerId !== pointerId) return;
      dragRef.current = {
        pointerId: null,
        startX: 0,
        startY: 0,
        startTx: 0,
        fromPanel: false,
        fromEdge: false,
      };
      clearPanelPending();
      cancelScheduledTx();
      if (pendingTxRef.current !== null) {
        flushTx(pendingTxRef.current);
        pendingTxRef.current = null;
      }
      if (!enabledRef.current || blockedRef.current) {
        snapBack();
        return;
      }
      const tx = liveTxRef.current;
      const w = widthRef.current;
      const target =
        dismissProfile === "chat"
          ? chatDismissReleaseTarget(tx, w, velocityRef.current)
          : dismissReleaseTargetTx(tx, w, dismissRtl, dismissProfile);
      velocityRef.current = 0;
      if (target !== 0) {
        finishDismiss();
      } else {
        snapBack();
      }
    },
    [finishDismiss, snapBack, cancelScheduledTx, flushTx, clearPanelPending, dismissProfile, dismissRtl],
  );

  /** يعادل onHorizontalDragUpdate — تحديث إزاحة السحب الأفقي */
  const onDragPointerMove = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      if (!enabledRef.current || blockedRef.current) {
        if (dragRef.current.pointerId === pointerId) {
          dragRef.current = {
            pointerId: null,
            startX: 0,
            startY: 0,
            startTx: 0,
            fromPanel: false,
            fromEdge: false,
          };
          clearPanelPending();
          cancelScheduledTx();
        }
        return;
      }
      const edgePending = edgePendingRef.current;
      if (edgePending && edgePending.pointerId === pointerId && dragRef.current.pointerId == null) {
        const dx = clientX - edgePending.startX;
        const dy = clientY - edgePending.startY;
        if (dismissProfile === "chat" && dx > 0) return;
        const edgeOk =
          dismissProfile === "chat"
            ? isChatDismissSwipeDelta(dx, dy)
            : isDismissSwipeDelta(dx, dy, dismissRtl, dismissProfile);
        if (!edgeOk) return;
        edgePendingRef.current = null;
        beginDrag(pointerId, edgePending.startX, edgePending.startY, false, true);
      }
      const pending = panelPendingRef.current;
      if (pending && pending.pointerId === pointerId && dragRef.current.pointerId == null) {
        const dx = clientX - pending.startX;
        const dy = clientY - pending.startY;
        const panelOk =
          dismissProfile === "chat"
            ? isChatDismissSwipeDelta(dx, dy)
            : isDismissSwipeDelta(dx, dy, dismissRtl, dismissProfile);
        if (!panelOk) return;
        clearPanelPending();
        beginDrag(pointerId, pending.startX, pending.startY, true, false);
      }
      const d = dragRef.current;
      if (d.pointerId == null || d.pointerId !== pointerId) return;
      const delta = clientX - d.startX;
      const next = clampTx(d.startTx + delta);
      if (dismissProfile === "chat" && next > 0) {
        scheduleTx(0);
        return;
      }
      const now = performance.now();
      const sampleDt = now - moveSampleRef.current.t;
      if (sampleDt > 0 && sampleDt < 100) {
        velocityRef.current = (clientX - moveSampleRef.current.x) / sampleDt;
      }
      moveSampleRef.current = { x: clientX, t: now };
      scheduleTx(next);
    },
    [clampTx, scheduleTx, beginDrag, clearPanelPending, cancelScheduledTx, dismissProfile, dismissRtl],
  );

  /** موجه مؤشر عالمي (document capture) — أولوية على أي عنصر مخصص */
  useEffect(() => {
    if (!enabled) return;
    return registerPointerBackLayer({
      getContainer: () => containerRef.current,
      dismissProfile,
      isActive: () => enabledRef.current && !blockedRef.current && !dismissingRef.current,
      onEdgePointerDown: (e: PointerEvent) => {
        const root = containerRef.current;
        if (!root) return;
        if (dismissProfile === "chat") {
          edgePendingRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
        } else {
          beginDrag(e.pointerId, e.clientX, e.clientY, false, true);
        }
        try {
          root.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onPointerMove: (e: PointerEvent) => {
        onDragPointerMove(e.clientX, e.clientY, e.pointerId);
      },
      onPointerUp: (e: PointerEvent) => {
        const root = containerRef.current;
        try {
          if (root?.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        finishDragGesture(e.pointerId);
      },
    });
  }, [resetKey, enabled, blocked, dismissProfile, beginDrag, onDragPointerMove, finishDragGesture]);

  const finishDragGestureReact = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const edgePending = edgePendingRef.current;
      if (edgePending?.pointerId === e.pointerId) {
        clearPanelPending();
        return;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      finishDragGesture(e.pointerId);
    },
    [finishDragGesture, clearPanelPending],
  );

  const onPanelPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!panelSwipeDismiss || !enabled || blocked || dismissingRef.current) {
        clearPanelPending();
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (isInteractiveDismissTarget(e.target)) return;
      if (dismissProfile === "chat") {
        if (!isChatDismissStart(e.clientX, e.target)) return;
      } else {
        const root = containerRef.current;
        if (root) {
          const rect = root.getBoundingClientRect();
          if (isPointerOnDismissEdge(e.clientX, rect, dismissProfile)) return;
        }
      }
      panelPendingRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
      if (dismissProfile === "chat") {
        try {
          containerRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    },
    [panelSwipeDismiss, enabled, blocked, clearPanelPending, dismissProfile],
  );

  const onPanelPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      onDragPointerMove(e.clientX, e.clientY, e.pointerId);
    },
    [onDragPointerMove],
  );

  const onPanelPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const pending = panelPendingRef.current;
      if (pending?.pointerId === e.pointerId) {
        clearPanelPending();
        return;
      }
      finishDragGestureReact(e);
    },
    [finishDragGestureReact, clearPanelPending],
  );

  const onPanelPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      clearPanelPending();
      if (dragRef.current.pointerId === e.pointerId) {
        finishDragGesture(e.pointerId);
      }
    },
    [finishDragGesture, clearPanelPending],
  );

  const isDragging = dragRef.current.pointerId != null;

  const rtl = isDocumentRtl();
  const wPanel = widthRef.current;
  const chatPanelTx =
    dismissProfile === "chat" ? chatDismissPanelTranslate(slideTx, wPanel) : slideTx;
  const panelStyle: React.CSSProperties = embedInStack
    ? {
        transform: "none",
        transition: "none",
      }
    : {
        transform: `translate3d(${chatPanelTx}px, 0, 0)`,
        transition: slideSpring
          ? `transform ${SLIDE_DISMISS_MS}ms ${dismissProfile === "chat" ? "cubic-bezier(0.32, 0.72, 0, 1)" : SLIDE_DISMISS_EASE}`
          : "none",
        boxShadow:
          Math.abs(chatPanelTx) > 4
            ? dismissProfile === "chat" || slideTx < 0
              ? `-${Math.min(16, Math.abs(chatPanelTx) * 0.04 + 4)}px 0 ${Math.min(40, Math.abs(chatPanelTx) * 0.08 + 12)}px rgba(0,0,0,${Math.min(0.22, Math.abs(chatPanelTx) / wPanel * 0.18 + 0.06)})`
              : rtl
                ? "8px 0 24px rgba(0,0,0,0.12)"
                : "-8px 0 20px rgba(0,0,0,0.1)"
            : undefined,
        borderRadius:
          dismissProfile === "chat" && Math.abs(chatPanelTx) > 2
            ? `${Math.min(18, Math.abs(chatPanelTx) / wPanel * 18)}px 0 0 ${Math.min(18, Math.abs(chatPanelTx) / wPanel * 18)}px`
            : undefined,
        willChange: isDragging ? "transform" : "auto",
      };

  const edgeStripClassName =
    (dismissProfile === "chat"
      ? "absolute right-0 top-0 z-[30] touch-none select-none pointer-events-auto bg-transparent "
      : "absolute left-0 top-0 z-[10000] w-[max(30px,8vw)] max-w-[48px] touch-none select-none pointer-events-auto bg-transparent ") +
    (!enabled || blocked ? "!pointer-events-none opacity-0" : "");
  const edgeStripStyle: React.CSSProperties =
    dismissProfile === "chat"
      ? {
          left: "auto",
          right: 0,
          width: CHAT_EDGE_SWIPE_HIT_PX,
          minWidth: CHAT_EDGE_SWIPE_HIT_PX,
          maxWidth: CHAT_EDGE_SWIPE_HIT_PX,
          top: Math.max(0, edgeTopInsetPx),
          bottom: Math.max(0, edgeBottomInsetPx),
        }
      : {
          top: Math.max(0, edgeTopInsetPx),
          bottom: Math.max(0, edgeBottomInsetPx),
        };

  const edgeStripProps = {
    role: "presentation" as const,
    "aria-hidden": true as const,
    className: edgeStripClassName,
    style: edgeStripStyle,
    "data-edge-swipe-back": true as const,
  };

  const panelSwipeProps = panelSwipeDismiss
    ? {
        onPointerDownCapture: onPanelPointerDown,
        onPointerMoveCapture: onPanelPointerMove,
        onPointerUpCapture: onPanelPointerUp,
        onPointerCancelCapture: onPanelPointerCancel,
        onLostPointerCapture: onPanelPointerCancel,
        style: {
          touchAction: (dismissProfile === "chat" ? "pan-y pinch-zoom" : "pan-y") as const,
        },
      }
    : {};

  return {
    containerRef,
    panelStyle,
    requestDismiss,
    edgeStripProps,
    panelSwipeProps,
    slideTx,
  };
}
