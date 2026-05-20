/**
 * إطلاق Retweet برابط ثابت (Cloudflare Named Tunnel).
 * يتطلب إعداداً لمرة واحدة: npm run tunnel:setup
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCloudflared } from "./lib/cloudflared-path.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "_vercel_site");
const port = Number(process.env.PORT || 3000);
const tunnelYml = path.join(root, "cloudflare", "tunnel.yml");
const tunnelUrlFile = path.join(root, "PUBLIC_TUNNEL_URL.txt");

function readStableUrl() {
  const fromEnv = (process.env.RETWEET_STABLE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return "";
  const m = fs.readFileSync(envPath, "utf8").match(/^RETWEET_STABLE_URL=(.+)$/m);
  return m ? m[1].trim().replace(/\/$/, "") : "";
}

function patchJsonFile(filePath, patch) {
  let j = {};
  if (fs.existsSync(filePath)) {
    try {
      j = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(filePath, JSON.stringify({ ...j, ...patch }, null, 2) + "\n", "utf8");
}

function patchBackendEnv(publicUrl) {
  const envPath = path.join(root, "backend", ".env");
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const set = (key, val) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${val}`;
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  };
  set("DATA_ROOT", process.env.DATA_ROOT || "D:/RetweetSocial");
  set("HOST", "0.0.0.0");
  set("PORT", String(port));
  set("PUBLIC_BASE_URL", publicUrl.replace(/\/$/, ""));
  set("STATIC_SITE_DIR", "../_vercel_site");
  set("CORS_ALLOW_ALL", "1");
  fs.writeFileSync(envPath, text, "utf8");
}

function waitForHealth(maxMs = 45000) {
  const url = `http://127.0.0.1:${port}/health`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then(r => (r.ok ? resolve() : Promise.reject()))
        .catch(() => {
          if (Date.now() - start > maxMs) reject(new Error("backend health timeout"));
          else setTimeout(tick, 800);
        });
    };
    tick();
  });
}

function killPortWin(p) {
  if (process.platform !== "win32") return;
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, { encoding: "utf8" });
    for (const line of out.split("\n")) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* free */
  }
}

const stableUrl = readStableUrl();
if (!stableUrl) {
  console.error(`
══ رابط ثابت غير مُعدّ ══

شغّل مرة واحدة (يحتاج دومين على Cloudflare):

  powershell -ExecutionPolicy Bypass -File scripts/setup-stable-tunnel.ps1 -Hostname app.YOURDOMAIN.com

ثم:

  npm run public:stable
`);
  process.exit(1);
}

if (!fs.existsSync(tunnelYml)) {
  console.error(`ملف النفق مفقود: cloudflare/tunnel.yml\nأعد تشغيل tunnel:setup`);
  process.exit(1);
}

console.log("\n══ Retweet — رابط ثابت ══\n");
console.log(`  ${stableUrl}\n`);

killPortWin(port);

console.log("1) بناء الموقع...");
execSync("npm run build:spa", { cwd: root, stdio: "inherit" });
if (!fs.existsSync(path.join(siteDir, "index.html"))) {
  execSync("npm run build --prefix landing", { cwd: root, stdio: "inherit" });
}
process.env.RETWEET_SAME_ORIGIN = "1";
execSync("node scripts/prepare-vercel-static.mjs", { cwd: root, stdio: "inherit", env: process.env });

patchJsonFile(path.join(siteDir, "public/app-config.json"), { apiUrl: "", siteUrl: stableUrl });
patchJsonFile(path.join(siteDir, "app/web-auth-config.json"), { apiUrl: "" });
patchBackendEnv(stableUrl);

const rootEnv = path.join(root, ".env");
let envText = fs.existsSync(rootEnv) ? fs.readFileSync(rootEnv, "utf8") : "";
const setEnv = (key, val) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${val}`;
  envText = re.test(envText) ? envText.replace(re, line) : `${envText.trimEnd()}\n${line}\n`;
};
setEnv("RETWEET_PUBLIC_API_URL", stableUrl);
setEnv("RETWEET_STABLE_URL", stableUrl);
fs.writeFileSync(rootEnv, envText, "utf8");

fs.writeFileSync(tunnelUrlFile, `${stableUrl}\n${stableUrl}/app/\n`, "utf8");

console.log("\n2) تشغيل الخادم...");
const backend = spawn("npm", ["run", "start", "--prefix", "backend"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

await waitForHealth().catch(e => {
  console.error(e.message);
  process.exit(1);
});

console.log("\n3) تشغيل النفق الثابت...\n");
const cf = findCloudflared();
const tunnelProc = spawn(cf, ["tunnel", "--config", tunnelYml, "run"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

try {
  execSync("node scripts/sync-mobile-ios.mjs --public", { cwd: root, stdio: "inherit" });
} catch {
  /* optional */
}

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║  الرابط الثابت — شاركه مع الأصدقاء (لا يتغيّر):           ║");
console.log(`║  ${stableUrl}`);
console.log(`║  التطبيق: ${stableUrl}/app/`);
console.log("╚════════════════════════════════════════════════════════════╝\n");

process.on("SIGINT", () => {
  tunnelProc.kill();
  backend.kill();
  process.exit(0);
});
