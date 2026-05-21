/**
 * مزامنة واحدة: الموقع (Vercel) + SPA + تطبيق IPA — نفس API وقاعدة البيانات.
 *
 *   npm run sync:all
 *   npm run sync:all -- --ipa --deploy
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicApiUrl, VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const withIpa = args.includes("--ipa");
const withDeploy = args.includes("--deploy");

const apiUrl = readPublicApiUrl();
const webAppUrl = `${VERCEL_SITE_URL}/app/`;

console.log("\n══ مزامنة الموقع + التطبيق + الخادم ══\n");
console.log(`  الموقع:  ${webAppUrl}`);
console.log(`  API:     ${apiUrl || "(شغّل npm run stack:reyweet أولاً)"}\n`);

if (!apiUrl) {
  console.error("sync-all: لا يوجد رابط API — شغّل: npm run stack:reyweet");
  process.exit(1);
}

process.env.RETWEET_PUBLIC_API_URL = apiUrl;
execSync("node scripts/write-public-web-config.mjs", {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

const capTs = [
  "import { CapacitorConfig } from '@capacitor/cli';",
  "",
  "const config: CapacitorConfig = {",
  "  appId: 'com.reyweet.app',",
  "  appName: 'Reyweet',",
  "  webDir: 'dist',",
  "  server: {",
  `    url: '${webAppUrl}',`,
  "    cleartext: false,",
  "  },",
  "};",
  "",
  "export default config;",
  "",
].join("\n");
fs.writeFileSync(path.join(root, "capacitor.config.ts"), capTs, "utf8");
console.log("  ✓ capacitor.config.ts");

const links = [
  `SITE=${VERCEL_SITE_URL}`,
  `APP=${webAppUrl}`,
  `API=${apiUrl}`,
  `SYNCED=${new Date().toISOString()}`,
  "",
  "الموقع والتطبيق يستخدمان نفس API — شغّل stack:reyweet واتركه يعمل.",
].join("\n");
fs.writeFileSync(path.join(root, "PUBLIC_LINKS.txt"), links, "utf8");
console.log("  ✓ PUBLIC_LINKS.txt");

execSync("npm run build:spa", { cwd: root, stdio: "inherit", env: process.env });

const indexPath = path.join(root, "spa-dist", "index.html");
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");
  const tag = `<script>window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};</script>`;
  if (!html.includes("__RETWEET_API_URL__")) {
    html = html.replace("</head>", `${tag}\n</head>`);
  } else {
    html = html.replace(
      /<script>window\.__RETWEET_API_URL__=[^<]*<\/script>/,
      tag,
    );
  }
  fs.writeFileSync(indexPath, html, "utf8");
  console.log("  ✓ spa-dist (مزامنة API)");
}

if (withIpa) {
  execSync("node scripts/package-ready-ipa.mjs", {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
}

if (withDeploy) {
  execSync("npm run vercel:deploy", { cwd: root, stdio: "inherit", env: process.env });
  console.log("\n  ✓ Vercel محدّث — الموقع والتطبيق يقرآن نفس apiUrl");
} else {
  console.log("\n  لتطبيق الموقع: npm run vercel:deploy");
  console.log("  أو: npm run sync:all -- --deploy\n");
}

console.log("✓ مزامنة كاملة — الموقع + IPA (إن وُجد) + ملفات الويب\n");
