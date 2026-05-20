import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatDrawingCanvas } from "./ChatDrawingCanvas";
import { parseDrawingPayload } from "./drawingPayload";
import { X, Sparkles, Type as TypeIcon, PenLine, Sticker, Music, Download, LayoutGrid, Infinity, Eye } from "lucide-react";
import { Avatar } from "../Avatar";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
}

async function mergeTwoImagesSideBySide(leftUrl: string, rightUrl: string): Promise<string> {
  const [a, b] = await Promise.all([loadImage(leftUrl), loadImage(rightUrl)]);
  const h = Math.max(a.height, b.height);
  const wa = Math.round(a.width * (h / a.height));
  const wb = Math.round(b.width * (h / b.height));
  const canvas = document.createElement("canvas");
  canvas.width = wa + wb;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return leftUrl;
  ctx.drawImage(a, 0, 0, wa, h);
  ctx.drawImage(b, wa, 0, wb, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export type CameraComposeDraft = { kind: "image" | "video"; dataUrl: string };

export function ChatCameraComposeModal({
  draft,
  senderName,
  senderAvatar,
  onClose,
  onSend,
}: {
  draft: CameraComposeDraft | null;
  senderName?: string;
  senderAvatar?: string;
  onClose: () => void;
  onSend: (p: { type: "image" | "video"; content: string; viewOnce: boolean }) => void;
}) {
  const [preview, setPreview] = useState("");
  const [kind, setKind] = useState<"image" | "video">("image");
  const [viewOnce, setViewOnce] = useState(true);
  const splitInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft) {
      setPreview("");
      return;
    }
    setPreview(draft.dataUrl);
    setKind(draft.kind);
    setViewOnce(draft.kind === "image");
  }, [draft]);

  const applyTextOnImage = useCallback(() => {
    if (kind !== "image" || !draft) return;
    const t = window.prompt("اكتب على الصورة", "");
    if (t == null || !t.trim()) return;
    void (async () => {
      try {
        const base = preview || draft.dataUrl;
        const img = await loadImage(base);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const fontSize = Math.max(20, Math.round(img.width / 14));
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(0,0,0,0.65)";
        ctx.lineWidth = Math.max(3, fontSize / 8);
        ctx.fillStyle = "#fff";
        const cx = img.width / 2;
        const cy = img.height / 2;
        const line = t.trim();
        ctx.strokeText(line, cx, cy);
        ctx.fillText(line, cx, cy);
        setPreview(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        alert("تعذّر تطبيق النص");
      }
    })();
  }, [kind, preview, draft]);

  const onPickSecondLayout = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || !f.type.startsWith("image/") || kind !== "image" || !draft) return;
      const r = new FileReader();
      r.onload = () => {
        void (async () => {
          try {
            const second = String(r.result);
            const merged = await mergeTwoImagesSideBySide(preview || draft.dataUrl, second);
            setPreview(merged);
          } catch {
            alert("تعذّر تجميع الصورتين");
          }
        })();
      };
      r.readAsDataURL(f);
    },
    [kind, preview, draft],
  );

  const downloadMedia = useCallback(() => {
    const url = preview || draft?.dataUrl;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "video" ? "video.webm" : "photo.jpg";
    a.click();
  }, [preview, draft, kind]);

  if (typeof document === "undefined" || !draft) return null;

  const toolBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 active:scale-95 transition";

  const body = (
    <div className="fixed inset-0 z-[360] mx-auto flex max-w-md flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
        <button type="button" onClick={onClose} className={toolBtn} aria-label="إغلاق">
          <X size={20} />
        </button>
        <div className="flex min-w-0 flex-1 justify-end gap-2 overflow-x-auto py-1 pe-1 [scrollbar-width:none]">
          <button type="button" className={toolBtn} aria-label="فلاتر" onClick={() => alert("الفلاتر قريباً")}>
            <Sparkles size={18} />
          </button>
          <button type="button" className={toolBtn} aria-label="نص" onClick={applyTextOnImage} disabled={kind !== "image"}>
            <TypeIcon size={18} className={kind !== "image" ? "opacity-40" : ""} />
          </button>
          <button type="button" className={toolBtn} aria-label="رسم" onClick={() => alert("الرسم قريباً")}>
            <PenLine size={18} />
          </button>
          <button type="button" className={toolBtn} aria-label="ملصقات" onClick={() => alert("الملصقات قريباً")}>
            <Sticker size={18} />
          </button>
          <button type="button" className={toolBtn} aria-label="موسيقى" onClick={() => alert("الموسيقى قريباً")}>
            <Music size={18} />
          </button>
          <button type="button" className={toolBtn} aria-label="تنزيل" onClick={downloadMedia}>
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2">
        <div className="relative max-h-[min(70vh,520px)] w-full overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10">
          {kind === "image" ? (
            <img src={preview || draft.dataUrl} alt="" className="mx-auto block h-full max-h-[min(70vh,520px)] w-auto max-w-full object-contain" />
          ) : (
            <video src={preview || draft.dataUrl} className="mx-auto block h-full max-h-[min(70vh,520px)] w-full object-contain" controls playsInline />
          )}
        </div>
      </div>

      <input ref={splitInputRef} type="file" accept="image/*" className="hidden" onChange={onPickSecondLayout} />

      <div className="shrink-0 space-y-3 rounded-t-3xl border-t border-white/10 bg-zinc-950 px-4 pb-6 pt-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => splitInputRef.current?.click()}
            disabled={kind !== "image"}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium " +
              (kind === "image" ? "border-violet-500/50 bg-violet-600/25 text-violet-100" : "border-white/10 text-white/40")
            }
          >
            <LayoutGrid size={14} />
            تقسيم شاشة
          </button>
          <button
            type="button"
            onClick={() => alert("تكرار الفيديو (بوميرانغ) قريباً")}
            disabled={kind !== "video"}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium " +
              (kind === "video" ? "border-violet-500/50 bg-violet-600/25 text-violet-100" : "border-white/10 text-white/40")
            }
          >
            <Infinity size={14} />
            تكرار
          </button>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-200">
          <span className="flex items-center gap-2">
            <Eye size={16} className="text-zinc-400" />
            مشاهدة لمرة واحدة
          </span>
          <input type="checkbox" checked={viewOnce} onChange={e => setViewOnce(e.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          عند التفعيل لا يظهر المحتوى كاملاً في الفقاعة؛ يظهر زرّ بنفسجي، وبعد فتحه مرة لا يمكن إعادة المشاهدة.
        </p>
        <button
          type="button"
          onClick={() => {
            const content = preview || draft.dataUrl;
            onSend({ type: kind, content, viewOnce });
            onClose();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-semibold text-black shadow-lg active:scale-[0.99]"
        >
          <Avatar name={senderName || "?"} src={senderAvatar} size={28} />
          إرسال
        </button>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

export function ViewOnceMediaOverlay({
  media,
  src,
  onClose,
}: {
  media: "image" | "video" | "drawing";
  src: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  const drawPayload = media === "drawing" ? parseDrawingPayload(src) : null;
  return createPortal(
    <div className="fixed inset-0 z-[370] flex flex-col bg-black">
      <div className="flex shrink-0 justify-end p-3">
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20" aria-label="إغلاق">
          <X size={22} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {media === "drawing" ? (
          drawPayload ? (
            <div className="flex h-full w-full max-w-lg flex-col items-center justify-center">
              <ChatDrawingCanvas payload={drawPayload} className="w-full" maxHeightPx={620} />
            </div>
          ) : (
            <p className="text-center text-sm text-white/80">تعذر عرض الرسمة</p>
          )
        ) : media === "image" ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <video src={src} controls autoPlay className="max-h-full max-w-full object-contain" playsInline />
        )}
      </div>
    </div>,
    document.body,
  );
}
