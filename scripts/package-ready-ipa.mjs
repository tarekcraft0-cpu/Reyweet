/**
 * يجهّز IPA غير موقّع — نفس الموقع + API + قاعدة البيانات (لتوقيع طرف ثالث لاحقاً).
 *
 *   node scripts/package-ready-ipa.mjs
 *   COPY_IPA_PATH=C:\path\base.ipa node scripts/package-ready-ipa.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicApiUrl, VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webAppUrl = `${VERCEL_SITE_URL}/app/`;
const apiUrl = readPublicApiUrl();
const appId = "com.reyweet.app";
const appName = "Reyweet";

const iosBuildDir = path.join(root, "ios", "build");
const defaultBase = path.join(iosBuildDir, "Reyweet-ready.ipa");
const fallbackBase = path.join(
  process.env.USERPROFILE || "",
  "Downloads",
  "Retweet-unsigned (3).ipa",
);
const baseIpa =
  process.env.COPY_IPA_PATH?.trim() ||
  (fs.existsSync(defaultBase) ? defaultBase : fallbackBase);
/** مخرجات IPA داخل مشروع iOS (Capacitor) — ليس خارج المستودع */
const outIpa = path.join(iosBuildDir, "Reyweet-ready.ipa");
const outDownloads = path.join(root, "landing", "public", "downloads", "retweet.ipa");
const workDir = path.join(root, ".ipa-package-work");

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
}

console.log("\n══ Reyweet — تجهيز IPA (نفس الموقع والخادم) ══\n");
console.log(`  الموقع:  ${webAppUrl}`);
console.log(`  API:     ${apiUrl || "(من Vercel app-config)"}\n`);

if (!fs.existsSync(baseIpa)) {
  console.error(`package-ready-ipa: لم يُعثر على ${baseIpa}`);
  process.exit(1);
}

if (apiUrl) {
  process.env.RETWEET_PUBLIC_API_URL = apiUrl;
  run("node scripts/write-public-web-config.mjs");
}

console.log("→ بناء SPA…");
run("npm run build:spa");

const spaDist = path.join(root, "spa-dist");
const indexPath = path.join(spaDist, "index.html");
if (apiUrl && fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");
  const tag = `<script>window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};</script>`;
  if (!html.includes("__RETWEET_API_URL__")) {
    html = html.replace("</head>", `${tag}\n</head>`);
    fs.writeFileSync(indexPath, html, "utf8");
  }
}

const capConfig = {
  appId,
  appName,
  webDir: "public",
  server: {
    url: webAppUrl,
    cleartext: false,
  },
  packageClassList: [],
};

const webAuth = {
  apiUrl: apiUrl || "",
  supabaseUrl: "",
  supabaseAnonKey: "",
};

if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(workDir, { recursive: true });

const zipPath = path.join(workDir, "base.zip");
fs.copyFileSync(baseIpa, zipPath);
run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${workDir.replace(/'/g, "''")}' -Force"`);

const appGlob = path.join(workDir, "Payload", "*.app");
const payloadDirs = fs.readdirSync(path.join(workDir, "Payload"));
const appFolder = payloadDirs.find((d) => d.endsWith(".app"));
if (!appFolder) {
  console.error("package-ready-ipa: لم يُعثر على .app داخل IPA");
  process.exit(1);
}

const appPath = path.join(workDir, "Payload", appFolder);
const publicDir = path.join(appPath, "public");

if (fs.existsSync(publicDir)) fs.rmSync(publicDir, { recursive: true, force: true });
fs.cpSync(spaDist, publicDir, { recursive: true });

fs.writeFileSync(
  path.join(appPath, "capacitor.config.json"),
  JSON.stringify(capConfig, null, "\t") + "\n",
  "utf8",
);
fs.writeFileSync(
  path.join(publicDir, "web-auth-config.json"),
  JSON.stringify(webAuth, null, 2) + "\n",
  "utf8",
);

const appConfig = {
  apiUrl: apiUrl || "",
  appPath: "/app/",
  siteUrl: VERCEL_SITE_URL,
  supabaseUrl: "",
  supabaseAnonKey: "",
};
fs.writeFileSync(
  path.join(publicDir, "app-config.json"),
  JSON.stringify(appConfig, null, 2) + "\n",
  "utf8",
);

const meta = {
  version: "1.0.0",
  bundleId: appId,
  title: appName,
  signed: false,
  installMethod: "third-party-sign",
  webAppUrl,
  apiUrl: apiUrl || "",
  builtAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(root, "landing", "public", "downloads"), { recursive: true });
fs.writeFileSync(
  path.join(root, "landing", "public", "downloads", "ios-version.json"),
  JSON.stringify(meta, null, 2) + "\n",
  "utf8",
);

fs.mkdirSync(iosBuildDir, { recursive: true });
const payloadZip = path.join(workDir, "payload.zip");
if (fs.existsSync(payloadZip)) fs.unlinkSync(payloadZip);

run(
  `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(workDir, "Payload").replace(/'/g, "''")}' -DestinationPath '${payloadZip.replace(/'/g, "''")}' -Force"`,
);

const ipaZip = fs.readFileSync(payloadZip);
fs.writeFileSync(outIpa, ipaZip);
fs.copyFileSync(outIpa, outDownloads);

const mb = (fs.statSync(outIpa).size / (1024 * 1024)).toFixed(1);
console.log(`\n✓ IPA جاهز (${mb} MB):`);
console.log(`    ${outIpa}`);
console.log(`    ${outDownloads}`);
console.log(`\n  WebView → ${webAppUrl}`);
console.log(`  API     → ${apiUrl || "من الموقع عند التشغيل"}`);
console.log("\n  وقّعه عبر تطبيق بلس / Sideloadly ثم ثبّت.\n");
console.log("  على PC: npm run stack:reyweet (خادم + نفق + قاعدة البيانات)\n");
