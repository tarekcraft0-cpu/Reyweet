import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { MEDIA_IMAGES_DIR, MEDIA_VIDEOS_DIR, PUBLIC_BASE_URL } from "../config.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i;

const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".webm"]);

export function isDataUrl(s: string): boolean {
  return s.startsWith("data:") && s.includes("base64,");
}

function mediaPublicUrl(kind: "images" | "videos", filename: string): string {
  return `/media/${kind}/${filename}`;
}

function imageExtFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

/** حفظ فيديو بدون إعادة ترميز (احتياطي عند فشل ffmpeg) */
export async function saveVideoFile(inputPath: string): Promise<{ url: string; path: string }> {
  await fs.mkdir(MEDIA_VIDEOS_DIR, { recursive: true });
  let ext = path.extname(inputPath).toLowerCase();
  if (!VIDEO_EXT.has(ext)) ext = ".mp4";
  const outName = `${randomUUID()}${ext}`;
  const outPath = path.join(MEDIA_VIDEOS_DIR, outName);
  await fs.copyFile(inputPath, outPath);
  return { url: mediaPublicUrl("videos", outName), path: outPath };
}

/** حفظ صوت بدون إعادة ترميز */
export async function saveAudioFile(inputPath: string): Promise<{ url: string; path: string }> {
  await fs.mkdir(MEDIA_VIDEOS_DIR, { recursive: true });
  let ext = path.extname(inputPath).toLowerCase();
  if (!AUDIO_EXT.has(ext)) ext = ".mp3";
  const outName = `${randomUUID()}${ext}`;
  const outPath = path.join(MEDIA_VIDEOS_DIR, outName);
  await fs.copyFile(inputPath, outPath);
  return { url: mediaPublicUrl("videos", outName), path: outPath };
}

/** رفع صورة/أفتار — يحافظ على GIF المتحرك */
export async function saveUploadedImage(
  input: Buffer,
  mime: string,
): Promise<{ url: string; path: string; kind: "image" | "gif" }> {
  const m = (mime || "").toLowerCase();
  await fs.mkdir(MEDIA_IMAGES_DIR, { recursive: true });
  const id = randomUUID();

  if (m === "image/gif") {
    const outName = `${id}.gif`;
    const outPath = path.join(MEDIA_IMAGES_DIR, outName);
    try {
      await sharp(input, { animated: true })
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .gif()
        .toFile(outPath);
    } catch {
      await fs.writeFile(outPath, input);
    }
    return { url: mediaPublicUrl("images", outName), path: outPath, kind: "gif" };
  }

  try {
    const { url, path: outPath } = await compressAndSaveImage(input, imageExtFromMime(m));
    return { url, path: outPath, kind: "image" };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[media] image compress failed, saving original", e);
    const ext = imageExtFromMime(m);
    const outName = `${id}.${ext}`;
    const outPath = path.join(MEDIA_IMAGES_DIR, outName);
    await fs.writeFile(outPath, input);
    return { url: mediaPublicUrl("images", outName), path: outPath, kind: "image" };
  }
}

/** ضغط صورة من buffer وإرجاع المسار العام */
export async function compressAndSaveImage(
  input: Buffer,
  extHint = "jpg",
): Promise<{ url: string; path: string }> {
  await fs.mkdir(MEDIA_IMAGES_DIR, { recursive: true });
  const id = randomUUID();
  const outName = `${id}.webp`;
  const outPath = path.join(MEDIA_IMAGES_DIR, outName);

  await sharp(input)
    .rotate()
    .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(outPath);

  return { url: mediaPublicUrl("images", outName), path: outPath };
}

/** ضغط فيديو عبر ffmpeg (H.264 + AAC) — مع احتياطي بدون ترميز */
export async function compressAndSaveVideo(
  inputPath: string,
): Promise<{ url: string; path: string }> {
  await fs.mkdir(MEDIA_VIDEOS_DIR, { recursive: true });
  const id = randomUUID();
  const outName = `${id}.mp4`;
  const outPath = path.join(MEDIA_VIDEOS_DIR, outName);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          "-y",
          "-movflags",
          "+faststart",
          "-vf",
          "scale='min(1280,iw)':-2",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "28",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
        ])
        .on("end", () => resolve())
        .on("error", err => reject(err))
        .save(outPath);
    });
    return { url: mediaPublicUrl("videos", outName), path: outPath };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[media] ffmpeg compress failed, saving original file", e);
    await fs.unlink(outPath).catch(() => undefined);
    return saveVideoFile(inputPath);
  }
}

export async function processDataUrl(dataUrl: string): Promise<string> {
  const m = dataUrl.match(DATA_URL_RE);
  if (!m) return dataUrl;
  const mime = (m[1] || "application/octet-stream").toLowerCase();
  const b64 = m[2]!;
  const buf = Buffer.from(b64, "base64");

  if (mime.startsWith("image/")) {
    const { url } = await saveUploadedImage(buf, mime);
    return url;
  }

  if (mime.startsWith("video/")) {
    const tmpDir = path.join(MEDIA_VIDEOS_DIR, "_tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const ext = mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : "mp4";
    const tmpIn = path.join(tmpDir, `${randomUUID()}.${ext}`);
    await fs.writeFile(tmpIn, buf);
    try {
      const { url } = await compressAndSaveVideo(tmpIn);
      return url;
    } finally {
      await fs.unlink(tmpIn).catch(() => undefined);
    }
  }

  if (mime.startsWith("audio/")) {
    const tmpDir = path.join(MEDIA_VIDEOS_DIR, "_tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const ext = mime.includes("wav")
      ? "wav"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("aac")
          ? "aac"
          : mime.includes("m4a")
            ? "m4a"
            : "mp3";
    const tmpIn = path.join(tmpDir, `${randomUUID()}.${ext}`);
    await fs.writeFile(tmpIn, buf);
    try {
      const { url } = await saveAudioFile(tmpIn);
      return url;
    } finally {
      await fs.unlink(tmpIn).catch(() => undefined);
    }
  }

  return dataUrl;
}

/** يمر على كائن JSON ويستبدل روابط data: بملفات مضغوطة على القرص D */
export async function rewriteDataUrlsInValue(value: unknown): Promise<unknown> {
  if (typeof value === "string") {
    if (isDataUrl(value) && value.length > 200) {
      try {
        return await processDataUrl(value);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[media] compress failed, keeping original", e);
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) out.push(await rewriteDataUrlsInValue(item));
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await rewriteDataUrlsInValue(v);
    }
    return out;
  }
  return value;
}
