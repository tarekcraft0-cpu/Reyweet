/**
 * يشغّل Vite على منفذ ثابت (3077) ليطابق mobile/.env — يحرّر المنفذ أولاً إن كان مشغولاً.
 * يضبط DEV_LAN_HOST لـ HMR حتى يعمل WebView على Expo Go (الآيفون لا يصل إلى localhost).
 */
import { execSync, spawn } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = 3077;
const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");

function killPortWin() {
  try {
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: "utf8", cwd: root });
    const pids = new Set();
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore", cwd: root });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* لا شيء يستمع — طبيعي */
  }
}

function killPortUnix() {
  try {
    execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null`, { stdio: "ignore", shell: true, cwd: root });
  } catch {
    /* ignore */
  }
}

if (process.platform === "win32") killPortWin();
else killPortUnix();

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const ni of list) {
      if (ni.family !== "IPv4" || ni.internal) continue;
      if (ni.address.startsWith("169.254.")) continue;
      return ni.address;
    }
  }
  return "127.0.0.1";
}

const lanHost = process.env.DEV_LAN_HOST?.trim() || pickLanIPv4();
console.log(`[dev:lan] DEV_LAN_HOST=${lanHost} (HMR + Network URL for mobile/.env)`);

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteBin, "dev", "--host", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DEV_LAN_HOST: lanHost },
});

child.on("exit", code => process.exit(code ?? 0));
