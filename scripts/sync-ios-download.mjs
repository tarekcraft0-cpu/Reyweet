/**
 * ينسخ IPA إلى صفحة التحميل، يحدّث manifest.plist و ios-version.json.
 *
 *   COPY_IPA_PATH="C:\path\Retweet.ipa" node scripts/sync-ios-download.mjs
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const iosIpa = path.join(root, "ios", "build", "Reyweet-ready.ipa");
const downloadsIpa = path.join(root, "landing", "public", "downloads", "retweet.ipa");
const src =
  process.env.COPY_IPA_PATH?.trim() ||
  (existsSync(iosIpa) ? iosIpa : existsSync(downloadsIpa) ? downloadsIpa : "");
const downloads = path.join(root, "landing", "public", "downloads");
const destIpa = path.join(downloads, "retweet.ipa");

if (!src || !existsSync(src)) {
  console.error("sync-ios-download: run npm run ios:package or set COPY_IPA_PATH");
  process.exit(1);
}

mkdirSync(downloads, { recursive: true });
copyFileSync(src, destIpa);
const mb = (statSync(destIpa).size / (1024 * 1024)).toFixed(1);
console.log(`  ✓ retweet.ipa (${mb} MB) ← ${src}`);

const version = {
  version: process.env.IOS_BUNDLE_VERSION?.trim() || "1.0.0",
  bundleId: process.env.IOS_BUNDLE_ID?.trim() || "com.reyweet.app",
  title: process.env.IOS_APP_TITLE?.trim() || "Reyweet",
  signed: process.env.IOS_IPA_SIGNED === "1",
  installMethod: process.env.IOS_IPA_SIGNED === "1" ? "ota" : "sideloadly",
  ipaUrl: "https://reyweet.vercel.app/downloads/retweet.ipa",
  manifestUrl: "https://reyweet.vercel.app/downloads/manifest.plist",
  webAppUrl: "https://reyweet.vercel.app/app/",
  builtAt: new Date().toISOString(),
};
writeFileSync(
  path.join(downloads, "ios-version.json"),
  JSON.stringify(version, null, 2) + "\n",
  "utf8",
);
console.log("  ✓ ios-version.json");

const manifestRun = spawnSync(
  process.execPath,
  [path.join(root, "landing", "scripts", "write-manifest.mjs")],
  { cwd: root, stdio: "inherit", env: { ...process.env, ...version } },
);
if (manifestRun.status !== 0) process.exit(manifestRun.status ?? 1);
