#!/usr/bin/env node
/**
 * فصل التطبيق عن VPS مؤقتاً — البيانات تبقى على السيرفر.
 *
 *   $env:CONTABO_SSH_PASSWORD = "..."
 *   npm run stack:pause
 *   npm run stack:pause -- --skip-ssh      # فقط وضع صيانة Vercel محلياً
 *   npm run stack:pause -- --skip-deploy   # بدون نشر Vercel
 *   npm run stack:pause -- --skip-backup   # بدون تنزيل نسخة احتياطية
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enableMaintenanceMode, isPaused } from "./lib/maintenance-mode.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipSsh = process.argv.includes("--skip-ssh");
const skipDeploy = process.argv.includes("--skip-deploy");
const skipBackup = process.argv.includes("--skip-backup");
const pass = process.env.CONTABO_SSH_PASSWORD || "";

console.log("\n═══ فصل التطبيق عن الخادم (صيانة مؤقتة) ═══\n");

if (isPaused()) {
  console.log("⚠ وضع الصيانة مفعّل مسبقاً — لتفعيل الإنتاج: npm run stack:resume\n");
}

const state = enableMaintenanceMode();
console.log("✓ vercel.json → وضع صيانة (API يعيد 503 بدون الاتصال بالـ VPS)");
console.log(`  حالة محفوظة: .stack-state/paused.json (${state.pausedAt})\n`);

if (!skipSsh && pass) {
  console.log("⏸ إيقاف retweet-api على VPS (البيانات في /var/lib/retweet)…\n");
  const pm2 = spawnSync("node", ["scripts/contabo-pm2-control.mjs", "stop"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (pm2.status !== 0) {
    console.warn("⚠ تعذّر إيقاف pm2 — قد يكون السيرفر غير متاح (البيانات ما زالت على القرص)\n");
  }
} else if (!skipSsh) {
  console.log("⊘ تخطّي SSH — عيّن CONTABO_SSH_PASSWORD لإيقاف retweet-api على VPS\n");
}

if (!skipBackup && pass) {
  console.log("📦 نسخة احتياطية من بيانات السيرفر…\n");
  const dl = spawnSync("node", ["scripts/contabo-download-backup.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (dl.status !== 0) {
    console.warn("⚠ تعذّر تنزيل النسخة — البيانات الأصلية على VPS لم تُمس\n");
  }
} else if (!skipBackup) {
  console.log("⊘ تخطّي النسخة الاحتياطية — شغّل لاحقاً: npm run contabo:download-backup\n");
}

if (!skipDeploy) {
  console.log("🚀 نشر وضع الصيانة على reyweet.vercel.app…\n");
  const deploy = spawnSync("node", ["scripts/deploy-vercel-maintenance.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (deploy.status !== 0) {
    console.warn(`
⚠ فشل النشر التلقائي — يمكنك لاحقاً:
  npm run stack:pause -- --skip-ssh --skip-backup
  أو Vercel Dashboard → RETWEET_MAINTENANCE=1 ثم Redeploy
`);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  التطبيق مفصول عن الخادم مؤقتاً                              ║
║  البيانات: /var/lib/retweet على 109.199.111.29 (لم تُمس)    ║
║                                                              ║
║  تطوير محلي غداً:                                            ║
║    npm run local:stack                                       ║
║    أو backend:dev + spa:dev:lan                              ║
║                                                              ║
║  إعادة التشغيل: npm run stack:resume                         ║
╚══════════════════════════════════════════════════════════════╝
`);
