import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ReportFlow } from "./ReportFlow";
import type { ReportTargetType } from "@/lib/moderationTypes";
import { setReportSheetOpen } from "@/lib/reportSheetChrome";

const DISMISS_START_PX = 10;
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

type Props = {
  open: boolean;
  onClose: () => void;
  reportedUserId: string;
  reportedUsername?: string;
  targetType: ReportTargetType;
  targetId?: string;
};

/**
 * ورقة بلاغ بملء الشاشة — سحب للأسفل من أي مكان (عند أعلى القائمة) للإغلاق.
 */
export function ReportFlowSheet({
  open,
  onClose,
  reportedUserId,
  reportedUsername,
  targetType,
  targetId,
}: Props) {
  const [dismissY, setDismissY] = useState(0);
  const [dismissSpring, setDismissSpring] = useState(false);
  const [isDismissDragging, setIsDismissDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const viewportHRef = useRef(
    typeof window !== "undefined" ? window.innerHeight : 800,
  );

  useEffect(() => {
    setReportSheetOpen(open);
    return () => {
      if (!open) setReportSheetOpen(false);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDismissY(0);
      setDismissSpring(false);
      setIsDismissDragging(false);
      dragRef.current = null;
    }
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
    const h = viewportHRef.current;
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
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
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
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    (e: React.PointerEvent<HTMLDivElement>) => {
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
        const vh = viewportHRef.current;
        if (dy > vh * 0.22 || d.velocity > DISMISS_FLING_VY) animateClose();
        else snapBack();
        return;
      }

      setIsDismissDragging(false);
    },
    [animateClose, snapBack],
  );

  if (!open || typeof document === "undefined") return null;

  const dismissProgress = dismissY / Math.max(1, viewportHRef.current);
  const backdropOpacity = Math.max(0, 0.5 * (1 - dismissProgress));

  return createPortal(
    <div className="fixed inset-0 z-[10050]" role="dialog" aria-modal>
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
        className="absolute inset-x-0 top-0 bottom-0 mx-auto flex w-full max-w-md flex-col bg-background shadow-2xl touch-manipulation"
        style={{
          transform: `translate3d(0, ${dismissY}px, 0)`,
          transition: dismissSpring
            ? "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)"
            : "none",
          willChange: "transform",
          paddingTop: "var(--sat, 0px)",
          paddingBottom: "var(--sab, 0px)",
          touchAction: isDismissDragging ? "none" : "manipulation",
        }}
        onClick={e => e.stopPropagation()}
        onPointerDown={beginPanelDrag}
        onPointerMove={movePanelDrag}
        onPointerUp={endPanelDrag}
        onPointerCancel={endPanelDrag}
      >
        <div
          data-report-drag-handle
          className="flex shrink-0 flex-col items-center border-b border-border bg-background pointer-events-none"
          aria-hidden
        >
          <div className="mt-2 h-1 w-10 shrink-0 rounded-full bg-muted" />
          <p className="py-2 text-center text-[11px] font-medium text-muted-foreground">
            اسحب للأسفل للإغلاق
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ReportFlow
            reportedUserId={reportedUserId}
            reportedUsername={reportedUsername}
            targetType={targetType}
            targetId={targetId}
            onClose={animateClose}
            fullScreen
            contentScrollRef={scrollRef}
            scrollLocked={isDismissDragging}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
