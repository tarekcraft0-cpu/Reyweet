import { apiBackendEnabled, apiUploadMedia, ensureApiRuntimeConfig, getApiToken } from "./apiBackend";
import { isRenderableMediaUrl, resolveMediaUrl } from "./mediaUrl";
import { isVideoMediaRef } from "./postMedia";

/** يطابق حد multer على الخادم (80MB) مع هامش صغير */
const MAX_STORY_UPLOAD_BYTES = 78 * 1024 * 1024;

let pendingStoryPickFile: File | null = null;

/** اختيار ستوري من الصفحة الرئيسية — يُلتقط عند فتح شاشة الإنشاء */
export function stashPendingStoryFile(file: File | null) {
  pendingStoryPickFile = file;
}

export function takePendingStoryFile(): File | null {
  const f = pendingStoryPickFile;
  pendingStoryPickFile = null;
  return f;
}

async function fileFromDataUrl(dataUrl: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const mime = blob.type || "image/jpeg";
  const ext =
    mime === "image/gif"
      ? "gif"
      : mime === "image/png"
        ? "png"
        : mime.startsWith("video/")
          ? "mp4"
          : "jpg";
  return new File([blob], `story.${ext}`, { type: mime });
}

/** تصغير صور الستوري قبل الرفع (حتى لا تُرفض صور الجوال 8–15 ميجا) */
async function normalizeStoryImageFile(file: File): Promise<File> {
  const isHeic =
    /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (isHeic || (!file.type.startsWith("image/") && !file.type)) {
    try {
      const bitmap = await createImageBitmap(file);
      const maxSide = 1080;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(b => resolve(b), "image/jpeg", 0.88),
      );
      if (blob) return new File([blob], "story.jpg", { type: "image/jpeg" });
    } catch {
      /* fallback to original */
    }
  }
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1080;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const quality = file.size > 3_000_000 ? 0.82 : 0.88;
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), "image/jpeg", quality),
    );
    if (!blob) return file;
    return new File([blob], "story.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function prepareStoryFile(file: File): Promise<File> {
  if (file.type.startsWith("image/")) {
    return normalizeStoryImageFile(file);
  }
  return file;
}

/** حد مدة ستوري فيديو الافتراضي (ثانية) — غير الموثق */
export const MAX_STORY_VIDEO_DURATION_SEC = 60;
export const MAX_STORY_VIDEO_DURATION_UNVERIFIED_SEC = 30;

function uploadTimeoutMs(file: File): number {
  if (file.type.startsWith("video/")) {
    if (file.size > 40 * 1024 * 1024) return 300_000;
    if (file.size > 15 * 1024 * 1024) return 240_000;
    return 180_000;
  }
  if (file.size > 40 * 1024 * 1024) return 180_000;
  if (file.size > 15 * 1024 * 1024) return 120_000;
  return 60_000;
}

/** يتحقق من مدة الفيديو قبل الرفع (حتى دقيقة) */
export async function validateStoryVideoFile(
  file: File,
  maxDurationSec = MAX_STORY_VIDEO_DURATION_SEC,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!file.type.startsWith("video/")) return { ok: true };
  const cap = Math.max(1, Math.min(60, maxDurationSec));
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (result: { ok: true } | { ok: false; error: string }) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > cap + 1) {
        done({
          ok: false,
          error: `مدة الفيديو ${Math.ceil(d)} ثانية — الحد الأقصى ${cap} ثانية.`,
        });
        return;
      }
      done({ ok: true });
    };
    v.onerror = () => done({ ok: true });
    v.src = url;
  });
}

/** رفع ملف ستوري مباشرة (بدون data URL — أسرع وأصغر في الذاكرة) */
export async function uploadStoryFile(
  file: File,
  opts?: { maxVideoDurationSec?: number },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!apiBackendEnabled() || !token) {
    return { ok: false, error: "الخادم غير متصل — شغّل API ثم أعد المحاولة" };
  }

  await ensureApiRuntimeConfig();
  try {
    const durationCheck = await validateStoryVideoFile(
      file,
      opts?.maxVideoDurationSec ?? MAX_STORY_VIDEO_DURATION_SEC,
    );
    if (!durationCheck.ok) return durationCheck;

    let prepared = await prepareStoryFile(file);
    if (prepared.size > MAX_STORY_UPLOAD_BYTES) {
      const mb = (prepared.size / (1024 * 1024)).toFixed(0);
      return {
        ok: false,
        error: `الملف ${mb} ميجا — الحد الأقصى 78 ميجا. جرّب قصّ الفيديو أو صورة أخف.`,
      };
    }
    const up = await apiUploadMedia(token, prepared, {
      timeoutMs: uploadTimeoutMs(prepared),
      storyVideo: prepared.type.startsWith("video/"),
    });
    if (!up.ok) return { ok: false, error: up.error };
    return { ok: true, url: up.url };
  } catch {
    return {
      ok: false,
      error: "تعذر رفع الستوري — الخادم غير متصل. شغّل npm run api:tunnel على جهازك",
    };
  }
}

/** يحوّل data URL إلى رابط خادم إن أمكن — يقلّل فشل الحفظ والمزامنة */
export async function resolveStoryMediaForSave(
  media: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const t = media?.trim() || "";
  if (!t || t === "📷") return { ok: false, error: "اختر صورة أو فيديو للستوري" };
  if (t.startsWith("blob:")) {
    try {
      const res = await fetch(t);
      const blob = await res.blob();
      const ext = blob.type.startsWith("video/") ? "mp4" : "jpg";
      const file = new File([blob], `story.${ext}`, { type: blob.type || "application/octet-stream" });
      return uploadStoryFile(file);
    } catch {
      return { ok: false, error: "أعد اختيار الملف من زر الإرفاق" };
    }
  }
  if (!t.startsWith("data:")) {
    return { ok: true, url: t };
  }

  const token = getApiToken();
  if (!apiBackendEnabled() || !token) return { ok: true, url: t };

  await ensureApiRuntimeConfig();
  try {
    const file = await fileFromDataUrl(t);
    return uploadStoryFile(file);
  } catch {
    return {
      ok: false,
      error: "تعذر رفع الستوري — الخادم غير متصل. شغّل npm run api:tunnel على جهازك",
    };
  }
}

export function storyPayloadFromUrl(url: string): { image: string; video?: string } {
  if (isVideoMediaRef(url)) return { image: "🎬", video: url };
  return { image: url };
}

export type NormalizedStoryMedia = {
  imageUrl: string;
  videoUrl: string;
  hasVideo: boolean;
  hasImage: boolean;
  emojiFallback: string;
};

/** يحوّل مسارات /media/... إلى رابط API كامل للعرض على Vercel */
/** صورة مصغّرة لشبكة أرشيف القصص */
export function storyArchiveThumbnailUrl(story: { image?: string; video?: string }): string | null {
  const media = normalizeStoryMedia(story);
  if (media.hasImage) return media.imageUrl;
  if (media.hasVideo && media.imageUrl) return media.imageUrl;
  return null;
}

export function normalizeStoryMedia(story: { image?: string; video?: string }): NormalizedStoryMedia {
  const imageRaw = story.image?.trim() || "";
  const videoRaw = story.video?.trim() || "";
  const videoUrl = videoRaw ? resolveMediaUrl(videoRaw) : "";
  const imageUrl =
    imageRaw && !isVideoMediaRef(imageRaw) ? resolveMediaUrl(imageRaw) : "";
  const hasVideo = !!videoUrl && isRenderableMediaUrl(videoUrl);
  const hasImage = !!imageUrl && isRenderableMediaUrl(imageUrl);
  const emojiFallback =
    !hasVideo && !hasImage
      ? imageRaw || (videoRaw && !isVideoMediaRef(videoRaw) ? videoRaw : "")
      : "";
  return { imageUrl, videoUrl, hasVideo, hasImage, emojiFallback };
}

/** رفع فيديو/صورة منشور أو ريلز قبل الحفظ */
export const resolvePostMediaForSave = resolveStoryMediaForSave;
