/**
 * بناء + نشر reyweet.vercel.app مع بروكسي إلى Retweet API.
 * عنوان الـ VPS يُقرأ من PUBLIC_API_URL.txt أو RETWEET_PUBLIC_API_URL —
 * المتصفح يتصل بنفس المصدر (reyweet.vercel.app) فلا يقع بينه وبين الواجهة إلا هذا البناء.
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

function resolveVercelSiteDir() {
  const marker = path.join(root, ".vercel-deploy-dir.txt");
  if (fs.existsSync(marker)) {
    const p = fs.readFileSync(marker, "utf8").trim();
    if (p && fs.existsSync(path.join(p, "vercel.json"))) return p;
  }
  const def = path.join(root, "_vercel_site");
  if (fs.existsSync(def)) return def;
  const siblings = fs
    .readdirSync(root)
    .filter(n => n.startsWith("_vercel_site-"))
    .map(n => path.join(root, n))
    .filter(p => fs.existsSync(path.join(p, "vercel.json")))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return siblings[0] || def;
}

const siteDir = resolveVercelSiteDir();
console.log(`نشر من: ${siteDir}\n`);

/** نشر من جذر المستودع — outputDirectory: _vercel_site في vercel.json */
const vercel = spawnSync("npx", ["--yes", "vercel", "deploy", "--prod", "--yes"], {
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
