import { useCallback, useEffect, useRef, useState } from "react";
import { X, Undo2, ChevronLeft, ChevronRight, Type, Eye, ImageIcon } from "lucide-react";
import { Avatar } from "../Avatar";
import {
  CHAT_DRAWING_BG_TRANSPARENT,
  DRAW_GRADIENT_COUNT,
  type DrawComposeLayer,
  paintDrawingToContext,
  scaleLayers,
  type ChatDrawingPayloadV1,
} from "./drawingPayload";

export type { DrawComposeLayer } from "./drawingPayload";

function clientToCanvas(e: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY];
}

export function ChatDrawComposeModal({
  onClose,
  onSend,
  senderName,
  senderAvatar,
  isQuranChannel,
  /** طبقة فوق منطقة الرسائل (ترى المحادثة تحتها) بدل شاشة كاملة منفصلة */
  overMessages,
}: {
  onClose: () => void;
  onSend: (p: { type: "drawing"; content: string; viewOnce: boolean }) => void;
  senderName?: string;
  senderAvatar?: string;
  isQuranChannel?: boolean;
  overMessages?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState<DrawComposeLayer[]>([]);
  /** -1 = خلفية شفافة وتظهر المحادثة خلفها */
  const [bgIndex, setBgIndex] = useState(CHAT_DRAWING_BG_TRANSPARENT);
  const [penColor, setPenColor] = useState("#ffffff");
  const [penWidth, setPenWidth] = useState(5);
  const [viewOnce, setViewOnce] = useState(false);
  const draftRef = useRef<{ color: string; width: number; points: [number, number][] } | null>(null);

  const PEN_COLORS = ["#ffffff", "#000000", "#ff3040", "#fcb045", "#833ab4", "#4fce5d", "#00c9ff", "#ffe500"];

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintDrawingToContext(ctx, canvas.width, canvas.height, bgIndex, layers, draftRef.current);
  }, [bgIndex, layers]);

  const resizeCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const w = Math.floor(wrap.clientWidth * dpr);
    const h = Math.floor(wrap.clientHeight * dpr);
    if (w < 1 || h < 1) return;

    const ow = canvas.width;
    const oh = canvas.height;

    if (ow === w && oh === h) {
      const ctx = canvas.getContext("2d");
      if (ctx) paintDrawingToContext(ctx, w, h, bgIndex, layers, draftRef.current);
      return;
    }

    draftRef.current = null;
    let nextLayers = layers;
    if (ow > 0 && oh > 0 && (ow !== w || oh !== h)) {
      nextLayers = scaleLayers(layers, ow, oh, w, h);
      setLayers(nextLayers);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) paintDrawingToContext(ctx, w, h, bgIndex, nextLayers, null);
  }, [bgIndex, layers]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    resizeCanvas();
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addTextCenter = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const raw = window.prompt("اكتب على الشاشة", "");
    if (raw == null || !raw.trim()) return;
    const fontSize = Math.max(22, Math.round(canvas.width / 14));
    setLayers(prev => [
      ...prev,
      {
        kind: "text",
        x: canvas.width / 2,
        y: canvas.height / 2,
        text: raw.trim(),
        color: penColor,
        fontSize,
      },
    ]);
  }, [penColor]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = clientToCanvas(e, canvasRef.current);
    draftRef.current = { color: penColor, width: penWidth, points: [p] };
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current || !canvasRef.current) return;
    e.preventDefault();
    const p = clientToCanvas(e, canvasRef.current);
    draftRef.current.points.push(p);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paintDrawingToContext(ctx, canvas.width, canvas.height, bgIndex, layers, draftRef.current);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current || !canvasRef.current) return;
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const d = draftRef.current;
    draftRef.current = null;
    if (d.points.length === 0) return;
    setLayers(prev => [...prev, { kind: "stroke", color: d.color, width: d.width, points: d.points }]);
  };

  const undo = () => setLayers(prev => prev.slice(0, -1));

  const buildPayload = useCallback((): ChatDrawingPayloadV1 | null => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 2 || canvas.height < 2 || layers.length === 0) return null;
    return {
      v: 1,
      w: canvas.width,
      h: canvas.height,
      bgIndex,
      layers,
    };
  }, [bgIndex, layers]);

  const handleSend = () => {
    const payload = buildPayload();
    if (!payload) return;
    onSend({ type: "drawing", content: JSON.stringify(payload), viewOnce });
    onClose();
  };

  const toolBtn =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-95";

  /** دورة: شفافة (محادثة) → تدرجات */
  const cycleBg = (delta: number) => {
    setBgIndex(prev => {
      if (prev === CHAT_DRAWING_BG_TRANSPARENT) {
        return delta > 0 ? 0 : DRAW_GRADIENT_COUNT - 1;
      }
      const g = prev + delta;
      if (g < 0) return DRAW_GRADIENT_COUNT - 1;
      if (g >= DRAW_GRADIENT_COUNT) return CHAT_DRAWING_BG_TRANSPARENT;
      return g;
    });
  };

  const bgLabel =
    bgIndex === CHAT_DRAWING_BG_TRANSPARENT ? "خلفية: المحادثة" : `خلفية: ${bgIndex + 1}/${DRAW_GRADIENT_COUNT}`;

  return (
    <div
      className={
        (overMessages
          ? "absolute inset-0 z-[85] flex min-h-0 flex-col bg-black/25 "
          : "fixed inset-0 z-[365] mx-auto flex min-h-0 max-w-md flex-col bg-black/30 backdrop-blur-md ") + "pointer-events-auto"
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,var(--sat))]">
        <button type="button" onClick={onClose} className={toolBtn} aria-label="إغلاق">
          <X size={20} />
        </button>
        <span className="min-w-0 flex-1 text-center text-xs font-medium text-white/95 sm:text-sm">رسم وكتابة</span>
        <button type="button" onClick={() => cycleBg(-1)} className={toolBtn} aria-label="خلفية سابقة">
          <ChevronRight size={20} className="rtl:rotate-180" />
        </button>
        <button type="button" onClick={() => cycleBg(1)} className={toolBtn} aria-label="خلفية تالية">
          <ChevronLeft size={20} className="rtl:rotate-180" />
        </button>
      </div>
      <p className="px-3 pb-1 text-center text-[10px] text-white/70">{bgLabel}</p>

      <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none px-2 pb-2">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none rounded-2xl bg-transparent"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <div className="shrink-0 space-y-3 border-t border-white/10 bg-zinc-950/90 px-3 pb-[max(1rem,var(--sab))] pt-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          {PEN_COLORS.map(c => (
            <button
              key={c}
              type="button"
              aria-label={`لون ${c}`}
              className={
                "h-9 w-9 shrink-0 rounded-full border-2 transition active:scale-95 " +
                (penColor === c ? "border-white scale-110" : "border-white/25")
              }
              style={{ backgroundColor: c }}
              onClick={() => setPenColor(c)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">سمك الخط</span>
          {[3, 6, 12].map(w => (
            <button
              key={w}
              type="button"
              onClick={() => setPenWidth(w)}
              className={
                "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                (penWidth === w ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20")
              }
            >
              {w === 3 ? "رفيع" : w === 6 ? "متوسط" : "عريض"}
            </button>
          ))}
          <button type="button" onClick={undo} className={toolBtn + " ms-auto"} aria-label="تراجع" disabled={!layers.length}>
            <Undo2 size={18} className={layers.length ? "" : "opacity-40"} />
          </button>
          <button type="button" onClick={addTextCenter} className={toolBtn} aria-label="نص">
            <Type size={18} />
          </button>
          <button
            type="button"
            onClick={() => setBgIndex(CHAT_DRAWING_BG_TRANSPARENT)}
            className={toolBtn + (bgIndex === CHAT_DRAWING_BG_TRANSPARENT ? " ring-2 ring-white/60" : "")}
            aria-label="إظهار المحادثة خلف الرسم"
            title="خلفية شفافة — تظهر المحادثة"
          >
            <ImageIcon size={18} />
          </button>
        </div>
        <label
          className={
            "flex cursor-pointer items-center justify-between gap-3 text-sm " +
            (isQuranChannel ? "text-emerald-100" : "text-zinc-200")
          }
        >
          <span className="flex items-center gap-2">
            <Eye size={16} className="opacity-70" />
            مشاهدة لمرة واحدة
          </span>
          <input type="checkbox" checked={viewOnce} onChange={e => setViewOnce(e.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
        <button
          type="button"
          onClick={handleSend}
          disabled={!layers.length}
          className={
            "flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold shadow-lg active:scale-[0.99] disabled:opacity-40 " +
            (isQuranChannel ? "bg-emerald-500 text-black" : "bg-white text-black")
          }
        >
          <Avatar name={senderName || "?"} src={senderAvatar} size={28} />
          إرسال الرسمة
        </button>
      </div>
    </div>
  );
}
