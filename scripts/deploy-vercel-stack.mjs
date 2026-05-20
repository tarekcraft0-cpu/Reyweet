/**
 * بناء + نشر reyweet.vercel.app وربطه بـ API على D:
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicApiUrl, VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

execSync("node scripts/build-for-vercel.mjs", { cwd: root, stdio: "inherit" });

const apiUrl = readPublicApiUrl();
console.log("\n══ نشر Vercel ══\n");

const vercel = spawnSync("npx", ["--yes", "vercel", "--prod", "--yes"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    RETWEET_PUBLIC_API_URL: apiUrl,
  },
});

if (vercel.status !== 0) {
  console.log(`
إذا فشل النشر التلقائي:
1. Vercel Dashboard → reyweet → Settings → Environment Variables
2. RETWEET_PUBLIC_API_URL = ${apiUrl}
3. Deployments → Redeploy

أو من الطرفية بعد: npx vercel link
  npx vercel --prod
`);
  process.exit(vercel.status ?? 1);
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║  تم النشر                                                  ║
║  الموقع: ${VERCEL_SITE_URL}/app/
║  API:    ${apiUrl}
╚════════════════════════════════════════════════════════════╝
`);
