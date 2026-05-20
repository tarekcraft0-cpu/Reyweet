/**
 * يولّد مجلد ios/ عبر Expo Prebuild.
 * ملاحظة: Expo لا يولّد مشروع iOS على Windows — يتطلب macOS أو Linux.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform === "win32") {
  console.log(`
⚠️  توليد مجلد ios/ غير مدعوم على Windows (قيود Expo + Apple).

ما تم تجهيزه على جهازك:
  • mobile/app.config.ts  — إعدادات iOS كاملة
  • mobile/.env           — عناوين API والموقع
  • npm run mobile:sync:public — يحدّث العناوين من النفق

لتثبيت التطبيق على الآيفون بالكابل تحتاج Mac مع Xcode:

  1) انسخ المجلد إلى Mac (أو استخدم نفس المستودع)
  2) ثبّت Xcode من App Store وسجّل Apple ID (مجاني)
  3) وصّل الآيفون وفعّل Developer Mode على iOS 16+
  4) من جذر المشروع على Mac:

     npm run mobile:ios:install

بديل من Windows فقط (بدون كابل — تثبيت عبر رابط EAS):

     cd mobile
     npx eas-cli login
     npx eas-cli device:create
     npx eas-cli build --platform ios --profile personal
`);
  process.exit(0);
}

console.log("\n══ Expo prebuild — iOS ══\n");

const r = spawnSync(
  "npx",
  ["expo", "prebuild", "--platform", "ios", "--clean"],
  {
    cwd: mobileRoot,
    stdio: "inherit",
    shell: true,
    env: process.env,
  },
);

if (r.status !== 0) {
  console.error("\nفشل prebuild. تأكد من: cd mobile && npm install\n");
  process.exit(r.status ?? 1);
}

console.log("\n✓ مجلد ios/ جاهز. ثبّت على الجهاز: npm run ios:device\n");
