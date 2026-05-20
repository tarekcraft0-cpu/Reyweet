import { useLayoutEffect, useRef } from "react";
import { paintDrawingToContext, type ChatDrawingPayloadV1 } from "./drawingPayload";

export function ChatDrawingCanvas({
  payload,
  className,
  maxHeightPx = 280,
  /** في الفقاعة: خلفية خفيفة تحت الرسم الشفاف حتى تظهر الخطوط البيضاء */
  forChatDisplay,
}: {
  payload: ChatDrawingPayloadV1;
  className?: string;
  maxHeightPx?: number;
  forChatDisplay?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || payload.w < 2 || payload.h < 2) return;

    const paint = () => {
      let wBox = Math.max(1, Math.floor(wrap.clientWidth));
      /** أول إطار قد يكون عرض الحاوية صفراً داخل flex — نستخدم عرضاً منطقياً من أبعاد الرسم */
      if (wBox < 8) {
        const dprGuess = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        wBox = Math.min(360, Math.max(160, Math.round(payload.w / dprGuess)));
      }
      const ratio = payload.h / payload.w;
      let hBox = Math.round(wBox * ratio);
      hBox = Math.min(maxHeightPx, Math.max(48, hBox));
      wBox = Math.max(8, Math.round(hBox / ratio));

      const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const cw = Math.floor(wBox * dpr);
      const ch = Math.floor(hBox * dpr);
      if (cw < 2 || ch < 2) return;
      canvas.style.width = `${wBox}px`;
      canvas.style.height = `${hBox}px`;
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const neutralFill = !!forChatDisplay && payload.bgIndex < 0;
      paintDrawingToContext(ctx, cw, ch, payload.bgIndex, payload.layers, null, {
        neutralFillWhenTransparent: neutralFill,
      });
    };

    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [payload, maxHeightPx, forChatDisplay]);

  return (
    <div
      ref={wrapRef}
      className={(className ?? "w-full") + " min-w-0"}
      style={{
        width: "100%",
        maxHeight: maxHeightPx,
        aspectRatio: `${payload.w} / ${payload.h}`,
      }}
    >
      <canvas ref={canvasRef} className="block h-auto w-full rounded-lg" aria-hidden />
    </div>
  );
}
