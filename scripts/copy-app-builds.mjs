/**
 * Copies IPA/APK into landing/public/downloads/ for the download site.
 *
 * Usage:
 *   node scripts/copy-app-builds.mjs
 *   COPY_IPA_PATH=C:\build\app.ipa COPY_APK_PATH=C:\build\app.apk node scripts/copy-app-builds.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const destDir = path.join(root, "landing", "public", "downloads");

const jobs = [
  { env: "COPY_IPA_PATH", dest: "retweet.ipa" },
  { env: "COPY_APK_PATH", dest: "retweet.apk" },
];

mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const { env, dest } of jobs) {
  const src = process.env[env]?.trim();
  if (!src) continue;
  if (!existsSync(src)) {
    console.error(`copy-app-builds: missing ${env}=${src}`);
    process.exit(1);
  }
  const out = path.join(destDir, dest);
  copyFileSync(src, out);
  console.log(`copy-app-builds: ${dest} ← ${src}`);
  copied++;
}

if (!copied) {
  console.log("copy-app-builds: no COPY_IPA_PATH / COPY_APK_PATH set — skipped.");
  console.log("  Example: COPY_IPA_PATH=C:\\path\\Retweet.ipa node scripts/copy-app-builds.mjs");
}
