import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export const APP_COLUMN_MAX_PX = 448;
export const SLIDE_DISMISS_MS = 260;
export const SLIDE_DISMISS_EASE = "cubic-bezier(0.25, 1, 0.35, 1)";

export function isDocumentRtl(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("dir") === "rtl";
}

/** تحويلات مكدس المحادثة (قائمة + غرفة) — اتجاه الإغلاق يطابق RTL (رجوع يمين) */
export function chatStackLayerTransforms(progress: number, widthPx: number, rtl = isDocumentRtl()) {
  const p = Math.max(0, Math.min(1, progress));
  const w = Math.max(260, Math.round(widthPx));
  if (rtl) {
    return {
      inbox: `translate3d(${Math.round(-p * w)}px, 0, 0)`,
      room: `translate3d(${Math.round((1 - p) * w)}px, 0, 0)`,
    };
  }
  return {
    inbox: `translate3d(${Math.round(p * w)}px, 0, 0)`,
    room: `translate3d(${Math.round((p - 1) * w)}px, 0, 0)`,
  };
}

export type UseSlideDismissBackOptions = {
  onDismiss: () => void;
  enabled?: boolean;
  blocked?: boolean;
  /** 0…1 على documentElement أثناء السحب (مثل محادثة دايركت) */
  dismissPullCssVar?: string;
  /** 0…1 تقدّم فتح المحادثة (1 = مفتوحة بالكامل) — يحرّك القائمة والخيط معاً */
  stackProgressCssVar?: string;
  /** عند تضمين المحادثة داخل مكدس سناب: لا نحرّك اللوحة داخلياً، فقط التقدّم */
  embedInStack?: boolean;
  onStackProgress?: (progress: number) => void;
  /** إعادة ضبط الموضع عند تغيّر المفتاح (مثلاً chat.id) */
  resetKey?: string | number;
  /** لا تغطّي شريط السحب منطقة كتابة الرسائل (زر الإرسال يمين الشاشة) */
  edgeBottomInsetPx?: number;
};

export function useSlideDismissBack({
  onDismiss,
  enabled = true,
  blocked = false,
  dismissPullCssVar,
  stackProgressCssVar,
  embedInStack = false,
  onStackProgress,
  resetKey,
  edgeBottomInsetPx = 80,
}: UseSlideDismissBackOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(
    typeof window !== "undefined" ? Math.min(window.innerWidth, APP_COLUMN_MAX_PX) : APP_COLUMN_MAX_PX,
  );
  const liveTxRef = useRef(0);
  const dragRef = useRef<{ pointerId: number | null; startX: number; startTx: number }>({
    pointerId: null,
    startX: 0,
    startTx: 0,
  });
  const dismissingRef = useRef(false);

  const [slideTx, setSlideTx] = useState(0);
  const [slideSpring, setSlideSpring] = useState(false);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismissRtl = isDocumentRtl();

  const clampTx = useCallback(
    (tx: number) => {
      const w = widthRef.current;
      if (dismissRtl) return Math.max(0, Math.min(w, tx));
      return Math.max(-w, Math.min(0, tx));
    },
    [dismissRtl],
  );

  const stackOpenProgress = useCallback(
    (tx: number) => {
      const w = Math.max(260, widthRef.current);
      if (dismissRtl) return Math.max(0, Math.min(1, 1 - tx / w));
      return Math.max(0, Math.min(1, 1 + tx / w));
    },
    [dismissRtl],
  );

  const finishDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setSlideSpring(true);
    const w = widthRef.current;
    const target = dismissRtl ? w : -w;
    setSlideTx(target);
    liveTxRef.current = target;
    if (embedInStack) {
      onStackProgress?.(0);
      if (stackProgressCssVar) {
        document.documentElement.style.setProperty(stackProgressCssVar, "0");
      }
    }
    window.setTimeout(() => {
      try {
        startTransition(() => onDismissRef.current());
      } finally {
        dismissingRef.current = false;
      }
    }, SLIDE_DISMISS_MS);
  }, [dismissRtl, embedInStack, onStackProgress, stackProgressCssVar]);

  const requestDismiss = useCallback(
    (opts?: { immediate?: boolean }): boolean => {
      if (!enabled || blocked) return false;
      if (opts?.immediate) {
        if (dismissingRef.current) return false;
        dismissingRef.current = true;
        startTransition(() => {
          try {
            onDismissRef.current();
          } finally {
            dismissingRef.current = false;
          }
        });
        return true;
      }
      if (dismissingRef.current) return false;
      finishDismiss();
      return true;
    },
    [enabled, blocked, finishDismiss],
  );

  const snapBack = useCallback(() => {
    setSlideSpring(true);
    setSlideTx(0);
    liveTxRef.current = 0;
    window.setTimeout(() => setSlideSpring(false), SLIDE_DISMISS_MS);
  }, []);

  useEffect(() => {
    dismissingRef.current = false;
    setSlideTx(0);
    liveTxRef.current = 0;
    setSlideSpring(false);
    dragRef.current = { pointerId: null, startX: 0, startTx: 0 };
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const upd = () => {
      const r = el.getBoundingClientRect().width;
      widthRef.current = Math.max(260, Math.min(r || window.innerWidth, APP_COLUMN_MAX_PX));
    };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const w = Math.max(260, widthRef.current);
    const dragging = dragRef.current.pointerId != null;
    const hasSlideOffset = Math.abs(slideTx) > 1;
    /**
     * داخل مكدس المحادثة slideTx يبقى 0 — تقدّم الفتح/الإغلاق يُدار من ChatScreen فقط.
     * مزامنة openProgress(1) هنا كانت تعيد فتح الشاشة لحظةً بعد الرجوع (ومضة انعكاس).
     */
    const shouldSyncStackProgress = !embedInStack || dragging || hasSlideOffset;
    if (shouldSyncStackProgress) {
      const openProgress = stackOpenProgress(slideTx);
      onStackProgress?.(openProgress);
      if (stackProgressCssVar) {
        document.documentElement.style.setProperty(stackProgressCssVar, String(openProgress));
      }
    }

    if (!dismissPullCssVar) return;
    const p = Math.min(1, Math.abs(slideTx) / w);
    document.documentElement.style.setProperty(dismissPullCssVar, String(p));
  }, [slideTx, dismissPullCssVar, stackProgressCssVar, onStackProgress, embedInStack, stackOpenProgress]);

  useEffect(() => {
    return () => {
      if (dismissPullCssVar) document.documentElement.style.removeProperty(dismissPullCssVar);
      if (stackProgressCssVar) document.documentElement.style.removeProperty(stackProgressCssVar);
    };
  }, [dismissPullCssVar, stackProgressCssVar]);

  const onEdgePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || blocked || dismissingRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      setSlideSpring(false);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startTx: liveTxRef.current,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [enabled, blocked],
  );

  const onEdgePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (d.pointerId == null || d.pointerId !== e.pointerId) return;
      e.preventDefault();
      const delta = e.clientX - d.startX;
      /** RTL: السحب من اليمين لليسار يزيد الإزاحة (إغلاق باتجاه اليمين) */
      const raw = dismissRtl ? d.startTx - delta : d.startTx + delta;
      const next = clampTx(raw);
      liveTxRef.current = next;
      setSlideTx(next);
    },
    [clampTx, dismissRtl],
  );

  const onEdgePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (d.pointerId === null || d.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = { pointerId: null, startX: 0, startTx: 0 };
      if (!enabled || blocked) {
        snapBack();
        return;
      }
      const tx = liveTxRef.current;
      const w = widthRef.current;
      const threshold = Math.max(w * 0.3, 72);
      if (dismissRtl ? tx >= threshold : tx <= -threshold) {
        finishDismiss();
      } else {
        snapBack();
      }
    },
    [enabled, blocked, finishDismiss, snapBack, dismissRtl],
  );

  const onEdgeLostCapture = useCallback(() => {
    if (dragRef.current.pointerId == null) return;
    dragRef.current = { pointerId: null, startX: 0, startTx: 0 };
    snapBack();
  }, [snapBack]);

  const panelStyle: React.CSSProperties = embedInStack
    ? {
        transform: "none",
        transition: slideSpring ? `opacity ${SLIDE_DISMISS_MS}ms ${SLIDE_DISMISS_EASE}` : "none",
      }
    : {
        transform: `translate3d(${slideTx}px, 0, 0)`,
        transition: slideSpring ? `transform ${SLIDE_DISMISS_MS}ms ${SLIDE_DISMISS_EASE}` : "none",
        boxShadow: Math.abs(slideTx) > 4 ? (dismissRtl ? "8px 0 20px rgba(0,0,0,0.1)" : "-8px 0 20px rgba(0,0,0,0.1)") : undefined,
      };

  /** يمين الشاشة — لا يغطّي شريط الإرسال (composer dir=ltr والزر أزرق يمين) */
  const edgeStripClassName =
    "absolute top-14 right-0 z-[45] min-w-[48px] w-[max(3rem,8vw)] max-w-[3.5rem] touch-none select-none bg-transparent " +
    (!enabled || blocked ? "pointer-events-none" : "");
  const edgeStripStyle: React.CSSProperties = {
    bottom: Math.max(56, edgeBottomInsetPx),
  };

  const edgeStripProps = {
    role: "presentation" as const,
    "aria-hidden": true as const,
    className: edgeStripClassName,
    style: edgeStripStyle,
    onPointerDown: onEdgePointerDown,
    onPointerMove: onEdgePointerMove,
    onPointerUp: onEdgePointerUp,
    onPointerCancel: onEdgePointerUp,
    onLostPointerCapture: onEdgeLostCapture,
  };

  return {
    containerRef,
    panelStyle,
    requestDismiss,
    edgeStripProps,
    slideTx,
  };
}
