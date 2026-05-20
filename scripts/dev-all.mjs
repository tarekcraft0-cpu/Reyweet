/**
 * تشغيل Retweet بالكامل: قاعدة D + API :3000 + واجهة :3080 (مع بروكسي)
 * استخدم: npm run dev:all
 */
import { spawn, execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function killPort(p) {
  if (process.platform !== "win32") return;
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

function pickLan() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if ((ni.family !== "IPv4" && ni.family !== 4) || ni.internal) continue;
      if (ni.address.startsWith("192.168.")) return ni.address;
    }
  }
  return "127.0.0.1";
}

console.log("\n══ Retweet dev:all — قاعدة D + خادم + واجهة ══\n");
killPort(3000);
killPort(3080);

try {
  execSync("node scripts/sync-lan-api-url.mjs", { cwd: root, stdio: "inherit" });
} catch {
  /* optional */
}

const lan = pickLan();

const backend = spawn("npm", ["run", "dev", "--prefix", "backend"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, CORS_ALLOW_ALL: "1", HOST: "0.0.0.0" },
});

const spa = spawn(
  "npx",
  ["vite", "dev", "--config", "vite.spa.config.ts", "--host", "0.0.0.0", "--port", "3080", "--strictPort"],
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, VITE_API_URL: "" },
  },
);

console.log(`
✓ قاعدة البيانات: D:\\RetweetSocial
✓ API:           http://${lan}:3000/health
✓ التطبيق:       http://${lan}:3080/app/   (بروكسي تلقائي — لا حاجة لعنوان API يدوي)
✓ بديل موحّد:     شغّل STATIC_SITE_DIR ثم http://${lan}:3000/app/

أوقف: Ctrl+C
`);

const stop = () => {
  backend.kill();
  spa.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
