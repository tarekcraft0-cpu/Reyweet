import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { clampOffsetX, measureAppDragBounds, type AppDragBounds } from "@/lib/appDragBounds";

const DRAG_START_PX = 8;
const TAP_SLOP_PX = 14;
const SPRING_MS = 280;
const EASING = "cubic-bezier(0.25, 1, 0.35, 1)";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function useCompactFabDrag(
  onExpand: () => void,
  shellRef: RefObject<HTMLElement | null>,
  fabRef: RefObject<HTMLElement | null>,
) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    mode: "pending" | "dragging";
    bounds: AppDragBounds | null;
  } | null>(null);
  const boundsRef = useRef<AppDragBounds | null>(null);
  const suppressClickRef = useRef(false);

  const [offsetX, setOffsetX] = useState(0);
  const [spring, setSpring] = useState(false);

  const snapBack = useCallback(() => {
    setSpring(true);
    setOffsetX(0);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    suppressClickRef.current = false;
    setSpring(false);
    const bounds = measureAppDragBounds(shellRef.current, fabRef.current);
    boundsRef.current = bounds;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      mode: "pending",
      bounds,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [shellRef, fabRef]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.mode === "pending") {
      if (Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return;
      d.mode = "dragging";
      suppressClickRef.current = true;
    }

    const resistedRight = dx > 0 ? dx * 0.2 : dx;
    setOffsetX(clampOffsetX(resistedRight, d.bounds));
  }, []);

  const onPointerUp = useCallback(
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

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      snapBack();

      const isTap =
        Math.abs(dx) < TAP_SLOP_PX &&
        Math.abs(dy) < TAP_SLOP_PX &&
        !suppressClickRef.current;
      if (isTap) {
        suppressClickRef.current = true;
        onExpand();
      }
    },
    [onExpand, snapBack],
  );

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    snapBack();
  }, [snapBack]);

  const onClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onExpand();
  }, [onExpand]);

  const maxLeft = Math.max(-(boundsRef.current?.minOffsetX ?? 0), 40);
  const maxRight = Math.max(boundsRef.current?.maxOffsetX ?? 40, 40);
  const dragProgress =
    offsetX < 0
      ? clamp(-offsetX / maxLeft, 0, 1)
      : clamp(offsetX / maxRight, 0, 1) * 0.35;
  const scale = 1 - dragProgress * 0.18;

  const fabStyle: CSSProperties = {
    transform: `translate3d(${offsetX}px, 0, 0) scale(${scale})`,
    transformOrigin: "0% 100%",
    opacity: 1 - dragProgress * 0.25,
    transition: spring
      ? `transform ${SPRING_MS}ms ${EASING}, opacity ${SPRING_MS}ms ${EASING}`
      : "none",
    willChange: "transform, opacity",
    touchAction: "manipulation",
  };

  return {
    fabStyle,
    onFabClick: onClick,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
