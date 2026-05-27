import {
  REEL_ACCEPT_VIDEO,
  REEL_MAX_UPLOAD_BYTES,
  formatReelMaxSizeError,
} from "./reelsSpec";
import { apiBackendEnabled, apiUploadMedia, ensureApiRuntimeConfig, getApiToken } from "./apiBackend";
import { isVideoMediaRef } from "./postMedia";

function uploadTimeoutMs(file: File): number {
  const mb = file.size / (1024 * 1024);
  if (mb > 200) return 600_000;
  if (mb > 80) return 420_000;
  return 240_000;
}

export async function validateReelVideoFile(
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!file.type.startsWith("video/") && !REEL_ACCEPT_VIDEO.includes(file.type)) {
    return { ok: false, error: "الريلز يتطلب ملف فيديو (MP4 موصى به)" };
  }
  if (file.size > REEL_MAX_UPLOAD_BYTES) {
    return { ok: false, error: formatReelMaxSizeError(file.size) };
  }
  return { ok: true };
}

/** لقطة غلاف مربعة من منتصف إطار الفيديو (معاينة قبل الرفع) */
function drawSquareCover(video: HTMLVideoElement, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export function captureReelCoverFromVideo(
  video: HTMLVideoElement,
  timeSec = 1,
): Promise<string> {
  const seekTo = Math.min(
    Math.max(timeSec, 0),
    Math.max(0.05, (Number.isFinite(video.duration) ? video.duration : 1) - 0.05),
  );

  const captureAtTime = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const snap = () => {
        try {
          resolve(drawSquareCover(video, 720));
        } catch (e) {
          reject(e);
        }
      };
      if (Math.abs(video.currentTime - seekTo) < 0.08 && video.readyState >= 2) {
        snap();
        return;
      }
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        snap();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = seekTo;
      window.setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        if (video.readyState >= 2) snap();
        else reject(new Error("seek timeout"));
      }, 4000);
    });

  if (video.readyState >= 1) return captureAtTime();
  return new Promise((resolve, reject) => {
    video.addEventListener(
      "loadeddata",
      () => {
        captureAtTime().then(resolve).catch(reject);
      },
      { once: true },
    );
  });
}

export async function uploadReelVideo(
  file: File,
): Promise<{ ok: true; videoUrl: string; posterUrl?: string } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!apiBackendEnabled() || !token) {
    return { ok: false, error: "الخادم غير متصل — شغّل API ثم أعد المحاولة" };
  }
  const check = await validateReelVideoFile(file);
  if (!check.ok) return check;

  await ensureApiRuntimeConfig();
  const up = await apiUploadMedia(token, file, {
    timeoutMs: uploadTimeoutMs(file),
    reelVideo: true,
  });
  if (!up.ok) return { ok: false, error: up.error };
  if (!isVideoMediaRef(up.url)) {
    return { ok: false, error: "تعذر معالجة الفيديو — جرّب MP4" };
  }
  return { ok: true, videoUrl: up.url, posterUrl: up.posterUrl };
}

export async function uploadReelCoverImage(
  dataUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!apiBackendEnabled() || !token) {
    return { ok: false, error: "الخادم غير متصل" };
  }
  await ensureApiRuntimeConfig();
  const m = dataUrl.match(/^data:([^;,]+)/);
  const mime = (m?.[1] || "image/jpeg").toLowerCase();
  const b64 = dataUrl.split(",")[1];
  if (!b64) return { ok: false, error: "صورة غلاف غير صالحة" };
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : "jpg";
  const file = new File([buf], `reel-cover.${ext}`, { type: mime });
  const up = await apiUploadMedia(token, file, { timeoutMs: 90_000 });
  if (!up.ok) return { ok: false, error: up.error };
  return { ok: true, url: up.url };
}
