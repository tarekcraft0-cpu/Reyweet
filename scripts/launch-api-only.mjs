/**
 * خادم API + قاعدة D: + نفق فقط — بدون موقع محلي موحّد.
 * الواجهة الرسمية: https://reyweet.vercel.app
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCloudflared } from "./lib/cloudflared-path.mjs";
import { VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);
const tunnelUrlFile = path.join(root, "PUBLIC_TUNNEL_URL.txt");

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
  if (/^STATIC_SITE_DIR=/m.test(text)) {
    text = text.replace(/^STATIC_SITE_DIR=.*$/m, "# STATIC_SITE_DIR= (معطّل — الموقع على Vercel)");
  } else {
    text = `${text.trimEnd()}\n# STATIC_SITE_DIR= (معطّل — الموقع على Vercel)\n`;
  }
  set("CORS_ALLOW_ALL", "0");
  const cors = `https://reyweet.vercel.app,${publicUrl}`;
  set("CORS_ORIGINS", cors);
  fs.writeFileSync(envPath, text, "utf8");
}

function waitForHealth(maxMs = 45000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      fetch(`http://127.0.0.1:${port}/health`)
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

function startCloudflared() {
  return new Promise((resolve, reject) => {
    const cf = findCloudflared();
    const child = spawn(cf, ["tunnel", "--url", `http://127.0.0.1:${port}`], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let buf = "";
    const onData = chunk => {
      buf += chunk.toString();
      const matches = [...buf.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi)];
      if (matches.length) {
        const url = matches[matches.length - 1][0].replace(/\/$/, "");
        resolve({ url, child });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", e => reject(e));
    setTimeout(() => reject(new Error("tunnel timeout")), 60_000);
  });
}

console.log("\n══ Retweet API فقط (لـ reyweet.vercel.app) ══\n");
console.log(`  الموقع: ${VERCEL_SITE_URL}\n`);

if (process.platform === "win32") killPortWin(port);

patchBackendEnv(`http://127.0.0.1:${port}`);

console.log("1) تشغيل الخادم (D:\\RetweetSocial) — بدون موقع محلي...");
const backend = spawn("npm", ["run", "start", "--prefix", "backend"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

await waitForHealth();

console.log("\n2) نفق Cloudflare للـ API...\n");
const { url: publicUrl, child: tunnelProc } = await startCloudflared();

patchBackendEnv(publicUrl);

const rootEnv = path.join(root, ".env");
let envText = fs.existsSync(rootEnv) ? fs.readFileSync(rootEnv, "utf8") : "";
const setEnv = (key, val) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${val}`;
  envText = re.test(envText) ? envText.replace(re, line) : `${envText.trimEnd()}\n${line}\n`;
};
setEnv("RETWEET_PUBLIC_API_URL", publicUrl);
fs.writeFileSync(rootEnv, envText, "utf8");

fs.writeFileSync(path.join(root, "PUBLIC_API_URL.txt"), `${publicUrl}\n`, "utf8");
fs.writeFileSync(
  path.join(root, "PUBLIC_TUNNEL_URL.txt"),
  `${publicUrl}\n${VERCEL_SITE_URL}/app/\n`,
  "utf8",
);

execSync("node scripts/write-public-web-config.mjs", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, RETWEET_PUBLIC_API_URL: publicUrl },
});

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║  الموقع (Vercel):                                        ║");
console.log(`║  ${VERCEL_SITE_URL}`);
console.log(`║  ${VERCEL_SITE_URL}/app/`);
console.log("║                                                          ║");
console.log("║  ضع هذا في Vercel → RETWEET_PUBLIC_API_URL ثم Redeploy:  ║");
console.log(`║  ${publicUrl}`);
console.log("╚════════════════════════════════════════════════════════════╝");
console.log(`\nمحفوظ في: PUBLIC_API_URL.txt و .env\n`);
console.log("بعد تحديث Vercel: npm run vercel:deploy\n");

process.on("SIGINT", () => {
  tunnelProc.kill();
  backend.kill();
  process.exit(0);
});
