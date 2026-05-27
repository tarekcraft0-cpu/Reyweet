import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const PAGER_TAB_CHAIN = ["home", "search", "reels", "chat", "profile"] as const;
export type PagerTab = (typeof PAGER_TAB_CHAIN)[number];

const TAB_COUNT = PAGER_TAB_CHAIN.length;
const SNAP_RATIO = 0.22;
const VELOCITY_SNAP = 0.35;

function tabIndex(tab: PagerTab): number {
  return PAGER_TAB_CHAIN.indexOf(tab);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * تنقل أفقي تفاعلي مع احتياطي: قبل قياس العرض نعرض التبويب النشط فقط (يمنع الشاشة البيضاء).
 */
export function MainTabPager({
  activeTab,
  onTabChange,
  enabled,
  onProgress,
  /** سحب الشريط السفلي — يحرّك الصفحات فوراً */
  externalProgressIndex = null,
  panels,
}: {
  activeTab: PagerTab;
  onTabChange: (tab: PagerTab) => void;
  enabled: boolean;
  onProgress?: (index: number) => void;
  externalProgressIndex?: number | null;
  panels: Record<PagerTab, ReactNode>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const activeRef = useRef(activeTab);
  const onTabRef = useRef(onTabChange);
  const onProgressRef = useRef(onProgress);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTranslate: number;
    lastX: number;
    lastT: number;
    velocity: number;
    axis: "x" | "y" | null;
  } | null>(null);

  const [viewportW, setViewportW] = useState(0);
  const [dragTranslate, setDragTranslate] = useState<number | null>(null);
  const [spring, setSpring] = useState(true);

  activeRef.current = activeTab;
  onTabRef.current = onTabChange;
  onProgressRef.current = onProgress;

  const index = tabIndex(activeTab);
  const w = widthRef.current || viewportW || 0;
  const settledX = w > 0 ? -index * w : 0;
  const externalX =
    externalProgressIndex != null && w > 0
      ? -clamp(externalProgressIndex, 0, TAB_COUNT - 1) * w
      : null;
  const translateX = dragTranslate ?? externalX ?? settledX;

  const measure = useCallback(() => {
    const el = containerRef.current;
    const next = el?.clientWidth ?? 0;
    if (next > 0) {
      widthRef.current = next;
      setViewportW(next);
    }
    return widthRef.current;
  }, []);

  const snapToIndex = useCallback((i: number, animate: boolean) => {
    const clamped = clamp(i, 0, TAB_COUNT - 1);
    setDragTranslate(null);
    setSpring(animate);
    onProgressRef.current?.(clamped);
    const next = PAGER_TAB_CHAIN[clamped]!;
    if (next !== activeRef.current) onTabRef.current(next);
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      measure();
      setDragTranslate(null);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useLayoutEffect(() => {
    if (externalProgressIndex != null) return;
    measure();
    setDragTranslate(null);
    setSpring(true);
    onProgressRef.current?.(index);
  }, [activeTab, index, measure, externalProgressIndex]);

  useLayoutEffect(() => {
    if (externalProgressIndex == null || w <= 0) return;
    setSpring(false);
    onProgressRef.current?.(clamp(externalProgressIndex, 0, TAB_COUNT - 1));
  }, [externalProgressIndex, w]);

  const reportProgress = useCallback((tx: number) => {
    const width = widthRef.current || 1;
    onProgressRef.current?.(clamp(-tx / width, 0, TAB_COUNT - 1));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || w <= 0 || e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-no-tab-swipe]")) return;
      const width = widthRef.current;
      const startTx = -tabIndex(activeRef.current) * width;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTranslate: startTx,
        lastX: e.clientX,
        lastT: performance.now(),
        velocity: 0,
        axis: null,
      };
      setDragTranslate(startTx);
      setSpring(false);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [enabled, w],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const adx = Math.abs(e.clientX - d.startX);
      const ady = Math.abs(e.clientY - d.startY);
      if (!d.axis) {
        if (adx < 8 && ady < 8) return;
        if (ady > adx * 1.15) {
          dragRef.current = null;
          setDragTranslate(null);
          return;
        }
        if (adx > ady * 1.05) d.axis = "x";
        else return;
      }
      if (d.axis !== "x") return;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      d.velocity = (e.clientX - d.lastX) / dt;
      d.lastX = e.clientX;
      d.lastT = now;
      const width = widthRef.current || 1;
      const minTx = -(TAB_COUNT - 1) * width;
      const next = clamp(d.startTranslate + (e.clientX - d.startX), minTx, 0);
      setDragTranslate(next);
      reportProgress(next);
    },
    [reportProgress],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const width = widthRef.current || 1;
      const tx = dragTranslate ?? settledX;
      const fractional = -tx / width;
      const base = tabIndex(activeRef.current);
      let target = Math.round(fractional);
      if (Math.abs(d.velocity) > VELOCITY_SNAP) {
        target = base + (d.velocity > 0 ? -1 : 1);
      } else {
        const pulled = fractional - base;
        if (pulled > SNAP_RATIO) target = base + 1;
        else if (pulled < -SNAP_RATIO) target = base - 1;
        else target = base;
      }
      snapToIndex(target, true);
    },
    [dragTranslate, settledX, snapToIndex],
  );

  if (w <= 0) {
    return (
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain">
          {panels[activeTab]}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="flex h-full touch-pan-y"
        style={{
          width: w * TAB_COUNT,
          transform: `translate3d(${Number.isFinite(translateX) ? translateX : settledX}px, 0, 0)`,
          transition:
            spring && dragTranslate === null
              ? "transform 0.32s cubic-bezier(0.25, 1, 0.35, 1)"
              : "none",
          willChange: "transform",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {PAGER_TAB_CHAIN.map((id) => (
          <div
            key={id}
            className="h-full shrink-0 overflow-x-hidden overflow-y-auto overscroll-y-contain"
            style={{ width: w }}
          >
            <div className="flex min-h-0 flex-1 flex-col">{panels[id]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
