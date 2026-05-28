export type CameraFacing = "user" | "environment";

export type CameraSessionErrorCode = "unsupported" | "denied" | "busy" | "unknown";

export class CameraSessionError extends Error {
  constructor(
    message: string,
    readonly code: CameraSessionErrorCode,
  ) {
    super(message);
    this.name = "CameraSessionError";
  }
}

export function isCameraApiAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export async function requestCameraStream(
  facing: CameraFacing,
  withAudio: boolean,
): Promise<MediaStream> {
  if (!isCameraApiAvailable()) {
    throw new CameraSessionError("الكاميرا غير مدعومة على هذا الجهاز", "unsupported");
  }
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 60 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      video,
      audio: withAudio,
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new CameraSessionError("يُرجى السماح بالوصول إلى الكاميرا والميكروفون من الإعدادات", "denied");
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new CameraSessionError("لم يُعثر على كاميرا", "unknown");
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      throw new CameraSessionError("الكاميرا قيد الاستخدام من تطبيق آخر", "busy");
    }
    throw new CameraSessionError(
      e instanceof Error ? e.message : "تعذّر تشغيل الكاميرا",
      "unknown",
    );
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

export function pickVideoMimeType(): string {
  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function capturePhotoFromVideo(
  video: HTMLVideoElement,
  facing: CameraFacing,
  quality = 0.92,
): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("no frame");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  if (facing === "user") {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function setTorchEnabled(stream: MediaStream | null, on: boolean): Promise<boolean> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return false;
  try {
    const caps = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
    if (!caps?.torch) return false;
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}
