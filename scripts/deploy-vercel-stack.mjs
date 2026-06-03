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
const ipaPath = path.join(siteDir, "public", "downloads", "retweet.ipa");
if (!fs.existsSync(ipaPath)) {
  console.error("deploy-vercel-stack: retweet.ipa مفقود في _vercel_site — أعد البناء");
  process.exit(1);
}
const ipaMb = (fs.statSync(ipaPath).size / (1024 * 1024)).toFixed(1);
console.log(`نشر _vercel_site (جاهز) — ${siteDir}`);
console.log(`  ✓ retweet.ipa (${ipaMb} MB) سيُرفع مع النشر\n`);

const canonicalSite = path.join(root, "_vercel_site");
if (siteDir !== canonicalSite && fs.existsSync(canonicalSite)) {
  console.log(`  ✓ outputDirectory: _vercel_site/`);
} else if (!fs.existsSync(path.join(canonicalSite, "public", "downloads", "retweet.ipa"))) {
  console.error("deploy-vercel-stack: _vercel_site/public/downloads/retweet.ipa مفقود — أعد npm run vercel:deploy");
  process.exit(1);
}

let vercel = spawnSync("npx", ["--yes", "vercel", "deploy", "--prod", "--yes"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    RETWEET_PUBLIC_API_URL: apiUrl,
  },
});

if (vercel.status === 0) {
  try {
    const check = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Invoke-WebRequest -Uri 'https://reyweet.vercel.app/downloads/retweet.ipa' -Method Head -UseBasicParsing).StatusCode",
      ],
      { encoding: "utf8" },
    );
    const code = String(check.stdout || "").trim();
    if (code === "200") {
      console.log("  ✓ تحقق: /downloads/retweet.ipa متاح على reyweet.vercel.app");
    } else {
      console.warn(`  ⚠ تحقق IPA: HTTP ${code || "فشل"} — قد يحتاج دقيقة لانتشار CDN`);
    }
  } catch {
    /* ignore */
  }
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

