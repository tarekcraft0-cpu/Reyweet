/**
 * بناء ملف IPA من Windows عبر EAS (مجاني — Apple ID شخصي، ليس برنامج 99$).
 * الناتج: ملف .ipa للتثبيت عبر Sideloadly / AltStore على الآيفون.
 *
 * المتطلبات (مرة واحدة على https://expo.dev):
 *   - EXPO_TOKEN
 *   - ربط Apple ID مجاني: projects/retweet-mobile/credentials
 *   - تسجيل الآيفون: accounts/tareqg123/settings/apple-devices
 *
 * شغّل: npm run mobile:ipa:build
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobile = path.join(root, "mobile");
const outDir = path.join(mobile, "dist-ipa");

function run(cmd, args, cwd = mobile) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("\n══ Retweet — بناء IPA للتثبيت الخارجي (Sideloadly) ══\n");

if (!process.env.EXPO_TOKEN?.trim()) {
  console.error(`❌ عيّن EXPO_TOKEN:
  $env:EXPO_TOKEN = "your-token"
  npm run mobile:ipa:build
`);
  process.exit(1);
}

console.log("1) مزامنة روابط API + الواجهة مع السيرفر (قاعدة D:)…");
execSync("node scripts/sync-mobile-ios.mjs --public", { cwd: root, stdio: "inherit" });

console.log("\n2) التحقق من الحساب…");
run("npx", ["eas-cli", "whoami"]);

console.log("\n3) رفع البناء إلى EAS (profile: sideload ≈ Release للجهاز الحقيقي)…");
console.log("   ملاحظة: لا يمكن توليد IPA محلياً على Windows بدون Mac — EAS السحابة هو المسار.\n");

run("npx", [
  "eas-cli",
  "build",
  "--platform",
  "ios",
  "--profile",
  "sideload",
  "--non-interactive",
]);

fs.mkdirSync(outDir, { recursive: true });
const info = `# IPA — Retweet
بعد اكتمال البناء:
1) افتح https://expo.dev/accounts/tareqg123/projects/retweet-mobile/builds
2) حمّل آخر build ناجح (ملف .ipa)
3) Sideloadly: وصّل الآيفون → اختر IPA → Apple ID مجاني → Start

أو: npm run mobile:ipa:download

السيرفر يجب أن يبقى شغّالاً: npm run public:relaunch
`;
fs.writeFileSync(path.join(outDir, "README-SIDELOAD.txt"), info, "utf8");

console.log(`
4) عند اكتمال البناء:
   • لوحة التحكم: https://expo.dev/accounts/tareqg123/projects/retweet-mobile/builds
   • أو: npm run mobile:ipa:download

5) Sideloadly (Windows + كابل):
   • حمّل من https://sideloadly.io
   • IPA + Apple ID المجاني + وصّل الآيفون
   • التوقيع يتجدد كل 7 أيام (حد 3 تطبيقات)

تنبيه: profile "simulator" لا يعمل على آيفون حقيقي — استخدم "sideload" فقط.
`);
