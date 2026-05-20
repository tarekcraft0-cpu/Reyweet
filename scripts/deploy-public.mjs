/**
 * نشر سريع: بناء SPA + نسخ إلى _vercel_site (الخادم/النفق الشغّال يخدم الملفات فوراً).
 * للإطلاق من الصفر (نفق جديد): npm run public:relaunch
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");

console.log(full ? "\n══ نشر كامل (بناء + نفق جديد) ══\n" : "\n══ نشر سريع (موقع + تطبيق ويب) ══\n");

if (full) {
  execSync("node scripts/relaunch-public.mjs", { cwd: root, stdio: "inherit" });
  process.exit(0);
}

execSync("npm run build:spa", { cwd: root, stdio: "inherit" });
process.env.RETWEET_SAME_ORIGIN = "1";
execSync("node scripts/prepare-vercel-static.mjs", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (fs.existsSync(path.join(root, "PUBLIC_TUNNEL_URL.txt"))) {
  try {
    execSync("node scripts/sync-mobile-ios.mjs --public", { cwd: root, stdio: "inherit" });
  } catch {
    /* optional */
  }
}

const tunnel = path.join(root, "PUBLIC_TUNNEL_URL.txt");
if (fs.existsSync(tunnel)) {
  const url = fs.readFileSync(tunnel, "utf8").split(/\r?\n/).find(l => l.trim())?.trim();
  if (url) {
    console.log(`\n✓ منشور — حدّث الصفحة:\n  ${url}/app/\n`);
  }
} else {
  console.log("\n✓ منشور محلياً — شغّل: npm run public:relaunch للرابط العام\n");
}
