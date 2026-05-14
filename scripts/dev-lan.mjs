/**
 * يشغّل Vite على منفذ ثابت (3077) ليطابق mobile/.env — يحرّر المنفذ أولاً إن كان مشغولاً.
 */
import { execSync, spawn } from "node:child_process";
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

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteBin, "dev", "--host", "--port", String(PORT), "--strictPort"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", code => process.exit(code ?? 0));
