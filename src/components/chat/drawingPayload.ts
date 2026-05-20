/** طبقة في رسالة رسم (مرسومة كنقاط وليست صورة نقطية) */
export type DrawComposeLayer =
  | { kind: "stroke"; color: string; width: number; points: [number, number][] }
  | { kind: "text"; x: number; y: number; text: string; color: string; fontSize: number };

export type ChatDrawingPayloadV1 = {
  v: 1;
  w: number;
  h: number;
  /** -1 = خلفية شفافة (يظهر لون الفقاعة). 0… = تدرج */
  bgIndex: number;
  layers: DrawComposeLayer[];
};

export const CHAT_DRAWING_BG_TRANSPARENT = -1;

const GRADIENT_FILLS: Array<(ctx: CanvasRenderingContext2D, w: number, h: number) => void> = [
  (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#833ab4");
    g.addColorStop(0.45, "#fd1d1d");
    g.addColorStop(1, "#fcb045");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#00c6ff");
    g.addColorStop(1, "#0072ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#11998e");
    g.addColorStop(1, "#38ef7d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  (ctx, w, h) => {
    const g = ctx.createLinearGradient(w, 0, 0, h);
    g.addColorStop(0, "#fc466b");
    g.addColorStop(1, "#3f5efb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, w, 0);
    g.addColorStop(0, "#0f0c29");
    g.addColorStop(0.5, "#302b63");
    g.addColorStop(1, "#24243e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
  (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#ffe259");
    g.addColorStop(1, "#ffa751");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
];

export const DRAW_GRADIENT_COUNT = GRADIENT_FILLS.length;

export function scaleLayers(
  layers: DrawComposeLayer[],
  ow: number,
  oh: number,
  nw: number,
  nh: number,
): DrawComposeLayer[] {
  if (ow <= 0 || oh <= 0 || nw <= 0 || nh <= 0) return layers;
  const sx = nw / ow;
  const sy = nh / oh;
  const scalePt = Math.sqrt(sx * sy);
  return layers.map(L => {
    if (L.kind === "stroke") {
      return {
        kind: "stroke",
        color: L.color,
        width: Math.max(1, L.width * scalePt),
        points: L.points.map(([x, y]) => [x * sx, y * sy] as [number, number]),
      };
    }
    return {
      kind: "text",
      x: L.x * sx,
      y: L.y * sy,
      text: L.text,
      color: L.color,
      fontSize: Math.max(12, L.fontSize * scalePt),
    };
  });
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  lineW: number,
  points: [number, number][],
) {
  if (points.length === 0) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(points[0][0], points[0][1], Math.max(lineW / 2, 1.5), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

type Draft = { color: string; width: number; points: [number, number][] } | null;

export function paintDrawingToContext(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  bgIndex: number,
  layers: DrawComposeLayer[],
  draft: Draft,
  opts?: { neutralFillWhenTransparent?: boolean },
) {
  if (bgIndex >= 0) {
    GRADIENT_FILLS[bgIndex % GRADIENT_FILLS.length](ctx, cw, ch);
  } else if (opts?.neutralFillWhenTransparent) {
    ctx.fillStyle = "rgba(244, 244, 245, 0.96)";
    try {
      if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
        ctx.fillStyle = "rgba(24, 24, 27, 0.92)";
      }
    } catch {
      /* ignore */
    }
    ctx.fillRect(0, 0, cw, ch);
  } else {
    ctx.clearRect(0, 0, cw, ch);
  }
  for (const L of layers) {
    if (L.kind === "stroke") drawStroke(ctx, L.color, L.width, L.points);
    else {
      ctx.font = `bold ${L.fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = Math.max(3, L.fontSize / 10);
      ctx.fillStyle = L.color;
      ctx.strokeText(L.text, L.x, L.y);
      ctx.fillText(L.text, L.x, L.y);
    }
  }
  if (draft && draft.points.length) drawStroke(ctx, draft.color, draft.width, draft.points);
}

export function parseDrawingPayload(raw: string): ChatDrawingPayloadV1 | null {
  try {
    const p = JSON.parse(raw) as ChatDrawingPayloadV1;
    if (p?.v !== 1 || typeof p.w !== "number" || typeof p.h !== "number" || !Array.isArray(p.layers)) return null;
    if (typeof p.bgIndex !== "number") return null;
    return p;
  } catch {
    return null;
  }
}
