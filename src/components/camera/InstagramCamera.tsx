import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  CircleDot,
  Images,
  Infinity,
  LayoutGrid,
  RefreshCw,
  Type,
  X,
  Zap,
  ZapOff,
} from "lucide-react";
import { notifyCameraClose, notifyCameraOpen } from "@/lib/camera/cameraEvents";
import {
  CameraSessionError,
  capturePhotoFromVideo,
  isCameraApiAvailable,
  pickVideoMimeType,
  requestCameraStream,
  setTorchEnabled,
  stopMediaStream,
  type CameraFacing,
} from "@/lib/camera/cameraSession";
import { hapticLight, hapticMedium } from "@/lib/camera/haptics";

export type InstagramCameraCapture = { kind: "image" | "video"; dataUrl: string };

type CameraMode = "post" | "story" | "reel" | "live";

const MAX_VIDEO_MS = 60_000;
const HOLD_VIDEO_MS = 280;

const MODES: { id: CameraMode; label: string }[] = [
  { id: "post", label: "POST" },
  { id: "story", label: "STORY" },
  { id: "reel", label: "REEL" },
  { id: "live", label: "LIVE" },
];

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/** أيقونة شريط جانبي — نمط Instagram */
function SideToolBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        "flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.85)] transition active:scale-95 " +
        (active ? "bg-white/20" : "bg-transparent")
      }
    >
      {children}
    </button>
  );
}

export function InstagramCamera({
  open,
  onClose,
  onCapture,
  onFallback,
  language = "ar",
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (payload: InstagramCameraCapture) => void;
  onFallback?: () => void;
  language?: string;
}) {
  const ar = language === "ar";
  const videoRef = useRef<HTMLVideoElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef(0);
  const recordRafRef = useRef(0);

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mode, setMode] = useState<CameraMode>("post");
  const [galleryThumb, setGalleryThumb] = useState<string | null>(null);
  const [sideToolsExpanded, setSideToolsExpanded] = useState(true);

  const stopRecording = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recordRafRef.current) {
      cancelAnimationFrame(recordRafRef.current);
      recordRafRef.current = 0;
    }
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    } else {
      setRecording(false);
      setRecordProgress(0);
    }
  }, []);

  const teardown = useCallback(() => {
    stopRecording();
    void setTorchEnabled(streamRef.current, false);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  }, [stopRecording]);

  const attachStream = useCallback(
    async (f: CameraFacing) => {
      setPhase("loading");
      setErrorMsg("");
      teardown();
      try {
        const stream = await requestCameraStream(f, true);
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) {
          stopMediaStream(stream);
          return;
        }
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        v.muted = true;
        await v.play();
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(!!caps?.torch);
        setPhase("ready");
      } catch (e) {
        teardown();
        const msg =
          e instanceof CameraSessionError
            ? e.message
            : ar
              ? "تعذّر تشغيل الكاميرا"
              : "Could not start camera";
        setErrorMsg(msg);
        setPhase("error");
      }
    },
    [ar, teardown],
  );

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    teardown();
    notifyCameraClose();
    window.setTimeout(() => {
      setClosing(false);
      setEntered(false);
      onClose();
    }, 200);
  }, [closing, onClose, teardown]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    notifyCameraOpen();
    setClosing(false);
    setMode("post");
    const id = requestAnimationFrame(() => setEntered(true));
    void attachStream(facing);
    return () => {
      cancelAnimationFrame(id);
      teardown();
      notifyCameraClose();
    };
  }, [open, facing, attachStream, teardown]);

  useEffect(() => {
    if (!open) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") teardown();
    };
    const onPageHide = () => teardown();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [open, teardown]);

  const flipCamera = () => {
    hapticLight();
    setFacing(f => (f === "environment" ? "user" : "environment"));
  };

  const toggleTorch = async () => {
    hapticLight();
    if (!torchSupported) return;
    const next = !torchOn;
    const ok = await setTorchEnabled(streamRef.current, next);
    if (ok) setTorchOn(next);
  };

  const startVideoRecording = useCallback(() => {
    const stream = streamRef.current;
    const mime = pickVideoMimeType();
    if (!stream || !mime || typeof MediaRecorder === "undefined") return;
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = ev => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        setRecording(false);
        setRecordProgress(0);
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        if (blob.size < 800) return;
        void readBlobAsDataUrl(blob).then(dataUrl => {
          hapticMedium();
          onCapture({ kind: "video", dataUrl });
          requestClose();
        });
      };
      rec.start(200);
      recordStartRef.current = Date.now();
      setRecording(true);
      hapticMedium();
      const tick = () => {
        const elapsed = Date.now() - recordStartRef.current;
        const maxMs = mode === "story" ? 15_000 : mode === "reel" ? 90_000 : MAX_VIDEO_MS;
        setRecordProgress(Math.min(1, elapsed / maxMs));
        if (elapsed >= maxMs) {
          stopRecording();
          return;
        }
        recordRafRef.current = requestAnimationFrame(tick);
      };
      recordRafRef.current = requestAnimationFrame(tick);
    } catch {
      setRecording(false);
    }
  }, [mode, onCapture, requestClose, stopRecording]);

  const capturePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v || phase !== "ready") return;
    try {
      const dataUrl = capturePhotoFromVideo(v, facing);
      hapticMedium();
      onCapture({ kind: "image", dataUrl });
      requestClose();
    } catch {
      setErrorMsg(ar ? "تعذّر التقاط الصورة" : "Capture failed");
      setPhase("error");
    }
  }, [ar, facing, onCapture, phase, requestClose]);

  const onShutterDown = () => {
    if (phase !== "ready" || recording || mode === "live") return;
    const videoMode = mode === "reel" || mode === "story";
    if (videoMode) {
      startVideoRecording();
      return;
    }
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      startVideoRecording();
    }, HOLD_VIDEO_MS);
  };

  const onShutterUp = () => {
    if (mode === "reel" || mode === "story") {
      if (recording) stopRecording();
      return;
    }
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      capturePhoto();
      return;
    }
    if (recording) stopRecording();
  };

  const onGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const dataUrl = await readFileAsDataUrl(f);
      setGalleryThumb(dataUrl);
      const kind = f.type.startsWith("video") ? "video" : "image";
      hapticMedium();
      onCapture({ kind, dataUrl });
      requestClose();
    } catch {
      alert(ar ? "تعذّر فتح الصورة" : "Could not open media");
    }
  };

  if (!open || typeof document === "undefined") return null;

  const ringRadius = 38;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - recordProgress);

  const body = (
    <div
      className={
        "fixed inset-0 z-[420] mx-auto max-w-md bg-black text-white transition-opacity duration-200 " +
        (entered && !closing ? "opacity-100" : "opacity-0")
      }
      role="dialog"
      aria-modal="true"
      aria-label={ar ? "الكاميرا" : "Camera"}
    >
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={e => void onGalleryChange(e)}
      />

      {/* معاينة ملء الشاشة */}
      <video
        ref={videoRef}
        className={
          "absolute inset-0 h-full w-full object-cover " + (facing === "user" ? "-scale-x-100" : "")
        }
        playsInline
        muted
        autoPlay
      />

      {phase === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 px-8 text-center">
          <p className="text-sm text-white/90">{errorMsg}</p>
          {!isCameraApiAvailable() && onFallback ? (
            <button
              type="button"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
              onClick={() => {
                requestClose();
                onFallback();
              }}
            >
              {ar ? "فتح كاميرا النظام" : "Use system camera"}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
              onClick={() => void attachStream(facing)}
            >
              {ar ? "إعادة المحاولة" : "Retry"}
            </button>
          )}
        </div>
      )}

      {/* تدرجات علوية/سفلية */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-52 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

      {/* ─── أعلى: X يسار · فلاش وسط ─── */}
      <div
        className="absolute inset-x-0 top-0 z-20 px-4"
        style={{ paddingTop: "max(10px, var(--sat, env(safe-area-inset-top, 0px)))" }}
      >
        <div className="relative flex h-11 items-center justify-between">
          <button
            type="button"
            onClick={requestClose}
            className="flex h-11 w-11 touch-manipulation items-center justify-center text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] active:scale-95"
            aria-label={ar ? "إغلاق" : "Close"}
          >
            <X size={28} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={() => void toggleTorch()}
            disabled={!torchSupported}
            className="absolute left-1/2 flex h-11 w-11 -translate-x-1/2 touch-manipulation items-center justify-center text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] active:scale-95 disabled:opacity-45"
            aria-label={ar ? "الفلاش" : "Flash"}
          >
            {torchOn ? <Zap size={26} strokeWidth={2} className="text-amber-200" /> : <ZapOff size={26} strokeWidth={2} />}
          </button>

          <div className="h-11 w-11" aria-hidden />
        </div>
      </div>

      {/* ─── يسار: أدوات (نص · بوميرانغ · تخطيط · …) ─── */}
      <div
        className="absolute start-3 z-20 flex flex-col items-center gap-3"
        style={{ top: "calc(max(72px, var(--sat, 0px)) + 4.5rem)" }}
      >
        {sideToolsExpanded && (
          <>
            <SideToolBtn
              label={ar ? "نص" : "Text"}
              onClick={() => alert(ar ? "النص على الصورة — قريباً" : "Text overlay — coming soon")}
            >
              <Type size={26} strokeWidth={2} />
            </SideToolBtn>
            <SideToolBtn
              label="Boomerang"
              onClick={() => alert(ar ? "بوميرانغ — قريباً" : "Boomerang — coming soon")}
            >
              <Infinity size={26} strokeWidth={2} />
            </SideToolBtn>
            <SideToolBtn
              label={ar ? "تخطيط" : "Layout"}
              onClick={() => alert(ar ? "تخطيط — قريباً" : "Layout — coming soon")}
            >
              <LayoutGrid size={24} strokeWidth={2} />
            </SideToolBtn>
            <SideToolBtn
              label={ar ? "بدون يد" : "Hands-free"}
              onClick={() => {
                hapticLight();
                startVideoRecording();
              }}
            >
              <CircleDot size={24} strokeWidth={2} />
            </SideToolBtn>
          </>
        )}
        <button
          type="button"
          onClick={() => setSideToolsExpanded(v => !v)}
          className="flex h-8 w-8 items-center justify-center text-white/80 drop-shadow-md active:scale-95"
          aria-label={sideToolsExpanded ? (ar ? "إخفاء الأدوات" : "Hide tools") : (ar ? "إظهار الأدوات" : "Show tools")}
        >
          <ChevronDown
            size={22}
            className={"transition-transform " + (sideToolsExpanded ? "" : "rotate-180")}
          />
        </button>
      </div>

      {/* ─── أسفل: معرض · زر تصوير · عكس كاميرا ─── */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center"
        style={{ paddingBottom: "max(8px, var(--sab, env(safe-area-inset-bottom, 0px)))" }}
      >
        <div className="mb-3 flex w-full items-center justify-between px-5">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex h-11 w-11 touch-manipulation items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-zinc-800/80 shadow-lg active:scale-95"
            aria-label={ar ? "المعرض" : "Gallery"}
          >
            {galleryThumb ? (
              <img src={galleryThumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <Images size={22} className="text-white/90" />
            )}
          </button>

          <div className="relative flex items-center justify-center">
            <svg
              className={"absolute " + (recording ? "opacity-100" : "opacity-0")}
              width={92}
              height={92}
              viewBox="0 0 92 92"
              aria-hidden
            >
              <circle cx={46} cy={46} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
              <circle
                cx={46}
                cy={46}
                r={ringRadius}
                fill="none"
                stroke="#fff"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 46 46)"
              />
            </svg>
            <button
              type="button"
              disabled={phase !== "ready" || mode === "live"}
              onPointerDown={onShutterDown}
              onPointerUp={onShutterUp}
              onPointerCancel={onShutterUp}
              onContextMenu={e => e.preventDefault()}
              className="relative flex h-[78px] w-[78px] touch-manipulation items-center justify-center rounded-full border-[4px] border-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] active:scale-[0.96] disabled:opacity-40"
              aria-label={ar ? "التقاط" : "Capture"}
            >
              <span
                className={
                  "block rounded-full bg-white transition-all duration-150 " +
                  (recording ? "h-7 w-7 rounded-[6px]" : "h-[64px] w-[64px]")
                }
              />
            </button>
          </div>

          <button
            type="button"
            disabled={phase !== "ready" || recording}
            onClick={flipCamera}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/35 bg-white/10 text-white shadow-lg backdrop-blur-sm active:scale-95 disabled:opacity-40"
            aria-label={ar ? "عكس الكاميرا" : "Flip camera"}
          >
            <RefreshCw size={24} strokeWidth={2} />
          </button>
        </div>

        {/* أوضاع: POST · STORY · REEL · LIVE */}
        <div className="mb-2 flex w-full max-w-[min(100%,340px)] items-center justify-center gap-5 px-4">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                hapticLight();
                if (m.id === "live") {
                  alert(ar ? "البث المباشر — قريباً" : "Live — coming soon");
                  return;
                }
                setMode(m.id);
              }}
              className={
                "touch-manipulation text-[11px] font-bold tracking-[0.12em] transition " +
                (mode === m.id ? "text-white scale-105" : "text-white/45")
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
