#!/usr/bin/env node
/**
 * نشر الإنتاج على VPS مباشرة — واجهة + API على http://109.199.111.29
 * بدون بروكسي Vercel وبدون سيرفر محلي.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTION_VPS_API } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!process.env.CONTABO_SSH_PASSWORD && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

console.log("\n══ نشر VPS مباشر (واجهة + API) ══\n");
console.log(`  VPS: ${PRODUCTION_VPS_API}/app/\n`);

execSync("node scripts/write-public-web-config.mjs", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, RETWEET_USE_VERCEL_PROXY: "0" },
});

execSync("npm run build:spa", { cwd: root, stdio: "inherit" });

console.log("\n[1/2] رفع الواجهة إلى VPS…");
execSync("node scripts/contabo-upload-spa.mjs", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

console.log("\n[2/2] تحديث كود الخادم…");
execSync("npm run contabo:deploy:backend", { cwd: root, stdio: "inherit" });

console.log(`
╔════════════════════════════════════════════════════════════╗
║  تم — اتصال مباشر بالـ VPS                                 ║
║  التطبيق: ${PRODUCTION_VPS_API}/app/
║  API:     ${PRODUCTION_VPS_API}
╚════════════════════════════════════════════════════════════╝
`);
