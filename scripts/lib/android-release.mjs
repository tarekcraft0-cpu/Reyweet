import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mobileDir = path.join(root, "mobile");
const appConfigPath = path.join(mobileDir, "app.config.ts");
const downloadsDir = path.join(root, "landing", "public", "downloads");
const apkDest = path.join(downloadsDir, "retweet.apk");
const versionFile = path.join(downloadsDir, "android-version.json");
export const VERCEL_SITE = (
  process.env.RETWEET_VERCEL_SITE_URL || "https://reyweet.vercel.app"
).replace(/\/$/, "");

export { root, mobileDir, appConfigPath, downloadsDir, apkDest, versionFile };

export function readAppVersion() {
  const text = fs.readFileSync(appConfigPath, "utf8");
  const version = text.match(/version:\s*"([^"]+)"/)?.[1] || "1.0.0";
  const versionCode = Number(text.match(/versionCode:\s*(\d+)/)?.[1] || "1");
  return { version, versionCode: Number.isFinite(versionCode) ? versionCode : 1 };
}

export function bumpAppVersion({ bumpCode = true } = {}) {
  let text = fs.readFileSync(appConfigPath, "utf8");
  const cur = readAppVersion();
  const nextCode = bumpCode ? cur.versionCode + 1 : cur.versionCode;
  if (!text.includes("versionCode:")) {
    text = text.replace(
      /android:\s*\{/,
      `android: {\n    versionCode: ${nextCode},`,
    );
  } else {
    text = text.replace(/versionCode:\s*\d+/, `versionCode: ${nextCode}`);
  }
  fs.writeFileSync(appConfigPath, text, "utf8");
  return { ...cur, versionCode: nextCode };
}

export function writeAndroidVersionJson({ version, versionCode, notes }) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  const payload = {
    version,
    versionCode,
    apkUrl: `${VERCEL_SITE}/downloads/retweet.apk`,
    releasedAt: new Date().toISOString(),
    notes: notes || "تحديث تطبيق Retweet لأندرويد",
  };
  fs.writeFileSync(versionFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

export function copyApkToDownloads(src) {
  if (!fs.existsSync(src)) throw new Error(`APK not found: ${src}`);
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.copyFileSync(src, apkDest);
  return apkDest;
}

export function findLocalApkArtifact() {
  const candidates = [
    path.join(mobileDir, "dist-apk", "retweet.apk"),
    path.join(mobileDir, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    path.join(mobileDir, "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
  ];
  return candidates.find(p => fs.existsSync(p)) || "";
}
