import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const downloadsDir = path.join(root, "landing", "public", "downloads");
const apkDest = path.join(downloadsDir, "retweet.apk");
const apkPkgDest = path.join(downloadsDir, "reyweet-android.pkg");
const versionFile = path.join(downloadsDir, "android-version.json");
const gradleFile = path.join(root, "android", "app", "build.gradle");
const gradleKts = path.join(root, "android", "app", "build.gradle.kts");

export const VERCEL_SITE = (
  process.env.RETWEET_VERCEL_SITE_URL || "https://reyweet.vercel.app"
).replace(/\/$/, "");

export { root, downloadsDir, apkDest, apkPkgDest, versionFile };

export function readAppVersion() {
  if (fs.existsSync(versionFile)) {
    try {
      const j = JSON.parse(fs.readFileSync(versionFile, "utf8"));
      return {
        version: j.version || "1.0.0",
        versionCode: Number(j.versionCode) || 1,
      };
    } catch {
      /* fall through */
    }
  }
  for (const gf of [gradleFile, gradleKts]) {
    if (!fs.existsSync(gf)) continue;
    const text = fs.readFileSync(gf, "utf8");
    const version = text.match(/versionName\s*=?\s*["']([^"']+)["']/)?.[1] || "1.0.0";
    const versionCode = Number(text.match(/versionCode\s*=?\s*(\d+)/)?.[1] || "1");
    return { version, versionCode: Number.isFinite(versionCode) ? versionCode : 1 };
  }
  return { version: "1.0.0", versionCode: 1 };
}

export function bumpAppVersion({ bumpCode = true } = {}) {
  const cur = readAppVersion();
  const nextCode = bumpCode ? cur.versionCode + 1 : cur.versionCode;
  const parts = cur.version.split(".").map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (bumpCode) parts[2] = (parts[2] || 0) + 1;
  const nextVersion = parts.join(".");
  patchGradleVersion(nextVersion, nextCode);
  return { version: nextVersion, versionCode: nextCode };
}

function patchGradleVersion(version, versionCode) {
  for (const gf of [gradleFile, gradleKts]) {
    if (!fs.existsSync(gf)) continue;
    let text = fs.readFileSync(gf, "utf8");
    if (/versionCode\s*=?\s*\d+/.test(text)) {
      text = text.replace(/versionCode\s*=?\s*\d+/, `versionCode ${versionCode}`);
    }
    if (/versionName\s*=?\s*["']/.test(text)) {
      text = text.replace(/versionName\s*=?\s*["'][^"']*["']/, `versionName "${version}"`);
    }
    fs.writeFileSync(gf, text, "utf8");
  }
}

export function writeAndroidVersionJson({ version, versionCode, notes, apkSizeMb }) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  const payload = {
    version,
    versionCode,
    apkUrl: `${VERCEL_SITE}/downloads/reyweet-android.pkg`,
    apkUrlLegacy: `${VERCEL_SITE}/downloads/retweet.apk`,
    releasedAt: new Date().toISOString(),
    notes: notes || "تحديث تطبيق Reyweet لأندرويد — نفس الموقع والخادم",
    ...(apkSizeMb != null ? { apkSizeMb } : {}),
  };
  writeFileSync(versionFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

function writeFileSync(p, data) {
  fs.writeFileSync(p, data, "utf8");
}

export function copyApkToDownloads(src) {
  if (!fs.existsSync(src)) throw new Error(`APK not found: ${src}`);
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.copyFileSync(src, apkDest);
  fs.copyFileSync(src, apkPkgDest);
  return apkDest;
}

export function findLocalApkArtifact() {
  const candidates = [
    apkDest,
    path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
    path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
  ];
  return candidates.find(p => fs.existsSync(p)) || "";
}
