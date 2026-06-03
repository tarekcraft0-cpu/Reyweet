import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { registerPointerBackLayer } from "@/lib/globalPointerBackRouter";
import {
  CHAT_NAV_EDGE_PX,
  CHAT_NAV_MS,
  chatNavReleaseTarget,
  chatNavWidth,
  isChatNavBackSwipe,
} from "@/lib/chatNavStack";
import {
  CHAT_EDGE_SWIPE_HIT_PX,
  isChatDismissSwipeDelta,
  isPointerInChatDismissStartZone,
} from "@/lib/edgeSwipeDismiss";
import { APP_COLUMN_MAX_PX } from "@/hooks/useSlideDismissBack";

export type ChatSwipeBackPhase = "start" | "move" | "end";

export type UseChatSwipeBackOptions = {
  enabled?: boolean;
  blocked?: boolean;
  onPull: (pullPx: number, phase: ChatSwipeBackPhase, velocityX?: number) => void;
  onDismiss: () => void;
  dismissCommitRef?: RefObject<boolean>;
  resetKey?: string | number;
};

function isInteractiveDismissTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-chat-back-btn], [data-profile-back-btn]")) return true;
  return !!target.closest(
    "button, a, input, select, textarea, label, [role='switch'], [role='button'], [data-no-dismiss-drag], [data-profile-scroll], [data-profile-menu-btn], [data-chat-privacy-menu-btn], [data-profile-menu], [data-chat-privacy-menu]",
  );
}

/** سحب رجوع — حافة يمين + هيدر + الجزء الأيمن من اللوحة (يمين → يسار) */
export function useChatSwipeBack({
  enabled = true,
  blocked = false,
  onPull,
  onDismiss,
  dismissCommitRef,
  resetKey = 0,
}: UseChatSwipeBackOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(
    typeof window !== "undefined" ? Math.min(window.innerWidth, APP_COLUMN_MAX_PX) : APP_COLUMN_MAX_PX,
  );
  const onPullRef = useRef(onPull);
  const onDismissRef = useRef(onDismiss);
  onPullRef.current = onPull;
  onDismissRef.current = onDismiss;

  const enabledRef = useRef(enabled);
  const blockedRef = useRef(blocked);
  enabledRef.current = enabled;
  blockedRef.current = blocked;

  const livePullRef = useRef(0);
  const maxPullRef = useRef(0);
  const velocityRef = useRef(0);
  const moveSampleRef = useRef({ x: 0, t: 0 });
  const dismissingRef = useRef(false);
  const gestureDoneRef = useRef<Set<number>>(new Set());
  const dragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    startPull: number;
  }>({ pointerId: null, startX: 0, startY: 0, startPull: 0 });
  const edgePendingRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const panelPendingRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  const pullRafRef = useRef(0);
  const pendingPullRef = useRef<{
    pull: number;
    phase: ChatSwipeBackPhase;
    velocityX?: number;
  } | null>(null);

  const flushPull = useCallback(
    (pull: number, phase: ChatSwipeBackPhase = "move", velocityX?: number) => {
      livePullRef.current = pull;
      maxPullRef.current = Math.max(maxPullRef.current, pull);
      if (phase === "move") {
        pendingPullRef.current = { pull, phase, velocityX };
        if (!pullRafRef.current) {
          pullRafRef.current = requestAnimationFrame(() => {
            pullRafRef.current = 0;
            const p = pendingPullRef.current;
            if (!p) return;
            onPullRef.current(p.pull, p.phase, p.velocityX);
          });
        }
        return;
      }
      if (pullRafRef.current) {
        cancelAnimationFrame(pullRafRef.current);
        pullRafRef.current = 0;
      }
      pendingPullRef.current = null;
      onPullRef.current(pull, phase, velocityX);
    },
    [],
  );

  const clearPending = useCallback(() => {
    edgePendingRef.current = null;
    panelPendingRef.current = null;
  }, []);

  const beginDrag = useCallback((pointerId: number, startX: number, startY: number) => {
    velocityRef.current = 0;
    maxPullRef.current = livePullRef.current;
    moveSampleRef.current = { x: startX, t: performance.now() };
    dragRef.current = {
      pointerId,
      startX,
      startY,
      startPull: livePullRef.current,
    };
    onPullRef.current(livePullRef.current, "start");
    try {
      containerRef.current?.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const finishDrag = useCallback(
    (pointerId: number) => {
      if (gestureDoneRef.current.has(pointerId)) return;
      const d = dragRef.current;
      if (d.pointerId === null || d.pointerId !== pointerId) return;
      gestureDoneRef.current.add(pointerId);
      window.setTimeout(() => gestureDoneRef.current.delete(pointerId), 800);

      dragRef.current = { pointerId: null, startX: 0, startY: 0, startPull: 0 };
      clearPending();

      if (dismissCommitRef?.current || dismissingRef.current) return;
      if (!enabledRef.current || blockedRef.current) {
        flushPull(0, "end", 0);
        maxPullRef.current = 0;
        return;
      }

      const w = widthRef.current;
      const pull = Math.max(livePullRef.current, maxPullRef.current);
      const vx = velocityRef.current;
      velocityRef.current = 0;
      let target = chatNavReleaseTarget(pull, w, vx);
      if (target === 0) {
        const threshold = w * 0.28;
        if (pull >= threshold * 0.78 || maxPullRef.current >= threshold * 0.78) {
          target = w;
        }
      }
      maxPullRef.current = 0;

      if (target > 0) {
        if (dismissingRef.current) return;
        dismissingRef.current = true;
        if (dismissCommitRef) dismissCommitRef.current = true;
        flushPull(pull, "end", vx);
        onDismissRef.current();
        window.setTimeout(() => {
          dismissingRef.current = false;
        }, CHAT_NAV_MS);
      } else {
        flushPull(0, "end", vx);
      }
    },
    [flushPull, dismissCommitRef, clearPending],
  );

  const onPointerMove = useCallback(
    (clientX: number, clientY: number, pointerId: number) => {
      if (!enabledRef.current || blockedRef.current) return;

      const edgePending = edgePendingRef.current;
      if (edgePending && edgePending.pointerId === pointerId && dragRef.current.pointerId == null) {
        const dx = clientX - edgePending.startX;
        const dy = clientY - edgePending.startY;
        if (!isChatNavBackSwipe(dx, dy)) return;
        edgePendingRef.current = null;
        beginDrag(pointerId, edgePending.startX, edgePending.startY);
      }

      const panelPending = panelPendingRef.current;
      if (panelPending && panelPending.pointerId === pointerId && dragRef.current.pointerId == null) {
        const dx = clientX - panelPending.startX;
        const dy = clientY - panelPending.startY;
        if (!isChatDismissSwipeDelta(dx, dy)) return;
        panelPendingRef.current = null;
        beginDrag(pointerId, panelPending.startX, panelPending.startY);
      }

      const d = dragRef.current;
      if (d.pointerId == null || d.pointerId !== pointerId) return;

      const dx = clientX - d.startX;
      const w = widthRef.current;
      const next = Math.max(0, Math.min(w, d.startPull - dx));

      const now = performance.now();
      const dt = now - moveSampleRef.current.t;
      if (dt > 0 && dt < 100) {
        velocityRef.current = (clientX - moveSampleRef.current.x) / dt;
      }
      moveSampleRef.current = { x: clientX, t: now };
      flushPull(next);
    },
    [beginDrag, flushPull],
  );

  const isChatDismissStart = useCallback((clientX: number, target: EventTarget | null) => {
    const root = containerRef.current;
    if (!root) return false;
    const rect = root.getBoundingClientRect();
    if (isPointerInChatDismissStartZone(clientX, rect, target, { edgePx: CHAT_NAV_EDGE_PX })) {
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    dismissingRef.current = false;
    livePullRef.current = 0;
    maxPullRef.current = 0;
    gestureDoneRef.current.clear();
    dragRef.current = { pointerId: null, startX: 0, startY: 0, startPull: 0 };
    clearPending();
  }, [resetKey, clearPending]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect().width;
      widthRef.current = chatNavWidth(Math.min(r || window.innerWidth, APP_COLUMN_MAX_PX));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return registerPointerBackLayer({
      getContainer: () => containerRef.current,
      dismissProfile: "chat",
      isActive: () => enabledRef.current && !blockedRef.current && !dismissingRef.current,
      onEdgePointerDown: (e: PointerEvent) => {
        edgePendingRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
      },
      onPointerMove: (e: PointerEvent) => {
        onPointerMove(e.clientX, e.clientY, e.pointerId);
      },
      onPointerUp: (e: PointerEvent) => {
        try {
          if (containerRef.current?.hasPointerCapture(e.pointerId)) {
            containerRef.current.releasePointerCapture(e.pointerId);
          }
        } catch {
          /* ignore */
        }
        if (edgePendingRef.current?.pointerId === e.pointerId) {
          edgePendingRef.current = null;
          return;
        }
        finishDrag(e.pointerId);
      },
    });
  }, [resetKey, enabled, onPointerMove, finishDrag]);

  const finishDragReact = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (panelPendingRef.current?.pointerId === e.pointerId) {
        clearPending();
        return;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      finishDrag(e.pointerId);
    },
    [finishDrag, clearPending],
  );

  const isScrollPaneTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest(".chat-scroll-pane, [data-scroll-pane]");
  }, []);

  const onPanelPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled || blocked || dismissingRef.current) {
        clearPending();
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (isScrollPaneTarget(e.target)) return;
      if (isInteractiveDismissTarget(e.target)) return;
      if (!isChatDismissStart(e.clientX, e.target)) return;
      const root = containerRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (isPointerInChatDismissStartZone(e.clientX, rect, e.target, { edgePx: CHAT_EDGE_SWIPE_HIT_PX })) {
        return;
      }
      panelPendingRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
    },
    [enabled, blocked, clearPending, isChatDismissStart, isScrollPaneTarget],
  );

  const onPanelPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (
        isScrollPaneTarget(e.target) &&
        dragRef.current.pointerId == null &&
        panelPendingRef.current == null
      ) {
        return;
      }
      onPointerMove(e.clientX, e.clientY, e.pointerId);
    },
    [onPointerMove, isScrollPaneTarget],
  );

  const onPanelPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (panelPendingRef.current?.pointerId === e.pointerId) {
        clearPending();
        return;
      }
      finishDragReact(e);
    },
    [finishDragReact, clearPending],
  );

  const onPanelPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (gestureDoneRef.current.has(e.pointerId)) return;
      clearPending();
      if (dragRef.current.pointerId === e.pointerId) {
        finishDrag(e.pointerId);
      }
    },
    [finishDrag, clearPending],
  );

  const isDragging = dragRef.current.pointerId != null;

  const edgeStripStyle: CSSProperties = {
    position: "absolute",
    left: "auto",
    right: 0,
    top: 0,
    bottom: 0,
    width: CHAT_EDGE_SWIPE_HIT_PX,
    minWidth: CHAT_EDGE_SWIPE_HIT_PX,
    maxWidth: CHAT_EDGE_SWIPE_HIT_PX,
    zIndex: 30,
    touchAction: "none",
  };

  const edgeStripProps = {
    role: "presentation" as const,
    "aria-hidden": true as const,
    className:
      "pointer-events-none touch-none select-none bg-transparent " +
      (!enabled || blocked ? "opacity-0" : ""),
    style: edgeStripStyle,
    "data-chat-nav-back-edge": true as const,
  };

  const panelSwipeProps = {
    onPointerDownCapture: onPanelPointerDown,
    onPointerMoveCapture: onPanelPointerMove,
    onPointerUpCapture: onPanelPointerUp,
    onPointerCancelCapture: onPanelPointerCancel,
    onLostPointerCapture: onPanelPointerCancel,
    style: {
      touchAction: (isDragging ? "none" : "pan-y pinch-zoom") as CSSProperties["touchAction"],
    },
  };

  return {
    containerRef,
    edgeStripProps,
    panelSwipeProps,
    requestDismiss: () => {
      if (!enabled || blocked || dismissingRef.current) return false;
      dismissingRef.current = true;
      if (dismissCommitRef) dismissCommitRef.current = true;
      flushPull(widthRef.current, "end", 0);
      onDismissRef.current();
      window.setTimeout(() => {
        dismissingRef.current = false;
      }, CHAT_NAV_MS);
      return true;
    },
  };
}
