/**
 * إعادة بناء SPA + تشغيل خادم موحّد :3000 + نفق Cloudflare (بدون إعادة بناء landing كاملة إن وُجدت).
 */
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("\n══ Relaunch public (API fix + tunnel) ══\n");

if (process.platform === "win32") {
  try {
    const out = execSync("netstat -ano | findstr :3000", { encoding: "utf8" });
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

execSync("npm run build:spa", { cwd: root, stdio: "inherit" });

const siteDir = path.join(root, "_vercel_site");
if (!fs.existsSync(path.join(siteDir, "index.html"))) {
  execSync("npm run build --prefix landing", { cwd: root, stdio: "inherit" });
}

process.env.RETWEET_SAME_ORIGIN = "1";
execSync("node scripts/prepare-vercel-static.mjs", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

execSync("node scripts/launch-public.mjs", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, SKIP_BUILD: "1" },
});
