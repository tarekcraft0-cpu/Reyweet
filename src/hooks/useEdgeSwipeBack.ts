import { useEffect, useRef } from "react";

const EDGE_PX = 28;
const TRIGGER_PX = 72;

/** سحب من الحافة اليسرى للرجوع خطوة واحدة (مثل إنستغرام) */
export function useEdgeSwipeBack(enabled: boolean, onBack: () => void) {
  const pullRef = useRef<{ x0: number; pointerId: number; active: boolean } | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const narrowViewport = window.matchMedia("(max-width: 900px)").matches;
    if (!coarsePointer && !narrowViewport) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.clientX > EDGE_PX) return;
      pullRef.current = { x0: e.clientX, pointerId: e.pointerId, active: true };
    };

    const onMove = (e: PointerEvent) => {
      const p = pullRef.current;
      if (!p?.active || e.pointerId !== p.pointerId) return;
      if (e.clientX - p.x0 > TRIGGER_PX) {
        pullRef.current = null;
        onBackRef.current();
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = pullRef.current;
      if (!p?.active || e.pointerId !== p.pointerId) return;
      pullRef.current = null;
      if (e.clientX - p.x0 > TRIGGER_PX * 0.55) onBackRef.current();
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [enabled]);
}
