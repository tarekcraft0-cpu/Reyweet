import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { useNavIndicatorMotion } from "@/hooks/useNavIndicatorMotion";
import {
  BOTTOM_NAV_INDICATOR_HEIGHT,
  BOTTOM_NAV_INDICATOR_WIDTH,
} from "@/lib/bottomNavConfig";

const SUPPRESS_TAP_MS = 160;
const DRAG_START_PX = 3;

type Props = {
  progressIndex: number;
  tabCount: number;
  onSelectIndex: (index: number) => void;
  shouldSuppressTap: () => boolean;
  onSuppressTapChange?: (fn: () => boolean) => void;
  children: ReactNode;
};

export function BottomNavTabRow({
  progressIndex,
  tabCount,
  onSelectIndex,
  shouldSuppressTap,
  onSuppressTapChange,
  children,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; startX: number; dragging: boolean } | null>(
    null,
  );
  const suppressUntilRef = useRef(0);
  const windowDragCleanupRef = useRef<(() => void) | null>(null);

  const { applyDragX, progressFromClientX, measure } = useNavIndicatorMotion(
    rowRef,
    pillRef,
    progressIndex,
    tabCount,
    isDraggingRef,
  );

  const clearWindowDragListeners = useCallback(() => {
    windowDragCleanupRef.current?.();
    windowDragCleanupRef.current = null;
  }, []);

  useEffect(() => {
    const resetDrag = () => {
      dragRef.current = null;
      isDraggingRef.current = false;
      clearWindowDragListeners();
    };
    window.addEventListener("blur", resetDrag);
    document.addEventListener("visibilitychange", resetDrag);
    return () => {
      window.removeEventListener("blur", resetDrag);
      document.removeEventListener("visibilitychange", resetDrag);
      clearWindowDragListeners();
    };
  }, [clearWindowDragListeners]);

  const shouldSuppressNavTap = useCallback(
    () => shouldSuppressTap() || Date.now() < suppressUntilRef.current,
    [shouldSuppressTap],
  );

  useEffect(() => {
    onSuppressTapChange?.(shouldSuppressNavTap);
  }, [onSuppressTapChange, shouldSuppressNavTap]);

  const items = Children.toArray(children);

  const finishDragSession = useCallback(
    (clientX: number, pointerId: number, targetEl: HTMLElement | null) => {
      const d = dragRef.current;
      dragRef.current = null;
      isDraggingRef.current = false;
      clearWindowDragListeners();
      if (!d || d.pointerId !== pointerId) return;
      if (d.dragging) {
        onSelectIndex(Math.round(progressFromClientX(clientX)));
        return;
      }
      if (!targetEl) return;
      const btn = targetEl.closest<HTMLButtonElement>("[data-nav-tab-btn]");
      if (btn) {
        const idx = Number(btn.getAttribute("data-nav-tab-index"));
        if (!Number.isNaN(idx)) onSelectIndex(idx);
      }
    },
    [clearWindowDragListeners, onSelectIndex, progressFromClientX],
  );

  const handlePointerMove = useCallback(
    (clientX: number, pointerId: number, captureTarget: HTMLElement | null) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== pointerId) return;
      const dx = clientX - d.startX;
      if (!d.dragging && Math.abs(dx) < DRAG_START_PX) return;
      if (!d.dragging) {
        d.dragging = true;
        isDraggingRef.current = true;
        suppressUntilRef.current = Date.now() + SUPPRESS_TAP_MS;
        if (captureTarget) {
          try {
            captureTarget.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
        }
      }
      applyDragX(progressFromClientX(clientX));
    },
    [applyDragX, progressFromClientX],
  );

  const attachWindowDragListeners = useCallback(
    (rowEl: HTMLElement) => {
      clearWindowDragListeners();
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerType === "mouse" && ev.buttons === 0) return;
        handlePointerMove(ev.clientX, ev.pointerId, rowEl);
      };
      const onEnd = (ev: PointerEvent) => {
        try {
          if (rowEl.hasPointerCapture?.(ev.pointerId)) {
            rowEl.releasePointerCapture(ev.pointerId);
          }
        } catch {
          /* ignore */
        }
        finishDragSession(ev.clientX, ev.pointerId, ev.target as HTMLElement);
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      windowDragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };
    },
    [clearWindowDragListeners, finishDragSession, handlePointerMove],
  );

  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    measure();
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, dragging: false };
    isDraggingRef.current = false;
    attachWindowDragListeners(e.currentTarget);
    if (e.pointerType === "touch") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const onRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerMove(e.clientX, e.pointerId, e.currentTarget);
    if (isDraggingRef.current) e.preventDefault();
  };

  const finishRowPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    finishDragSession(e.clientX, e.pointerId, e.target as HTMLElement);
  };

  return (
    <div
      ref={rowRef}
      data-no-tab-swipe
      className="relative z-20 flex h-14 min-w-0 w-full touch-none flex-row items-center justify-around px-1 select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onRowPointerDown}
      onPointerMove={onRowPointerMove}
      onPointerUp={finishRowPointer}
      onPointerCancel={finishRowPointer}
    >
      <div
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute top-1/2 z-0 rounded-[12px] bg-white/[0.16]"
        style={{
          width: BOTTOM_NAV_INDICATOR_WIDTH,
          height: BOTTOM_NAV_INDICATOR_HEIGHT,
          left: 0,
          opacity: 1,
          willChange: "transform",
        }}
      />
      {items.map((child, index) => {
        if (!isValidElement(child)) {
          return (
            <div key={index} className="relative z-10 flex flex-1 justify-center">
              {child}
            </div>
          );
        }
        const el = child as ReactElement<{
          tabIndex?: number;
          buttonRef?: (node: HTMLButtonElement | null) => void;
        }>;
        return cloneElement(el, {
          tabIndex: index,
          buttonRef: (node: HTMLButtonElement | null) => {
            /* refs via data attribute query in measure */
          },
        });
      })}
    </div>
  );
}
