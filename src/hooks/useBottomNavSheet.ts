import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const NAV_HIDE_PROGRESS_CSS_VAR = "--retweet-nav-hide-progress";

const NAV_SNAP_RATIO = 0.38;
const NAV_SPRING_MS = 320;
const NAV_EASING = "cubic-bezier(0.25, 1, 0.35, 1)";
const DEFAULT_TRAVEL_PX = 112;
const DRAG_START_PX = 10;

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  lastY: number;
  lastT: number;
  mode: "pending" | "dragging";
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function useBottomNavSheet(initialHidden: boolean, onPersistHidden: (hidden: boolean) => void) {
  const navRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef(DEFAULT_TRAVEL_PX);
  const dragRef = useRef<DragSession | null>(null);
  const offsetRef = useRef(initialHidden ? DEFAULT_TRAVEL_PX : 0);
  const suppressTapUntilRef = useRef(0);

  const [offsetY, setOffsetY] = useState(() => (initialHidden ? DEFAULT_TRAVEL_PX : 0));
  const [spring, setSpring] = useState(false);

  offsetRef.current = offsetY;

  const shouldSuppressTap = useCallback(() => Date.now() < suppressTapUntilRef.current, []);

  const measureTravel = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    if (h > 0) travelRef.current = h;
  }, []);

  useLayoutEffect(() => {
    measureTravel();
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const prevTravel = travelRef.current;
      measureTravel();
      const travel = travelRef.current;
      if (initialHidden && offsetRef.current >= prevTravel * 0.85) {
        setOffsetY(travel);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initialHidden, measureTravel]);

  useLayoutEffect(() => {
    const travel = travelRef.current;
    const p = travel > 0 ? clamp(offsetY / travel, 0, 1) : 0;
    document.documentElement.style.setProperty(NAV_HIDE_PROGRESS_CSS_VAR, String(p));
  }, [offsetY]);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty(NAV_HIDE_PROGRESS_CSS_VAR);
    };
  }, []);

  const snapTo = useCallback(
    (target: number) => {
      const travel = travelRef.current;
      const clamped = clamp(target, 0, travel);
      setSpring(true);
      setOffsetY(clamped);
      onPersistHidden(clamped >= travel * NAV_SNAP_RATIO);
    },
    [onPersistHidden],
  );

  const showNav = useCallback(() => snapTo(0), [snapTo]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button,a,[role='button']")) return;
    setSpring(false);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: offsetRef.current,
      lastY: e.clientY,
      lastT: e.timeStamp,
      mode: "pending",
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;

    const dy = e.clientY - d.startY;
    const dx = e.clientX - d.startX;

    if (d.mode === "pending") {
      if (Math.abs(dy) < DRAG_START_PX && Math.abs(dx) < DRAG_START_PX) return;
      if (Math.abs(dy) <= Math.abs(dx)) {
        dragRef.current = null;
        return;
      }
      d.mode = "dragging";
      suppressTapUntilRef.current = Date.now() + 450;
    }

    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const travel = travelRef.current;
    const next = clamp(d.startOffset + dy, 0, travel);
    setOffsetY(next);
  }, []);

  const finishDrag = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      if (!d || e.pointerId !== d.pointerId) return;

      if (d.mode === "pending") {
        const travel = travelRef.current;
        if (offsetRef.current >= travel * NAV_SNAP_RATIO) showNav();
        return;
      }

      const travel = travelRef.current;
      const dy = e.clientY - d.startY;
      const current = clamp(d.startOffset + dy, 0, travel);
      const dt = Math.max(1, e.timeStamp - d.lastT);
      const vy = (e.clientY - d.lastY) / dt;

      let target = 0;
      if (vy > 0.55) target = travel;
      else if (vy < -0.55) target = 0;
      else if (current >= travel * NAV_SNAP_RATIO) target = travel;
      else target = 0;

      snapTo(target);
    },
    [showNav, snapTo],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      finishDrag(e);
    },
    [finishDrag],
  );

  const onPointerCancel = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.mode === "dragging") {
      snapTo(offsetRef.current >= travelRef.current * NAV_SNAP_RATIO ? travelRef.current : 0);
    }
  }, [snapTo]);

  const travel = travelRef.current;
  const hideProgress = travel > 0 ? clamp(offsetY / travel, 0, 1) : 0;
  const isMostlyHidden = hideProgress >= NAV_SNAP_RATIO;

  const navStyle: CSSProperties = {
    transform: `translate3d(0, ${offsetY}px, 0)`,
    transition: spring ? `transform ${NAV_SPRING_MS}ms ${NAV_EASING}` : "none",
    willChange: "transform",
  };

  return {
    navRef,
    navStyle,
    hideProgress,
    isMostlyHidden,
    shouldSuppressTap,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    showNav,
  };
}
