import path from "node:path";

function trimEnv(key: string, fallback = ""): string {
  const v = process.env[key];
  return (typeof v === "string" ? v.trim() : "") || fallback;
}

/** جذر التخزين على القرص D — قاعدة البيانات والميديا */
export const DATA_ROOT = path.resolve(trimEnv("DATA_ROOT", "D:/RetweetSocial"));

export const DB_DIR = path.join(DATA_ROOT, "db");
export const MEDIA_DIR = path.join(DATA_ROOT, "media");
export const MEDIA_IMAGES_DIR = path.join(MEDIA_DIR, "images");
export const MEDIA_VIDEOS_DIR = path.join(MEDIA_DIR, "videos");
export const SNAPSHOTS_DIR = path.join(DATA_ROOT, "snapshots");

export const PORT = Number(trimEnv("PORT", "3000"));
export const HOST = trimEnv("HOST", "0.0.0.0");

export const PUBLIC_BASE_URL = trimEnv("PUBLIC_BASE_URL", `http://localhost:${PORT}`);
