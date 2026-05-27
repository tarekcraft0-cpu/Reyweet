import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import { BOTTOM_NAV_INDICATOR_WIDTH } from "@/lib/bottomNavConfig";

const EASE = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const TAP_MS = 260;

function isDragProgress(index: number) {
  return Math.abs(index - Math.round(index)) > 0.02;
}

type Anchor = { centerX: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function lerpX(anchors: Anchor[], index: number): number {
  if (anchors.length === 0) return 0;
  const i = clamp(index, 0, anchors.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(anchors.length - 1, lo + 1);
  const t = i - lo;
  const a = anchors[lo]!;
  const b = anchors[hi]!;
  return a.centerX + (b.centerX - a.centerX) * t;
}

/**
 * مؤشر التبويب — تحريك عبر DOM (بدون setState) لمنع الوميض والتأخير.
 */
export function useNavIndicatorMotion(
  rowRef: RefObject<HTMLElement | null>,
  pillRef: RefObject<HTMLDivElement | null>,
  progressIndex: number,
  tabCount: number,
  /** يمنع ResizeObserver من إعادة المؤشر للتبويب أثناء سحب الإصبع (مشكلة شائعة على iOS) */
  isDraggingRef?: RefObject<boolean>,
) {
  const anchorsRef = useRef<Anchor[]>([]);
  const animatingRef = useRef(false);
  const progressRef = useRef(progressIndex);

  progressRef.current = progressIndex;

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return false;
    const box = row.getBoundingClientRect();
    const next: Anchor[] = [];
    for (let i = 0; i < tabCount; i++) {
      const btn = row.querySelector<HTMLButtonElement>(
        `[data-nav-tab-btn][data-nav-tab-index="${i}"]`,
      );
      if (!btn) continue;
      const b = btn.getBoundingClientRect();
      next[i] = { centerX: b.left + b.width / 2 - box.left };
    }
    if (next.length !== tabCount) return false;
    anchorsRef.current = next;
    return true;
  }, [rowRef, tabCount]);

  const applyX = useCallback(
    (index: number, animate: boolean) => {
      const pill = pillRef.current;
      if (!pill) return;
      if (!measure() && anchorsRef.current.length === 0) return;
      const x = lerpX(anchorsRef.current, index) - BOTTOM_NAV_INDICATOR_WIDTH / 2;
      pill.style.transition = animate
        ? `transform ${TAP_MS}ms ${EASE}, opacity 160ms ease`
        : "none";
      pill.style.transform = `translate3d(${x}px, -50%, 0)`;
      pill.style.opacity = "1";
      animatingRef.current = animate;
    },
    [measure, pillRef],
  );

  useLayoutEffect(() => {
    if (isDraggingRef?.current) return;
    applyX(progressIndex, !isDragProgress(progressIndex));
  }, [progressIndex, applyX, isDraggingRef]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => {
      measure();
      if (isDraggingRef?.current) return;
      applyX(progressRef.current, false);
    });
    ro.observe(row);
    row.querySelectorAll("[data-nav-tab-btn]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [rowRef, measure, applyX]);

  const applyDragX = useCallback(
    (index: number) => {
      const pill = pillRef.current;
      if (!pill) return;
      if (!measure() && anchorsRef.current.length === 0) return;
      const x = lerpX(anchorsRef.current, index) - BOTTOM_NAV_INDICATOR_WIDTH / 2;
      pill.style.transition = "none";
      pill.style.transform = `translate3d(${x}px, -50%, 0)`;
      pill.style.opacity = "1";
    },
    [measure, pillRef],
  );

  const progressFromClientX = useCallback(
    (clientX: number) => {
      const row = rowRef.current;
      const anchors = anchorsRef.current;
      if (!row || anchors.length < 2) return progressRef.current;
      const x = clientX - row.getBoundingClientRect().left;
      if (x <= anchors[0]!.centerX) return 0;
      const last = anchors.length - 1;
      if (x >= anchors[last]!.centerX) return last;
      for (let i = 0; i < last; i++) {
        const a = anchors[i]!;
        const b = anchors[i + 1]!;
        if (x >= a.centerX && x <= b.centerX) {
          return i + (x - a.centerX) / (b.centerX - a.centerX);
        }
      }
      return progressRef.current;
    },
    [rowRef],
  );

  return { applyX, applyDragX, progressFromClientX, measure };
}
