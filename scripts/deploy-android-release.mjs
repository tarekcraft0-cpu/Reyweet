/**
 * رفع APK + android-version.json ثم نشر الموقع على Vercel.
 * يزيد versionCode تلقائياً عند كل تشغيل (ما لم يُمرَّر --no-bump).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import {
  bumpAppVersion,
  readAppVersion,
  writeAndroidVersionJson,
  apkDest,
  VERCEL_SITE,
} from "./lib/android-release.mjs";

const root = process.cwd();
const noBump = process.argv.includes("--no-bump");
const skipBuild = process.argv.includes("--skip-build");

console.log("\n══ نشر APK على الموقع + Vercel ══\n");

const ver = noBump ? readAppVersion() : bumpAppVersion({ bumpCode: true });
console.log(`  إصدار: ${ver.version} (versionCode ${ver.versionCode})`);

if (!skipBuild) {
  execSync("node scripts/build-android-apk.mjs", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
} else {
  const apkSizeMb = fs.existsSync(apkDest)
    ? Number((fs.statSync(apkDest).size / (1024 * 1024)).toFixed(1))
    : undefined;
  writeAndroidVersionJson({
    version: ver.version,
    versionCode: ver.versionCode,
    notes: "تحديث ملف الإصدار فقط",
    apkSizeMb,
  });
}

execSync("npm run vercel:deploy", { cwd: root, stdio: "inherit" });

console.log(`
╔════════════════════════════════════════════════════════════╗
║  تم — تحميل أندرويد                                        ║
║  ${VERCEL_SITE}/downloads/retweet.apk
║  المحتوى داخل التطبيق يتحدّث تلقائياً من الموقع عند الفتح.
╚════════════════════════════════════════════════════════════╝
`);
