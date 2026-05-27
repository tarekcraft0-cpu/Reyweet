/**
 * يربط نفق Cloudflare بخادم API شغّال على المنفذ 3000 (بدون إيقاف dev:all).
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCloudflared } from "./lib/cloudflared-path.mjs";
import { VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);
const withDeploy = process.argv.includes("--deploy");
const detach = process.argv.includes("--detach") || withDeploy;

function waitForHealth(maxMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      fetch(`http://127.0.0.1:${port}/health`)
        .then(r => (r.ok ? resolve() : Promise.reject()))
        .catch(() => {
          if (Date.now() - start > maxMs) reject(new Error("API غير شغّال — شغّل: npm run dev:all"));
          else setTimeout(tick, 600);
        });
    };
    tick();
  });
}

function patchFiles(publicUrl) {
  fs.writeFileSync(path.join(root, "PUBLIC_API_URL.txt"), `${publicUrl}\n`, "utf8");
  fs.writeFileSync(
    path.join(root, "PUBLIC_TUNNEL_URL.txt"),
    `${publicUrl}\n${VERCEL_SITE_URL}/app/\n`,
    "utf8",
  );
  const envPath = path.join(root, ".env");
  let envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const setEnv = (key, val) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${val}`;
    envText = re.test(envText) ? envText.replace(re, line) : `${envText.trimEnd()}\n${line}\n`;
  };
  setEnv("RETWEET_PUBLIC_API_URL", publicUrl);
  fs.writeFileSync(envPath, envText, "utf8");

  const cfg = path.join(root, "spa", "public", "web-auth-config.json");
  fs.writeFileSync(
    cfg,
    JSON.stringify({ apiUrl: publicUrl, supabaseUrl: "", supabaseAnonKey: "" }, null, 2) + "\n",
    "utf8",
  );
  console.log(`  ✓ spa/public/web-auth-config.json → ${publicUrl}`);
}

function parseUrlFromLog(text) {
  const matches = [...text.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi)];
  return matches.length ? matches[matches.length - 1][0].replace(/\/$/, "") : "";
}

function startCloudflaredForeground() {
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
      const url = parseUrlFromLog(buf);
      if (url) resolve({ url, child });
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", e => reject(e));
    setTimeout(() => reject(new Error("انتهت مهلة النفق (60ث)")), 60_000);
  });
}

function startCloudflaredDetached() {
  return new Promise((resolve, reject) => {
    const logPath = path.join(root, "tunnel-live.log");
    fs.writeFileSync(logPath, "", "utf8");
    const cf = findCloudflared();
    const child = spawn(cf, ["tunnel", "--url", `http://127.0.0.1:${port}`], {
      cwd: root,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    const append = chunk => {
      try {
        fs.appendFileSync(logPath, chunk.toString());
      } catch {
        /* ignore */
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.unref();
    const start = Date.now();
    const poll = () => {
      const text = fs.readFileSync(logPath, "utf8");
      const url = parseUrlFromLog(text);
      if (url) {
        resolve({ url, child });
        return;
      }
      if (Date.now() - start > 60_000) reject(new Error("انتهت مهلة النفق (60ث)"));
      else setTimeout(poll, 800);
    };
    poll();
  });
}

console.log("\n══ ربط النفق + مزامنة Vercel (الواجهة المحلية تبقى شغّالة) ══\n");

await waitForHealth();

console.log("1) تشغيل نفق Cloudflare...\n");
const { url: publicUrl, child: tunnelProc } = detach
  ? await startCloudflaredDetached()
  : await startCloudflaredForeground();
console.log(`   API عام: ${publicUrl}\n`);

patchFiles(publicUrl);
process.env.RETWEET_PUBLIC_API_URL = publicUrl;

console.log("2) مزامنة إعدادات العملاء...\n");
execSync("node scripts/write-public-web-config.mjs", { cwd: root, stdio: "inherit", env: process.env });

if (withDeploy) {
  console.log("\n3) بناء ونشر Vercel...\n");
  try {
    execSync("node scripts/build-for-vercel.mjs", { cwd: root, stdio: "inherit", env: process.env });
    execSync("npx --yes vercel deploy _vercel_site --prod --yes", {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: process.env,
    });
  } catch {
    console.warn("\n⚠ فشل النشر التلقائي — في Vercel Dashboard ضع:");
    console.warn(`   RETWEET_PUBLIC_API_URL = ${publicUrl}\n`);
  }
}

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log(`║  محلي:  http://localhost:3080/app/`);
console.log(`║  Vercel: ${VERCEL_SITE_URL}/app/`);
console.log(`║  API:    ${publicUrl}`);
if (detach) {
  console.log("║  النفق يعمل في الخلفية — لا تغلق نافذة dev:all              ║");
} else {
  console.log("║  اترك هذه النافذة مفتوحة — النفق يتوقف عند الإغلاق (Ctrl+C)      ║");
}
console.log("╚════════════════════════════════════════════════════════════╝\n");

if (detach) {
  process.exit(0);
}

process.on("SIGINT", () => {
  tunnelProc.kill();
  process.exit(0);
});

await new Promise(() => {});
