#!/usr/bin/env node
/**
 * إصلاح مقاطع قديمة على السيرفر:
 * - توحيد روابط /media/ في posts.json و users.json و stories
 * - نقل صورة خاطئة من حقل video → image
 * - تحويل .mov → .mp4 (H.264 + faststart)
 * - إعادة تغ packaging لـ .mp4 بدون faststart
 *
 *   DATA_ROOT=/var/lib/retweet node backend/scripts/repair-legacy-media.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = process.env.DATA_ROOT || path.join(root, "..", "D:/RetweetSocial").replace(/\\/g, "/");
const DB_DIR = path.join(DATA_ROOT, "db");
const VIDEOS_DIR = path.join(DATA_ROOT, "media", "videos");

const STALE_EXTERNAL = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
];

function readJson(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function toRelativeMediaRef(v) {
  const s = String(v ?? "").trim();
  if (!s || s.startsWith("data:") || s.startsWith("blob:")) return s;
  if (s.length <= 4 && !s.startsWith("/") && !/^https?:\/\//i.test(s)) return s;
  const m = s.match(/(\/media\/(?:images|videos)\/[^\s?#"']+)/i);
  if (m) return m[1];
  if (s.startsWith("/media/")) return s.split("?")[0];
  if (STALE_EXTERNAL.includes(s)) return "";
  return s;
}

function rewriteMediaInObject(obj) {
  if (typeof obj === "string") return toRelativeMediaRef(obj);
  if (Array.isArray(obj)) return obj.map(rewriteMediaInObject);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = rewriteMediaInObject(v);
    return out;
  }
  return obj;
}

function fixPostRow(p) {
  let video = toRelativeMediaRef(p.video);
  let image = toRelativeMediaRef(p.image);
  if (video && video.includes("/media/images/")) {
    if (!image || image === "🎬" || image === "🖼️") image = video;
    video = "";
  }
  if (STALE_EXTERNAL.includes(String(p.video || "").trim())) {
    video = "";
    if (!image || image === "🎬") image = "🎬";
  }
  return { ...p, video: video || undefined, image: image || p.image };
}

function hasFastStart(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format_tags=major_brand -of default=nw=1:nk=1 "${filePath}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return /isom|mp42|M4V|avc1/i.test(out);
  } catch {
    return false;
  }
}

function transcodeToMp4(inputPath, outputPath) {
  execSync(
    `ffmpeg -y -i "${inputPath}" -movflags +faststart -vf "scale='min(1280,iw)':-2" -c:v libx264 -preset fast -crf 28 -c:a aac -b:a 96k "${outputPath}"`,
    { stdio: "inherit" },
  );
}

function remuxFaststart(inputPath, outputPath) {
  execSync(`ffmpeg -y -i "${inputPath}" -c copy -movflags +faststart "${outputPath}"`, {
    stdio: "inherit",
  });
}

function basenameFromMediaRef(ref) {
  const m = String(ref || "").match(/\/media\/videos\/([^/?#]+)/i);
  return m?.[1] || "";
}

function replaceVideoRefInDb(dbFiles, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return 0;
  const oldRef = `/media/videos/${oldName}`;
  const newRef = `/media/videos/${newName}`;
  let n = 0;
  for (const file of dbFiles) {
    const p = path.join(DB_DIR, file);
    const raw = readJson(p);
    if (!raw) continue;
    const text = JSON.stringify(raw);
    if (!text.includes(oldRef)) continue;
    const next = JSON.parse(text.replaceAll(oldRef, newRef));
    writeJson(p, next);
    n++;
  }
  return n;
}

function repairVideos() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    console.log("[repair] no videos dir");
    return;
  }
  const dbFiles = fs.readdirSync(DB_DIR).filter(f => f.endsWith(".json"));
  const files = fs.readdirSync(VIDEOS_DIR).filter(f => !f.startsWith("_"));
  let converted = 0;
  let remuxed = 0;

  for (const name of files) {
    const full = path.join(VIDEOS_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    const ext = path.extname(name).toLowerCase();

    if (ext === ".mov" || ext === ".mkv" || ext === ".m4v") {
      const outName = `${path.basename(name, ext)}.mp4`;
      const outPath = path.join(VIDEOS_DIR, outName);
      console.log(`[repair] transcode ${name} → ${outName}`);
      try {
        transcodeToMp4(full, outPath);
        replaceVideoRefInDb(dbFiles, name, outName);
        if (name !== outName) fs.unlinkSync(full);
        converted++;
      } catch (e) {
        console.warn(`[repair] transcode failed ${name}:`, e.message);
      }
      continue;
    }

    if (ext === ".mp4") {
      try {
        const probe = execSync(
          `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${full}"`,
          { encoding: "utf8" },
        ).trim();
        const tmp = path.join(VIDEOS_DIR, `_repair_${name}`);
        if (probe && probe !== "h264") {
          console.log(`[repair] re-encode ${name} (${probe})`);
          transcodeToMp4(full, tmp);
          fs.renameSync(tmp, full);
          converted++;
        } else {
          console.log(`[repair] faststart remux ${name}`);
          remuxFaststart(full, tmp);
          fs.renameSync(tmp, full);
          remuxed++;
        }
      } catch (e) {
        console.warn(`[repair] mp4 repair failed ${name}:`, e.message);
      }
    }
  }
  console.log(`[repair] videos: ${converted} transcoded/re-encoded, ${remuxed} remuxed`);
}

function repairPosts() {
  const postsPath = path.join(DB_DIR, "posts.json");
  const raw = readJson(postsPath);
  if (!raw) return;
  const posts = Array.isArray(raw) ? raw : raw.posts || [];
  const fixed = posts.map(fixPostRow);
  writeJson(postsPath, Array.isArray(raw) ? fixed : { ...raw, posts: fixed });
  console.log(`[repair] posts.json: ${posts.length} rows`);
}

function repairJsonFile(name) {
  const p = path.join(DB_DIR, name);
  const raw = readJson(p);
  if (!raw) return;
  writeJson(p, rewriteMediaInObject(raw));
  console.log(`[repair] ${name}`);
}

function repairSnapshots() {
  const snapDir = path.join(DATA_ROOT, "snapshots");
  if (!fs.existsSync(snapDir)) return;
  let n = 0;
  for (const f of fs.readdirSync(snapDir)) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(snapDir, f);
    try {
      const raw = readJson(p);
      const st = raw?.state ?? raw;
      if (!st) continue;
      if (Array.isArray(st.posts)) st.posts = st.posts.map(fixPostRow);
      const next = raw?.state ? { ...raw, state: rewriteMediaInObject(st) } : rewriteMediaInObject(raw);
      writeJson(p, next);
      n++;
    } catch {
      /* skip */
    }
  }
  console.log(`[repair] snapshots: ${n} files`);
}

console.log(`\n══ إصلاح ميديا قديمة — ${DATA_ROOT} ══\n`);
repairPosts();
for (const f of ["users.json", "stories.json", "messages.json"]) repairJsonFile(f);
repairSnapshots();
repairVideos();
console.log("\n✓ انتهى — أعد تشغيل retweet-api\n");
