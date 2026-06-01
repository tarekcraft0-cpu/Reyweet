import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import {
  REEL_HEIGHT,
  REEL_MAX_FPS,
  REEL_MIN_FPS,
  REEL_VIDEO_BITRATE,
  REEL_VIDEO_BUFSIZE,
  REEL_VIDEO_MAXRATE,
  REEL_WIDTH,
} from "../../../src/lib/reelsSpec.js";
import {
  MEDIA_IMAGES_DIR,
  MEDIA_VIDEOS_DIR,
  REELS_THUMBNAILS_DIR,
  REELS_UPLOAD_DIR,
} from "../config.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function mediaPublicUrl(kind: "images" | "videos", filename: string): string {
  return `/media/${kind}/${filename}`;
}

/** قص ذكي مركزي إلى 9:16 ثم 1080×1920 */
const REEL_SCALE_CROP_VF = `scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=increase,crop=${REEL_WIDTH}:${REEL_HEIGHT}`;

/** غلاف مربع 1:1 من منتصف الإطار */
const REEL_POSTER_VF = `scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080`;

function probeVideoFps(inputPath: string): Promise<number> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err || !data?.streams) {
        resolve(REEL_MIN_FPS);
        return;
      }
      const vs = data.streams.find(s => s.codec_type === "video");
      const r = vs?.r_frame_rate || vs?.avg_frame_rate;
      if (!r || typeof r !== "string" || !r.includes("/")) {
        resolve(REEL_MIN_FPS);
        return;
      }
      const [num, den] = r.split("/").map(Number);
      if (!den || !num) {
        resolve(REEL_MIN_FPS);
        return;
      }
      const fps = num / den;
      if (fps >= 50) resolve(REEL_MAX_FPS);
      else if (fps >= REEL_MIN_FPS) resolve(Math.round(fps));
      else resolve(REEL_MIN_FPS);
    });
  });
}

export type ReelVideoStorageTarget = "media" | "uploads";

function reelOutputDirs(target: ReelVideoStorageTarget) {
  if (target === "uploads") {
    return {
      videosDir: REELS_UPLOAD_DIR,
      postersDir: REELS_THUMBNAILS_DIR,
      videoUrl: (name: string) => `/uploads/reels/${name}`,
      posterUrl: (name: string) => `/uploads/reels/thumbnails/${name}`,
    };
  }
  return {
    videosDir: MEDIA_VIDEOS_DIR,
    postersDir: MEDIA_IMAGES_DIR,
    videoUrl: (name: string) => mediaPublicUrl("videos", name),
    posterUrl: (name: string) => mediaPublicUrl("images", name),
  };
}

/** ترميز ريل: MP4 H.264 + AAC، 1080×1920، 30–60fps، ~8–12 Mbps */
export async function compressAndSaveReelVideo(
  inputPath: string,
  target: ReelVideoStorageTarget = "media",
): Promise<{ url: string; path: string; posterUrl: string; posterPath: string }> {
  const dirs = reelOutputDirs(target);
  await fs.mkdir(dirs.videosDir, { recursive: true });
  await fs.mkdir(dirs.postersDir, { recursive: true });

  const id = randomUUID();
  const outName = `${id}.mp4`;
  const outPath = path.join(dirs.videosDir, outName);
  const posterName = `${id}-cover.webp`;
  const posterPath = path.join(dirs.postersDir, posterName);

  const targetFps = await probeVideoFps(inputPath);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-y",
        "-movflags",
        "+faststart",
        "-vf",
        REEL_SCALE_CROP_VF,
        "-r",
        String(targetFps),
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        REEL_VIDEO_BITRATE,
        "-maxrate",
        REEL_VIDEO_MAXRATE,
        "-bufsize",
        REEL_VIDEO_BUFSIZE,
        "-preset",
        "fast",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
      ])
      .on("end", () => resolve())
      .on("error", err => reject(err))
      .save(outPath);
  });

  const posterTmp = path.join(dirs.videosDir, "_tmp", `${id}-poster.jpg`);
  await fs.mkdir(path.dirname(posterTmp), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(1)
      .outputOptions(["-y", "-vframes", "1", "-vf", REEL_POSTER_VF])
      .on("end", () => resolve())
      .on("error", err => reject(err))
      .save(posterTmp);
  });

  try {
    await sharp(posterTmp).webp({ quality: 85, effort: 4 }).toFile(posterPath);
  } finally {
    await fs.unlink(posterTmp).catch(() => undefined);
  }

  return {
    url: dirs.videoUrl(outName),
    path: outPath,
    posterUrl: dirs.posterUrl(posterName),
    posterPath,
  };
}
