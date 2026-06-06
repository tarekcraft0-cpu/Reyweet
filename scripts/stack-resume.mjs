#!/usr/bin/env node
/**
 * إعادة ربط التطبيق بالـ VPS بعد الصيانة.
 *
 *   $env:CONTABO_SSH_PASSWORD = "..."
 *   npm run stack:resume
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { disableMaintenanceMode, isPaused } from "./lib/maintenance-mode.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipSsh = process.argv.includes("--skip-ssh");
const skipDeploy = process.argv.includes("--skip-deploy");
const pass = process.env.CONTABO_SSH_PASSWORD || "";

console.log("\n═══ إعادة تشغيل الإنتاج ═══\n");

if (!isPaused()) {
  console.log("ℹ vercel.json ليس في وضع صيانة — سيتم تشغيل API وإعادة النشر فقط\n");
}

disableMaintenanceMode();
console.log("✓ vercel.json → وضع إنتاج (بروكسي → VPS)\n");

if (!skipSsh && pass) {
  console.log("▶ تشغيل retweet-api على VPS…\n");
  const pm2 = spawnSync("node", ["scripts/contabo-pm2-control.mjs", "start"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (pm2.status !== 0) {
    console.warn("⚠ تعذّر تشغيل pm2 — راجع السيرفر يدوياً: pm2 start retweet-api\n");
  }
} else if (!skipSsh) {
  console.log("⊘ تخطّي SSH — عيّن CONTABO_SSH_PASSWORD ثم أعد: npm run stack:resume\n");
}

if (!skipDeploy) {
  console.log("🚀 نشر الإنتاج على reyweet.vercel.app…\n");
  const deploy = spawnSync("node", ["scripts/deploy-vercel-stack.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (deploy.status !== 0) {
    console.warn("⚠ فشل النشر — شغّل يدوياً: npm run vercel:deploy\n");
    process.exit(deploy.status ?? 1);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  تمت إعادة الربط                                             ║
║  الموقع: https://reyweet.vercel.app/app/                     ║
║  API:    http://109.199.111.29                               ║
╚══════════════════════════════════════════════════════════════╝
`);
