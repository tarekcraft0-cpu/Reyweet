/**
 * بناء الموقع + تشغيل الخادم المحلي (D:) + نفق Cloudflare للإنترنت.
 * الناتج: رابط https://....trycloudflare.com للموقع كاملاً.
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "_vercel_site");
const port = Number(process.env.PORT || 3000);
const tunnelUrlFile = path.join(root, "PUBLIC_TUNNEL_URL.txt");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: opts.inherit ? "inherit" : "pipe",
      shell: process.platform === "win32",
      env: { ...process.env, ...opts.env },
    });
    let out = "";
    if (!opts.inherit && child.stdout) {
      child.stdout.on("data", d => {
        out += d.toString();
        process.stdout.write(d);
      });
    }
    if (!opts.inherit && child.stderr) {
      child.stderr.on("data", d => {
        out += d.toString();
        process.stderr.write(d);
      });
    }
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
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
  console.log(`\n  ✓ backend/.env (PUBLIC_BASE_URL=${publicUrl})\n`);
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

function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    "cloudflared",
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === "cloudflared" || fs.existsSync(c)) return c;
  }
  return "cloudflared";
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
      const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        resolve({ url: m[0].replace(/\/$/, ""), child });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", e => {
      reject(new Error(`cloudflared غير متوفر: ${e.message}. ثبّت: winget install Cloudflare.cloudflared`));
    });
    setTimeout(() => reject(new Error("انتهت مهلة انتظار رابط النفق (60ث)")), 60_000);
  });
}

function killPortWin(p) {
  try {
    const out = execSync(`netstat -ano | findstr :${p}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* free */
  }
}

const skipBuild = process.env.SKIP_BUILD === "1";

console.log("\n═══ Retweet — إطلاق عام (محلي + نفق) ═══\n");

if (process.platform === "win32") killPortWin(port);

if (!skipBuild) {
  console.log("1) مزامنة عناوين الشبكة...");
  try {
    execSync("node scripts/sync-lan-api-url.mjs", { cwd: root, stdio: "inherit" });
  } catch {
    /* optional */
  }

  console.log("\n2) بناء الواجهة (SPA + landing)...");
  execSync("npm run build:spa", { cwd: root, stdio: "inherit" });
  execSync("npm run build --prefix landing", { cwd: root, stdio: "inherit" });

  process.env.RETWEET_SAME_ORIGIN = "1";
  execSync("node scripts/prepare-vercel-static.mjs", { cwd: root, stdio: "inherit", env: process.env });
} else {
  console.log("1–2) تخطي البناء (SKIP_BUILD=1) — استخدام _vercel_site الحالي\n");
}

if (!fs.existsSync(path.join(siteDir, "index.html"))) {
  console.error("فشل البناء: _vercel_site/index.html مفقود");
  process.exit(1);
}

patchJsonFile(path.join(siteDir, "public/app-config.json"), {
  apiUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  siteUrl: "",
});
patchJsonFile(path.join(siteDir, "app/web-auth-config.json"), {
  apiUrl: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
});

patchBackendEnv(`http://127.0.0.1:${port}`);

console.log("\n3) تشغيل الخادم (قاعدة D: + الموقع الكامل)...");
const backend = spawn("npm", ["run", "start", "--prefix", "backend"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

await waitForHealth().catch(e => {
  console.error(e.message);
  process.exit(1);
});

console.log("\n4) فتح نفق Cloudflare للإنترنت...\n");
const { url: publicUrl, child: tunnelProc } = await startCloudflared();

patchBackendEnv(publicUrl);
/** نفس الأصل عبر النفق — apiUrl فارغ يمنع طلبات إلى localhost:3000 من متصفح الزائر */
patchJsonFile(path.join(siteDir, "public/app-config.json"), {
  apiUrl: "",
  siteUrl: publicUrl,
});
patchJsonFile(path.join(siteDir, "app/web-auth-config.json"), { apiUrl: "" });

const rootEnv = path.join(root, ".env");
let envText = fs.existsSync(rootEnv) ? fs.readFileSync(rootEnv, "utf8") : "";
const setEnv = (key, val) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${val}`;
  envText = re.test(envText) ? envText.replace(re, line) : `${envText.trimEnd()}\n${line}\n`;
};
setEnv("RETWEET_PUBLIC_API_URL", publicUrl);
setEnv("LAN_API_URL", publicUrl);
fs.writeFileSync(rootEnv, envText, "utf8");

fs.writeFileSync(
  tunnelUrlFile,
  `${publicUrl}\n${publicUrl}/app/\n`,
  "utf8",
);

console.log("\n╔════════════════════════════════════════════════════════════╗");
console.log("║  الموقع على الإنترنت (شارك هذا الرابط):                  ║");
console.log(`║  ${publicUrl}`);
console.log(`║  التطبيق: ${publicUrl}/app/`);
console.log("╚════════════════════════════════════════════════════════════╝");
console.log(`\nمحفوظ في: ${tunnelUrlFile}`);
console.log("\nالخادم والنفق يعملان — أوقفهما بـ Ctrl+C في هذه النافذة.\n");

process.on("SIGINT", () => {
  tunnelProc.kill();
  backend.kill();
  process.exit(0);
});
