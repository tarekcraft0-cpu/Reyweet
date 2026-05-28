/**
 * يتحقق أن حزمة Capacitor جاهزة للإنتاج — لا localhost ولا مسارات /app/assets.
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
  console.error(`\n✗ verify-ios-api-bundle: ${msg}\n`);
  process.exit(1);
}

/** Production gate: iOS bundle first, then dist (spa-dist may be stale between builds). */
const paths = [
  path.join(root, "ios", "App", "App", "public", "index.html"),
  path.join(root, "dist", "index.html"),
];

let checked = 0;
for (const p of paths) {
  const html = read(p);
  if (!html) continue;
  checked++;
  const rel = path.relative(root, p);
  if (BAD_ASSET.test(html)) {
    fail(`${rel} يحتوي "/app/assets/" — شغّل prepare-capacitor-ios مع CAPACITOR_NATIVE=1`);
  }
  if (BAD_HOST.test(html) && html.includes("__RETWEET_API_URL__")) {
    const m = html.match(/__RETWEET_API_URL__\s*=\s*([^;]+)/);
    if (m && BAD_HOST.test(m[1])) {
      fail(`${rel} يحقن API محلي (${m[1].trim()}) — استخدم ${VERCEL_SITE_URL}`);
    }
  }
  if (!html.includes("__RETWEET_NATIVE_SHELL__")) {
    fail(`${rel} بدون __RETWEET_NATIVE_SHELL__ — شغّل scripts/prepare-capacitor-ios.mjs`);
  }
  if (/__RETWEET_API_DEBUG__\s*=\s*true/.test(html)) {
    fail(`${rel} يحتوي __RETWEET_API_DEBUG__ — أزل CAPACITOR_API_DEBUG من بناء الإنتاج`);
  }
  const cfg = path.join(path.dirname(p), "web-auth-config.json");
  if (fs.existsSync(cfg)) {
    try {
      const j = JSON.parse(read(cfg));
      const u = String(j.apiUrl || "");
      if (!u.startsWith("https://") || BAD_HOST.test(u)) {
        fail(`${path.relative(root, cfg)} apiUrl غير صالح للإنتاج: ${u || "(فارغ)"}`);
      }
    } catch {
      fail(`تعذر قراءة ${path.relative(root, cfg)}`);
    }
  }
}

if (checked === 0) {
  fail("لم يُعثر على index.html — نفّذ prepare-capacitor-ios أولاً");
}

console.log(`✓ verify-ios-api-bundle: ${checked} ملف(ات) جاهزة للإنتاج (API → ${VERCEL_SITE_URL})`);
