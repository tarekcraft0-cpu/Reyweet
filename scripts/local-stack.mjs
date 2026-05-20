/**
 * تشغيل Retweet محلياً بالكامل: API (D:) + واجهة /app على الشبكة.
 */
import { spawn, execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function pickLan() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if ((ni.family !== "IPv4" && ni.family !== 4) || ni.internal) continue;
      if (ni.address.startsWith("192.168.")) return ni.address;
    }
  }
  return "127.0.0.1";
}

console.log("\n═══ Retweet — تشغيل محلي كامل ═══\n");
execSync("node scripts/sync-lan-api-url.mjs", { cwd: root, stdio: "inherit" });

const lan = pickLan();
const backend = spawn("npm", ["run", "dev", "--prefix", "backend"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

const spa = spawn(
  "npx",
  ["vite", "dev", "--config", "vite.spa.config.ts", "--host", "0.0.0.0", "--port", "3080", "--strictPort"],
  { cwd: root, stdio: "inherit", shell: true },
);

console.log(`
✓ Backend (قاعدة D:)  →  http://${lan}:3000/health
✓ التطبيق /app/       →  http://${lan}:3080/app/
✓ صفحة الهبوط (dev)   →  npm run dev (منفذ 5173) أو استخدم: npm run public:launch للنشر العام

أوقف التشغيل: Ctrl+C
`);

const stop = () => {
  backend.kill();
  spa.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
