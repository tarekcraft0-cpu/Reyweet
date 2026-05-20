/**
 * تطبيق iOS (Capacitor) — نفس واجهة https://reyweet.vercel.app/app/
 * بدون Expo. يُشغَّل محلياً أو على Codemagic قبل xcodebuild.
 *
 * المتغيرات (اختياري في Codemagic):
 *   RETWEET_PUBLIC_API_URL — نفق API (من PUBLIC_API_URL.txt)
 *   CAPACITOR_WEB_APP_URL   — افتراضي https://reyweet.vercel.app/app/
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicApiUrl, VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webAppUrl = (
  process.env.CAPACITOR_WEB_APP_URL ||
  `${VERCEL_SITE_URL}/app`
).replace(/\/$/, "");
const apiUrl = readPublicApiUrl();
const appId = process.env.CAPACITOR_APP_ID || "com.retweetmobile.app";
const allowHttp =
  process.env.CAPACITOR_ALLOW_HTTP === "1" ||
  webAppUrl.startsWith("http://") ||
  (apiUrl && apiUrl.startsWith("http://"));

function run(cmd, opts = {}) {
  execSync(cmd, {
    cwd: opts.cwd || root,
    stdio: "inherit",
    env: { ...process.env, ...opts.env },
    shell: process.platform === "win32",
  });
}

console.log("\n══ Retweet iOS — Capacitor (نسخة الموقع) ══\n");
console.log(`  WebView:  ${webAppUrl}/`);
console.log(`  API:      ${apiUrl || "(من إعدادات الموقع على Vercel)"}\n`);

if (apiUrl) {
  process.env.RETWEET_PUBLIC_API_URL = apiUrl;
  run("node scripts/write-public-web-config.mjs", { env: process.env });
}

console.log("→ بناء SPA (نفس بناء الموقع)…");
run("npm run build:spa", {
  env: {
    ...process.env,
    RETWEET_PUBLIC_API_URL: apiUrl || process.env.RETWEET_PUBLIC_API_URL || "",
  },
});

const spaDist = path.join(root, "spa-dist");
const indexPath = path.join(spaDist, "index.html");
if (apiUrl && fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");
  const tag = `<script>window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};</script>`;
  if (!html.includes("__RETWEET_API_URL__")) {
    html = html.replace("</head>", `${tag}\n</head>`);
    fs.writeFileSync(indexPath, html, "utf8");
    console.log("  ✓ spa-dist/index.html (__RETWEET_API_URL__)");
  }
}

const serverUrl = `${webAppUrl.replace(/\/+$/, "")}/`;
const capLines = [
  'import type { CapacitorConfig } from "@capacitor/cli";',
  "",
  "const config: CapacitorConfig = {",
  `  appId: ${JSON.stringify(appId)},`,
  '  appName: "Retweet",',
  '  webDir: "spa-dist",',
  "  server: {",
  `    url: ${JSON.stringify(serverUrl)},`,
  `    cleartext: ${allowHttp ? "true" : "false"},`,
  '    androidScheme: "https"',
  "  },",
  "  ios: {",
  '    contentInset: "automatic",',
  "    allowsLinkPreview: false",
  "  }",
  "};",
  "",
  "export default config;",
  "",
];
fs.writeFileSync(path.join(root, "capacitor.config.ts"), capLines.join("\n"), "utf8");
console.log("  ✓ capacitor.config.ts");

const iosDir = path.join(root, "ios");
if (!fs.existsSync(iosDir)) {
  console.log("\n→ إنشاء مشروع Xcode (npx cap add ios)…");
  run("npx cap add ios");
} else {
  console.log("\n→ مزامنة Capacitor…");
  run("npx cap sync ios");
}

const configJson = {
  webAppUrl: `${webAppUrl}/`,
  apiUrl: apiUrl || "",
  siteUrl: VERCEL_SITE_URL,
  bundleId: appId,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(root, "ios-app.config.json"),
  JSON.stringify(configJson, null, 2) + "\n",
  "utf8",
);
console.log("  ✓ ios-app.config.json");
console.log("\n✓ جاهز لـ Codemagic / Xcode — مجلد ios/\n");
