/**
 * رفع APK + android-version.json ثم نشر الموقع على Vercel.
 * يزيد versionCode تلقائياً عند كل تشغيل (ما لم يُمرَّر --no-bump).
 */
import { execSync } from "node:child_process";
import {
  bumpAppVersion,
  readAppVersion,
  writeAndroidVersionJson,
  VERCEL_SITE,
} from "./lib/android-release.mjs";

const root = process.cwd();
const noBump = process.argv.includes("--no-bump");
const skipBuild = process.argv.includes("--skip-build");

console.log("\n══ نشر APK على الموقع + Vercel ══\n");

const ver = noBump ? readAppVersion() : bumpAppVersion({ bumpCode: true });
console.log(`  إصدار: ${ver.version} (versionCode ${ver.versionCode})`);

if (!skipBuild) {
  const buildScript = process.env.EXPO_TOKEN?.trim()
    ? "node scripts/build-android-apk.mjs --eas"
    : "node scripts/build-android-apk.mjs";
  execSync(buildScript, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
} else {
  writeAndroidVersionJson({
    version: ver.version,
    versionCode: ver.versionCode,
    notes: "تحديث ملف الإصدار فقط",
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
