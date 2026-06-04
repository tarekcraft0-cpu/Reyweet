/**
 * يتحقق أن حزمة Android Capacitor جاهزة للإنتاج.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const BAD_HOST = /localhost|127\.0\.0\.1|10\.0\.2\.2/i;
const BAD_ASSET = /\/app\/assets\//;

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function fail(msg) {
  console.error(`\n✗ verify-android-api-bundle: ${msg}\n`);
  process.exit(1);
}

const paths = [
  path.join(root, "android", "app", "src", "main", "assets", "public", "index.html"),
  path.join(root, "dist", "index.html"),
  path.join(root, "spa-dist", "index.html"),
];

let checked = 0;
for (const p of paths) {
  const html = read(p);
  if (!html) continue;
  checked++;
  const rel = path.relative(root, p);
  if (BAD_ASSET.test(html)) {
    fail(`${rel} يحتوي "/app/assets/" — أعد prepare-capacitor-android`);
  }
  if (BAD_HOST.test(html) && html.includes("__RETWEET_API_URL__")) {
    const m = html.match(/__RETWEET_API_URL__\s*=\s*([^;]+)/);
    if (m && BAD_HOST.test(m[1])) {
      fail(`${rel} يحقن API محلي — استخدم ${VERCEL_SITE_URL}`);
    }
  }
  if (!html.includes("__RETWEET_NATIVE_SHELL__")) {
    fail(`${rel} بدون __RETWEET_NATIVE_SHELL__ — شغّل prepare-capacitor-android`);
  }
  if (!html.includes("__RETWEET_APP_BUILD__")) {
    fail(`${rel} بدون __RETWEET_APP_BUILD__ — أعد البناء`);
  }
  const cfg = path.join(path.dirname(p), "web-auth-config.json");
  if (fs.existsSync(cfg)) {
    try {
      const j = JSON.parse(read(cfg));
      const u = String(j.apiUrl || "");
      if (!u.startsWith("https://") || BAD_HOST.test(u)) {
        fail(`${path.relative(root, cfg)} apiUrl غير صالح: ${u || "(فارغ)"}`);
      }
    } catch {
      fail(`تعذر قراءة ${path.relative(root, cfg)}`);
    }
  }
}

if (checked === 0) {
  fail("لم يُعثر على index.html — نفّذ prepare-capacitor-android أولاً");
}

console.log(`✓ verify-android-api-bundle: ${checked} ملف(ات) (API → ${VERCEL_SITE_URL})`);
