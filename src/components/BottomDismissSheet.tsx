import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const DISMISS_START_PX = 8;
const DISMISS_FLING_VY = 0.45;

type DragMode = "pending" | "dismiss" | "scroll";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  startScrollTop: number;
  mode: DragMode;
};

export function BottomDismissSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  zIndex = 130,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  zIndex?: number;
}) {
  const [dismissY, setDismissY] = useState(0);
  const [dismissSpring, setDismissSpring] = useState(false);
  const [isDismissDragging, setIsDismissDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const panelHeightRef = useRef(420);

  useEffect(() => {
    if (!open) {
      setDismissY(0);
      setDismissSpring(false);
      setIsDismissDragging(false);
      dragRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current;
    const ro = new ResizeObserver(() => {
      panelHeightRef.current = Math.max(280, el.offsetHeight);
    });
    ro.observe(el);
    panelHeightRef.current = Math.max(280, el.offsetHeight);
    return () => ro.disconnect();
  }, [open]);

  const finishClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const snapBack = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDismissSpring(true);
    setDismissY(0);
    setIsDismissDragging(false);
    window.setTimeout(() => setDismissSpring(false), 320);
  }, []);

  const animateClose = useCallback(() => {
    const h = panelHeightRef.current;
    setDismissSpring(true);
    setDismissY(h);
    setIsDismissDragging(false);
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      finishClose();
    }, 280);
  }, [finishClose]);

  const readScrollTop = useCallback(() => scrollRef.current?.scrollTop ?? 0, []);

  const beginPanelDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-sheet-drag]")) return;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        lastT: performance.now(),
        velocity: 0,
        startScrollTop: readScrollTop(),
        mode: "pending",
      };
      setDismissSpring(false);
    },
    [readScrollTop],
  );

  const movePanelDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const scrollTop = readScrollTop();
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      d.velocity = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = now;

      if (d.mode === "pending") {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > DISMISS_START_PX) {
          d.mode = "scroll";
          return;
        }
        if (dy < -DISMISS_START_PX) {
          d.mode = "scroll";
          return;
        }
        if (scrollTop > 2 || d.startScrollTop > 2) {
          if (dy > DISMISS_START_PX) d.mode = "scroll";
          return;
        }
        if (dy > DISMISS_START_PX && dy >= Math.abs(dx)) {
          d.mode = "dismiss";
          setIsDismissDragging(true);
          try {
            panelRef.current?.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        } else {
          return;
        }
      }

      if (d.mode === "scroll") return;

      if (d.mode === "dismiss") {
        e.preventDefault();
        const el = scrollRef.current;
        if (el) el.scrollTop = 0;
        setDismissY(Math.max(0, dy));
      }
    },
    [readScrollTop],
  );

  const endPanelDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      dragRef.current = null;
      try {
        if (panelRef.current?.hasPointerCapture?.(e.pointerId)) {
          panelRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      if (!d || e.pointerId !== d.pointerId) return;

      if (d.mode === "dismiss") {
        const dy = Math.max(0, e.clientY - d.startY);
        const h = panelHeightRef.current;
        if (dy > h * 0.22 || d.velocity > DISMISS_FLING_VY) animateClose();
        else snapBack();
        return;
      }

      setIsDismissDragging(false);
    },
    [animateClose, snapBack],
  );

  if (!open || typeof document === "undefined") return null;

  const dismissProgress = dismissY / Math.max(1, panelHeightRef.current);
  const backdropOpacity = Math.max(0, 0.45 * (1 - dismissProgress));

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col justify-end"
      style={{ zIndex }}
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: backdropOpacity,
          transition: dismissSpring ? "opacity 0.28s ease-out" : "none",
        }}
        aria-hidden
        onClick={() => animateClose()}
      />
      <div
        ref={panelRef}
        className="relative z-10 mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl touch-manipulation animate-in slide-in-from-bottom duration-300"
        style={{
          maxHeight: "min(88dvh, 720px)",
          transform: `translate3d(0, ${dismissY}px, 0)`,
          transition: dismissSpring
            ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)"
            : "none",
          willChange: "transform",
          paddingBottom: "max(0.75rem, var(--sab, 0px))",
          touchAction: isDismissDragging ? "none" : "manipulation",
        }}
        onClick={e => e.stopPropagation()}
        onPointerDown={beginPanelDrag}
        onPointerMove={movePanelDrag}
        onPointerUp={endPanelDrag}
        onPointerCancel={endPanelDrag}
      >
        <div
          data-sheet-drag-handle
          className="flex shrink-0 flex-col items-center border-b border-border bg-background"
        >
          <div className="mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35" />
          <p className="py-2 text-center text-[11px] font-medium text-muted-foreground">
            اسحب للأسفل للإغلاق
          </p>
        </div>
        {(title || subtitle) && (
          <div dir="rtl" className="shrink-0 border-b border-border px-4 py-3 text-start">
            {title ? <h2 className="text-[15px] font-semibold text-foreground">{title}</h2> : null}
            {subtitle ? (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        )}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
          style={{ pointerEvents: isDismissDragging ? "none" : "auto" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
