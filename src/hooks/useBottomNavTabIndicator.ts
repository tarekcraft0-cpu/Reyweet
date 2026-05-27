import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** منحنى مشابه لـ Curves.easeOutCubic */
const PILL_EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const PILL_MS = 320;
const PILL_DIAMETER_PX = 44;
const DRAG_START_PX = 4;
const SUPPRESS_TAP_MS = 160;

type TabAnchor = { centerX: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function lerpAnchor(anchors: TabAnchor[], index: number): TabAnchor | null {
  if (anchors.length === 0) return null;
  const i = clamp(index, 0, anchors.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(anchors.length - 1, lo + 1);
  const t = i - lo;
  const a = anchors[lo]!;
  const b = anchors[hi]!;
  return { centerX: a.centerX + (b.centerX - a.centerX) * t };
}

export function useBottomNavTabIndicator(
  rowRef: RefObject<HTMLElement | null>,
  /** موضع دقيق (0..n-1) — يُحدَّث من MainTabPager أثناء السحب */
  progressIndex: number,
  tabCount: number,
  onSelectIndex: (index: number) => void,
  onDragProgress: (index: number) => void,
  shouldSuppressTap: () => boolean,
) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const anchorsRef = useRef<TabAnchor[]>([]);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    dragging: boolean;
  } | null>(null);
  const suppressUntilRef = useRef(0);

  const [pill, setPill] = useState({ left: 0, width: PILL_DIAMETER_PX });
  const [spring, setSpring] = useState(true);

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return false;
    const rowBox = row.getBoundingClientRect();
    const next: TabAnchor[] = [];
    for (let i = 0; i < tabCount; i++) {
      const btn = tabRefs.current[i];
      if (!btn) continue;
      const b = btn.getBoundingClientRect();
      next[i] = { centerX: b.left + b.width / 2 - rowBox.left };
    }
    if (next.length === tabCount) {
      anchorsRef.current = next;
      return true;
    }
    return false;
  }, [rowRef, tabCount]);

  const applyProgress = useCallback(
    (index: number, animate: boolean) => {
      if (!measure() && anchorsRef.current.length === 0) return;
      const anchor = lerpAnchor(anchorsRef.current, index);
      if (!anchor) return;
      setSpring(animate);
      setPill({
        left: anchor.centerX - PILL_DIAMETER_PX / 2,
        width: PILL_DIAMETER_PX,
      });
    },
    [measure],
  );

  useLayoutEffect(() => {
    const run = () => {
      if (measure()) applyProgress(progressIndex, true);
    };
    run();
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
  }, [progressIndex, measure, applyProgress, tabCount]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => {
      measure();
      applyProgress(progressIndex, false);
    });
    ro.observe(row);
    for (const btn of tabRefs.current) {
      if (btn) ro.observe(btn);
    }
    return () => ro.disconnect();
  }, [rowRef, measure, applyProgress, progressIndex, tabCount]);

  const progressFromClientX = useCallback(
    (clientX: number) => {
      const row = rowRef.current;
      const anchors = anchorsRef.current;
      if (!row || anchors.length < 2) return 0;
      const x = clientX - row.getBoundingClientRect().left;
      if (x <= anchors[0]!.centerX) return 0;
      const last = anchors.length - 1;
      if (x >= anchors[last]!.centerX) return last;
      for (let i = 0; i < last; i++) {
        const a = anchors[i]!;
        const b = anchors[i + 1]!;
        if (x >= a.centerX && x <= b.centerX) {
          const t = (x - a.centerX) / (b.centerX - a.centerX);
          return i + t;
        }
      }
      return progressIndex;
    },
    [rowRef, progressIndex],
  );

  const onRowPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      measure();
      setSpring(false);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        dragging: false,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [measure],
  );

  const onRowPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      if (!d.dragging && Math.abs(dx) < DRAG_START_PX) return;
      d.dragging = true;
      suppressUntilRef.current = Date.now() + SUPPRESS_TAP_MS;
      const p = progressFromClientX(e.clientX);
      applyProgress(p, false);
      onDragProgress(p);
    },
    [progressFromClientX, applyProgress, onDragProgress],
  );

  const finishRowPointer = useCallback(
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

      if (d.dragging) {
        const p = progressFromClientX(e.clientX);
        const target = Math.round(clamp(p, 0, tabCount - 1));
        applyProgress(target, true);
        onSelectIndex(target);
        return;
      }
      applyProgress(progressIndex, true);
    },
    [progressFromClientX, applyProgress, onSelectIndex, progressIndex, tabCount],
  );

  const registerTabButtonRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    tabRefs.current[index] = el;
  }, []);

  const pillStyle: CSSProperties = {
    transform: `translate3d(${pill.left}px, 0, 0)`,
    width: pill.width,
    height: PILL_DIAMETER_PX,
    transition: spring
      ? `transform ${PILL_MS}ms ${PILL_EASING}, width ${PILL_MS}ms ${PILL_EASING}`
      : "none",
    willChange: spring ? "auto" : "transform",
  };

  const rowDragHandlers = {
    onPointerDown: onRowPointerDown,
    onPointerMove: onRowPointerMove,
    onPointerUp: finishRowPointer,
    onPointerCancel: finishRowPointer,
  };

  const shouldSuppressNavTap = useCallback(
    () => shouldSuppressTap() || Date.now() < suppressUntilRef.current,
    [shouldSuppressTap],
  );

  return {
    registerTabButtonRef,
    pillStyle,
    rowDragHandlers,
    shouldSuppressNavTap,
  };
}
