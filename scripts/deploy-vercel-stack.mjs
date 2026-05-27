/**
 * بناء + نشر reyweet.vercel.app مع بروكسي إلى Retweet API.
 * يبني _vercel_site محلياً ثم يرفعها بدون إعادة build على السحابة (أسرع وأضمن).
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
if (!fs.existsSync(path.join(siteDir, "app", "index.html"))) {
  console.error("deploy-vercel-stack: missing _vercel_site/app/index.html — build failed");
  process.exit(1);
}
console.log(`نشر _vercel_site (جاهز) — ${siteDir}\n`);

/** تعطيل build على السحابة مؤقتاً — الملفات جاهزة في _vercel_site */
const vercelJsonPath = path.join(root, "vercel.json");
const vercelBackup = fs.readFileSync(vercelJsonPath, "utf8");
const vercelCfg = JSON.parse(vercelBackup);
fs.writeFileSync(
  vercelJsonPath,
  JSON.stringify({ ...vercelCfg, installCommand: "", buildCommand: "" }, null, 2) + "\n",
  "utf8",
);

let vercel;
try {
  vercel = spawnSync("npx", ["--yes", "vercel", "deploy", "--prod", "--yes"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      RETWEET_PUBLIC_API_URL: apiUrl,
    },
  });
} finally {
  fs.writeFileSync(vercelJsonPath, vercelBackup, "utf8");
}

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
║  API:    ${apiUrl || "http://109.199.111.29"} (بروكسي عبر Vercel)
╚════════════════════════════════════════════════════════════╝
`);
