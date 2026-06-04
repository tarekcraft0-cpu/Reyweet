import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const PULL_MAX_PX = 88;
const PULL_TRIGGER_PX = 52;

export function useHomePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
  enabled: boolean,
) {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullPxRef = useRef(0);
  const touchRef = useRef({ y0: 0, pulling: false });
  const busyRef = useRef(false);

  const runRefresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      busyRef.current = false;
      setRefreshing(false);
      setPullPx(0);
      pullPxRef.current = 0;
    }
  }, [onRefresh]);

  useEffect(() => {
    pullPxRef.current = pullPx;
  }, [pullPx]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || !enabled) return;

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || el.scrollTop > 1) return;
      touchRef.current = { y0: e.touches[0]?.clientY ?? 0, pulling: true };
    };

    const onMove = (e: TouchEvent) => {
      if (!touchRef.current.pulling || busyRef.current) return;
      if (el.scrollTop > 1) {
        touchRef.current.pulling = false;
        setPullPx(0);
        pullPxRef.current = 0;
        return;
      }
      const y = e.touches[0]?.clientY ?? touchRef.current.y0;
      const dy = y - touchRef.current.y0;
      if (dy > 0) {
        const next = Math.min(dy * 0.45, PULL_MAX_PX);
        setPullPx(next);
        pullPxRef.current = next;
      } else {
        setPullPx(0);
        pullPxRef.current = 0;
      }
    };

    const onEnd = () => {
      if (!touchRef.current.pulling) return;
      touchRef.current.pulling = false;
      const px = pullPxRef.current;
      if (px >= PULL_TRIGGER_PX) {
        setPullPx(PULL_MAX_PX * 0.65);
        pullPxRef.current = PULL_MAX_PX * 0.65;
        void runRefresh();
        return;
      }
      setPullPx(0);
      pullPxRef.current = 0;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollRef, enabled, runRefresh]);

  return { pullPx, refreshing, runRefresh };
}
