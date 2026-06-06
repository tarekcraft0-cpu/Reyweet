#!/usr/bin/env node
/**
 * نشر سريع لوضع الصيانة — يبني فقط إن لم يوجد _vercel_site جاهز.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maintenanceRewrites } from "./lib/maintenance-mode.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "_vercel_site");
const hasSite = fs.existsSync(path.join(siteDir, "app", "index.html"));

if (!hasSite) {
  console.log("[maintenance-deploy] لا يوجد _vercel_site — بناء كامل…\n");
  execSync("node scripts/build-for-vercel.mjs", { cwd: root, stdio: "inherit" });
}

const siteVercelPath = path.join(siteDir, "vercel.json");
if (fs.existsSync(siteVercelPath)) {
  const cfg = JSON.parse(fs.readFileSync(siteVercelPath, "utf8"));
  cfg.rewrites = maintenanceRewrites();
  fs.writeFileSync(siteVercelPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

const apiDir = path.join(siteDir, "api");
const apiSrc = path.join(root, "api");
if (fs.existsSync(apiSrc)) {
  fs.mkdirSync(apiDir, { recursive: true });
  for (const f of fs.readdirSync(apiSrc)) {
    fs.copyFileSync(path.join(apiSrc, f), path.join(apiDir, f));
  }
}

const project = process.env.VERCEL_PRODUCTION_PROJECT || "reyweet";
console.log(`[maintenance-deploy] نشر ${project} (وضع صيانة)…\n`);

const vercel = spawnSync(
  "npx",
  ["--yes", "vercel", "deploy", "--prod", "--yes", "--project", project],
  { cwd: root, stdio: "inherit", shell: true, env: process.env },
);

if (vercel.status !== 0) {
  console.error(`
فشل النشر — بديل سريع من Vercel Dashboard:
  Environment → RETWEET_MAINTENANCE = 1 → Redeploy
`);
  process.exit(vercel.status ?? 1);
}

console.log("\n✓ reyweet.vercel.app في وضع الصيانة — API لا يتصل بالـ VPS\n");
