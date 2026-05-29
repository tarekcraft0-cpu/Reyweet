import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TabActiveContext } from "@/lib/tabActiveContext";
import { PAGER_TAB_CHAIN, type PagerTab } from "./MainTabPager";

const TAB_AXIS_LOCK_PX = 10;
const TAB_HORIZONTAL_RATIO = 1.4;
const TAB_VERTICAL_RATIO = 1.08;
const TAB_HORIZONTAL_MIN_PX = 14;
const SNAP_RATIO = 0.22;
const VELOCITY_SNAP = 0.35;
const TAB_TRANSITION_MS = 260;
const TAB_EASE = "cubic-bezier(0.215, 0.61, 0.355, 1)";

function tabIndex(tab: PagerTab): number {
  return PAGER_TAB_CHAIN.indexOf(tab);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function indexToTab(i: number): PagerTab {
  return PAGER_TAB_CHAIN[clamp(Math.round(i), 0, TAB_COUNT - 1)]!;
}

const KeepAlivePanel = memo(function KeepAlivePanel({
  tabId,
  displayIndex,
  settledIndex,
  dragIndex,
  animate,
  visited,
  children,
}: {
  tabId: PagerTab;
  displayIndex: number;
  settledIndex: number;
  dragIndex: number | null;
  animate: boolean;
  visited: boolean;
  children: ReactNode;
}) {
  const i = tabIndex(tabId);
  if (!visited) return null;

  const offset = (i - displayIndex) * 100;
  const isSettled = i === settledIndex;
  const isDragging = dragIndex != null;
  const near = Math.abs(i - displayIndex) < 1.01;
  /** عند التوقف: تبويب واحد فقط — يمنع ظهور ريلز الأسود خلف الرئيسية/البحث */
  const showPanel = isDragging ? near : isSettled;

  return (
    <div
      className={
        "absolute inset-0 flex min-h-0 flex-col " +
        (tabId === "reels" ? "bg-black " : "bg-background ") +
        (animate ? "will-change-transform" : "")
      }
      style={{
        transform: `translate3d(${offset}%, 0, 0)`,
        transition:
          animate && isSettled
            ? `transform ${TAB_TRANSITION_MS}ms ${TAB_EASE}`
            : "none",
        visibility: showPanel ? "visible" : "hidden",
        pointerEvents: isSettled && !isDragging ? "auto" : "none",
        zIndex: isSettled ? 10 : isDragging && near ? 5 : 0,
      }}
      aria-hidden={!isSettled}
    >
      {children}
    </div>
  );
});

/**
 * IndexedStack + keep-alive: التبويبات لا تُدمَّر عند التبديل.
 * السحب والانتقال محليان — لا setState في App أثناء تحريك المؤشر.
 */
export function MainTabStack({
  activeTab,
  onTabChange,
  swipeEnabled,
  panels,
}: {
  activeTab: PagerTab;
  onTabChange: (tab: PagerTab) => void;
  swipeEnabled: boolean;
  panels: Record<PagerTab, ReactNode>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(activeTab);
  const onTabRef = useRef(onTabChange);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startIndex: number;
    lastX: number;
    lastT: number;
    velocity: number;
    axis: "x" | "y" | null;
  } | null>(null);

  const [visited, setVisited] = useState<Set<PagerTab>>(() => new Set([activeTab]));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);

  activeRef.current = activeTab;
  onTabRef.current = onTabChange;

  const settledIndex = tabIndex(activeTab);

  useLayoutEffect(() => {
    setVisited(prev => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    dragRef.current = null;
    setDragIndex(null);
    setAnimating(false);
  }, [activeTab]);

  const displayIndex =
    dragIndex != null ? clamp(dragIndex, 0, TAB_COUNT - 1) : settledIndex;

  const markNeighborVisited = useCallback((index: number) => {
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    setVisited(prev => {
      const next = new Set(prev);
      next.add(indexToTab(lo));
      if (hi !== lo) next.add(indexToTab(hi));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const snapToIndex = useCallback((i: number, animate: boolean) => {
    const clamped = clamp(Math.round(i), 0, TAB_COUNT - 1);
    const next = PAGER_TAB_CHAIN[clamped]!;
    setDragIndex(null);
    setAnimating(animate);
    markNeighborVisited(clamped);
    if (next !== activeRef.current) onTabRef.current(next);
    if (animate) {
      window.setTimeout(() => setAnimating(false), TAB_TRANSITION_MS + 40);
    }
  }, [markNeighborVisited]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!swipeEnabled || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-no-tab-swipe]")) return;
      const startIdx = tabIndex(activeRef.current);
      markNeighborVisited(startIdx);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startIndex: startIdx,
        lastX: e.clientX,
        lastT: performance.now(),
        velocity: 0,
        axis: null,
      };
      setAnimating(false);
    },
    [swipeEnabled, markNeighborVisited],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const adx = Math.abs(e.clientX - d.startX);
      const ady = Math.abs(e.clientY - d.startY);
      if (!d.axis) {
        if (adx < TAB_AXIS_LOCK_PX && ady < TAB_AXIS_LOCK_PX) return;
        if (ady > adx * TAB_VERTICAL_RATIO) {
          dragRef.current = null;
          setDragIndex(null);
          return;
        }
        if (adx >= TAB_HORIZONTAL_MIN_PX && adx > ady * TAB_HORIZONTAL_RATIO) {
          d.axis = "x";
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          setDragIndex(d.startIndex);
        } else return;
      }
      if (d.axis !== "x") return;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      d.velocity = (e.clientX - d.lastX) / dt;
      d.lastX = e.clientX;
      d.lastT = now;
      const w = containerRef.current?.clientWidth ?? 1;
      const delta = (e.clientX - d.startX) / w;
      const next = clamp(d.startIndex - delta, 0, TAB_COUNT - 1);
      markNeighborVisited(next);
      setDragIndex(next);
    },
    [markNeighborVisited],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      const idx = dragIndex ?? settledIndex;
      setDragIndex(null);
      let target = Math.round(idx);
      if (Math.abs(d.velocity) > VELOCITY_SNAP) {
        target = tabIndex(activeRef.current) + (d.velocity > 0 ? -1 : 1);
      } else {
        const base = tabIndex(activeRef.current);
        const pulled = idx - base;
        if (pulled > SNAP_RATIO) target = base + 1;
        else if (pulled < -SNAP_RATIO) target = base - 1;
        else target = base;
      }
      snapToIndex(target, true);
    },
    [dragIndex, settledIndex, snapToIndex],
  );

  return (
    <TabActiveContext.Provider value={activeTab}>
      <div
        ref={containerRef}
        className="relative min-h-0 h-full w-full flex-1 overflow-hidden touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
          setDragIndex(null);
        }}
      >
        {PAGER_TAB_CHAIN.map(id => (
          <KeepAlivePanel
            key={id}
            tabId={id}
            displayIndex={displayIndex}
            settledIndex={settledIndex}
            dragIndex={dragIndex}
            animate={animating && dragIndex == null}
            visited={visited.has(id) || id === "home"}
          >
            {panels[id]}
          </KeepAlivePanel>
        ))}
      </div>
    </TabActiveContext.Provider>
  );
}
