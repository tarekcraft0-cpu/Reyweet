/**
 * يفشل البناء إذا وُجد trycloudflare في ملفات موقع Vercel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BAD = /\.trycloudflare\.com/i;

function fail(msg) {
  console.error(`verify-vercel-web-bundle: ${msg}`);
  process.exit(1);
}

const siteDir = (() => {
  const hint = path.join(root, ".vercel-deploy-dir.txt");
  if (fs.existsSync(hint)) {
    const rel = fs.readFileSync(hint, "utf8").trim();
    if (rel) return path.join(root, rel);
  }
  return path.join(root, "_vercel_site");
})();

const checks = [
  path.join(siteDir, "app/web-auth-config.json"),
  path.join(siteDir, "app/index.html"),
  path.join(siteDir, "public/app-config.json"),
];

for (const p of checks) {
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, "utf8");
  if (BAD.test(text)) {
    fail(`عنوان نفق منتهٍ في ${path.relative(root, p)} — شغّل npm run vercel:build من جديد`);
  }
}

const apiUrl = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(siteDir, "app/web-auth-config.json"), "utf8"));
    return String(j.apiUrl || "").trim();
  } catch {
    return "";
  }
})();

if (apiUrl && BAD.test(apiUrl)) fail(`web-auth-config.json apiUrl=${apiUrl}`);

if (!apiUrl.includes("reyweet.vercel.app") && apiUrl) {
  console.warn(`verify-vercel-web-bundle: apiUrl=${apiUrl} (توقّع reyweet.vercel.app)`);
}

console.log("verify-vercel-web-bundle: ✓ لا يوجد trycloudflare في bundle الموقع");
