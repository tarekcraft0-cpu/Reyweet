import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DATA_ROOT, MEDIA_IMAGES_DIR, MEDIA_VIDEOS_DIR, UPLOADS_DIR } from "../config.js";
import { scanProhibitedText } from "./prohibitedText.js";
import type { ContentViolationDetail } from "./contentAutoBan.js";

export type ContentCheckItem =
  | { kind: "text"; value: string | undefined | null }
  | { kind: "image_buffer"; buffer: Buffer; mime?: string }
  | { kind: "image_ref"; ref: string | undefined | null }
  | { kind: "video_buffer"; buffer: Buffer; mime?: string };

function skinRatioRgb(r: number, g: number, b: number): boolean {
  return r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && r > g && r > b;
}

async function localImageNudityHeuristic(buffer: Buffer): Promise<number | null> {
  try {
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width < 48 || info.height < 48) return null;
    let skin = 0;
    const pixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 3) {
      if (skinRatioRgb(data[i]!, data[i + 1]!, data[i + 2]!)) skin++;
    }
    return skin / pixels;
  } catch {
    return null;
  }
}

async function sightengineImageCheck(buffer: Buffer): Promise<ContentViolationDetail | null> {
  const apiUser = process.env.SIGHTENGINE_API_USER?.trim();
  const apiSecret = process.env.SIGHTENGINE_API_SECRET?.trim();
  if (!apiUser || !apiSecret) return null;

  const form = new FormData();
  form.append("media", new Blob([buffer], { type: "image/jpeg" }), "upload.jpg");
  form.append("models", "nudity,wad,offensive,gore");
  form.append("api_user", apiUser);
  form.append("api_secret", apiSecret);

  try {
    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      nudity?: { raw?: number; partial?: number; sexual_activity?: number };
      offensive?: { prob?: number };
      gore?: { prob?: number };
      status?: string;
    };
    if (!res.ok || data.status === "failure") return null;
    const raw = data.nudity?.raw ?? 0;
    const partial = data.nudity?.partial ?? 0;
    const sexual = data.nudity?.sexual_activity ?? 0;
    const offensive = data.offensive?.prob ?? 0;
    const gore = data.gore?.prob ?? 0;
    if (raw >= 0.65 || partial >= 0.82 || sexual >= 0.55 || gore >= 0.7 || offensive >= 0.85) {
      return {
        code: "explicit_image",
        context: "sightengine",
        snippet: `raw=${raw.toFixed(2)} partial=${partial.toFixed(2)}`,
      };
    }
    return null;
  } catch (e) {
    console.warn("[content-guard] sightengine failed", e);
    return null;
  }
}

async function scanImageBuffer(buffer: Buffer): Promise<ContentViolationDetail | null> {
  const apiHit = await sightengineImageCheck(buffer);
  if (apiHit) return apiHit;

  const skinThreshold = Number(process.env.CONTENT_SKIN_RATIO_THRESHOLD || "0.52");
  const ratio = await localImageNudityHeuristic(buffer);
  if (ratio != null && ratio >= skinThreshold) {
    return {
      code: "explicit_image_heuristic",
      context: "local_scan",
      snippet: `skin_ratio=${ratio.toFixed(2)}`,
    };
  }
  return null;
}

async function readMediaRef(ref: string): Promise<Buffer | null> {
  const t = ref.trim();
  if (!t || t.startsWith("data:")) return null;
  let filePath: string | null = null;
  if (t.startsWith("/media/images/")) {
    filePath = path.join(MEDIA_IMAGES_DIR, path.basename(t));
  } else if (t.startsWith("/media/videos/")) {
    filePath = path.join(MEDIA_VIDEOS_DIR, path.basename(t));
  } else if (t.startsWith("/uploads/")) {
    filePath = path.join(UPLOADS_DIR, t.replace(/^\/uploads\//, ""));
  } else if (t.startsWith("http") && t.includes("/media/")) {
    try {
      const u = new URL(t);
      const p = u.pathname;
      if (p.startsWith("/media/images/")) filePath = path.join(MEDIA_IMAGES_DIR, path.basename(p));
      else if (p.startsWith("/media/videos/")) filePath = path.join(MEDIA_VIDEOS_DIR, path.basename(p));
      else if (p.startsWith("/uploads/")) filePath = path.join(UPLOADS_DIR, p.replace(/^\/uploads\//, ""));
    } catch {
      return null;
    }
  }
  if (!filePath) return null;
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

function parseDataUrlImage(dataUrl: string): Buffer | null {
  const m = dataUrl.match(/^data:image\/[a-z0-9+.-]+;base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[1]!, "base64");
  } catch {
    return null;
  }
}

async function scanImageRef(ref: string | undefined | null): Promise<ContentViolationDetail | null> {
  const t = (ref ?? "").trim();
  if (!t) return null;
  if (t.startsWith("data:image")) {
    const buf = parseDataUrlImage(t);
    return buf ? scanImageBuffer(buf) : null;
  }
  const buf = await readMediaRef(t);
  return buf ? scanImageBuffer(buf) : null;
}

async function extractVideoFrame(buffer: Buffer, ext: string): Promise<Buffer | null> {
  const tmpDir = path.join(MEDIA_VIDEOS_DIR, "_tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const stamp = Date.now();
  const tmpIn = path.join(tmpDir, `scan-${stamp}.${ext || "mp4"}`);
  const tmpOut = path.join(tmpDir, `scan-${stamp}.jpg`);
  try {
    await fs.writeFile(tmpIn, buffer);
    const ffmpeg = (await import("@ffmpeg-installer/ffmpeg")).default.path;
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "00:00:01",
        "-i",
        tmpIn,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        "-y",
        tmpOut,
      ]);
      p.on("error", reject);
      p.on("close", code => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
    });
    return await fs.readFile(tmpOut);
  } catch {
    return null;
  } finally {
    await fs.unlink(tmpIn).catch(() => undefined);
    await fs.unlink(tmpOut).catch(() => undefined);
  }
}

export async function scanContentItem(
  item: ContentCheckItem,
  context: string,
): Promise<ContentViolationDetail | null> {
  if (item.kind === "text") {
    const hit = scanProhibitedText(item.value);
    return hit ? { code: hit.code, context, snippet: hit.snippet } : null;
  }
  if (item.kind === "image_buffer") {
    const hit = await scanImageBuffer(item.buffer);
    return hit ? { ...hit, context } : null;
  }
  if (item.kind === "image_ref") {
    const hit = await scanImageRef(item.ref);
    return hit ? { ...hit, context } : null;
  }
  if (item.kind === "video_buffer") {
    const ext =
      item.mime?.includes("webm") ? "webm" : item.mime?.includes("quicktime") ? "mov" : "mp4";
    const frame = await extractVideoFrame(item.buffer, ext);
    if (!frame) return null;
    const hit = await scanImageBuffer(frame);
    return hit ? { ...hit, context: `${context}:video_frame` } : null;
  }
  return null;
}

export async function scanContentBundle(
  userId: string,
  items: ContentCheckItem[],
  context: string,
): Promise<ContentViolationDetail | null> {
  void userId;
  for (const item of items) {
    const hit = await scanContentItem(item, context);
    if (hit) return hit;
  }
  return null;
}
