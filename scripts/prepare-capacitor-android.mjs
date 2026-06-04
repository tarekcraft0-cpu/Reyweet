/**
 * تجهيز Android (Capacitor) — نفس SPA/API كالموقع و iOS.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMobileApiUrl, VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";
import { injectNativeShellIndex } from "./lib/inject-native-shell-index.mjs";
import { resolveAndroidSdkRoot, writeAndroidLocalProperties } from "./ensure-android-sdk.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiUrl = resolveMobileApiUrl();
const webAppUrl = `${VERCEL_SITE_URL}/app`;
const appId = process.env.CAPACITOR_APP_ID || "com.reyweet.app";

function run(cmd, opts = {}) {
  execSync(cmd, {
    cwd: opts.cwd || root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...opts.env },
  });
}

function patchAndroidAppGradle(version, versionCode) {
  const gradle = path.join(root, "android", "app", "build.gradle");
  if (!fs.existsSync(gradle)) return;
  let text = fs.readFileSync(gradle, "utf8");
  if (/versionCode\s+\d+/.test(text)) {
    text = text.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  } else {
    text = text.replace(/defaultConfig\s*\{/, m => `${m}\n        versionCode ${versionCode}`);
  }
  if (/versionName\s+["']/.test(text)) {
    text = text.replace(/versionName\s+["'][^"']*["']/, `versionName "${version}"`);
  } else {
    text = text.replace(/versionCode\s+\d+/, m => `${m}\n        versionName "${version}"`);
  }
  if (!/signingConfig\s+signingConfigs\.debug/.test(text) && /buildTypes\s*\{/.test(text)) {
    text = text.replace(/release\s*\{/, `release {\n            signingConfig signingConfigs.debug`);
  }
  fs.writeFileSync(gradle, text, "utf8");
  console.log(`  ✓ android/app/build.gradle (v${version} / ${versionCode})`);
}

function patchAndroidEmbeddedCapConfig() {
  const capJsonPath = path.join(root, "android", "app", "src", "main", "assets", "capacitor.config.json");
  if (!fs.existsSync(capJsonPath)) return;
  let capJson = {};
  try {
    capJson = JSON.parse(fs.readFileSync(capJsonPath, "utf8"));
  } catch {
    capJson = {};
  }
  capJson.appId = appId;
  capJson.appName = "Reyweet";
  capJson.webDir = "public";
  let rootCap = {};
  try {
    rootCap = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
  } catch {
    try {
      const ts = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
      const resize = ts.match(/resize:\s*["'](\w+)["']/)?.[1];
      if (resize) rootCap = { plugins: { Keyboard: { resize } } };
    } catch {
      /* ignore */
    }
  }
  delete capJson.server;
  if (rootCap.android) {
    capJson.android = { ...(capJson.android || {}), ...rootCap.android };
  }
  if (rootCap.plugins) {
    capJson.plugins = { ...(capJson.plugins || {}), ...rootCap.plugins };
  }
  capJson.plugins = {
    ...(capJson.plugins || {}),
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
      ...((capJson.plugins || {}).PushNotifications || {}),
    },
  };
  if (!Array.isArray(capJson.packageClassList)) capJson.packageClassList = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["@capacitor/keyboard"] && !capJson.packageClassList.includes("KeyboardPlugin")) {
    capJson.packageClassList.push("KeyboardPlugin");
  }
  if (
    deps["@capacitor/push-notifications"] &&
    !capJson.packageClassList.includes("PushNotificationsPlugin")
  ) {
    capJson.packageClassList.push("PushNotificationsPlugin");
  }
  fs.writeFileSync(capJsonPath, JSON.stringify(capJson, null, 2) + "\n", "utf8");
  console.log(
    `  ✓ android assets/capacitor.config.json (plugins: ${capJson.packageClassList.length})`,
  );
}

function ensureAndroidAssetPublic() {
  const assetPublic = path.join(root, "android", "app", "src", "main", "assets", "public");
  if (!fs.existsSync(assetPublic)) return;
  const bootstrapSrc = path.join(root, "spa", "public", "native-no-select-bootstrap.js");
  const bootstrapDst = path.join(assetPublic, "native-no-select-bootstrap.js");
  if (fs.existsSync(bootstrapSrc) && !fs.existsSync(bootstrapDst)) {
    fs.copyFileSync(bootstrapSrc, bootstrapDst);
    console.log("  ✓ android assets/public/native-no-select-bootstrap.js");
  }
  const index = path.join(assetPublic, "index.html");
  injectNativeShellIndex(index, apiUrl, root);
}

const sdkRoot = resolveAndroidSdkRoot();
if (sdkRoot && writeAndroidLocalProperties(sdkRoot)) {
  console.log(`  SDK:  ${sdkRoot}`);
}

console.log("\n══ Reyweet Android — Capacitor (نسخة الموقع) ══\n");
console.log(`  API:  ${apiUrl}`);
console.log(`  Web:  ${webAppUrl}/\n`);

process.env.RETWEET_PUBLIC_API_URL = apiUrl;
run("node scripts/prepare-capacitor-ios.mjs");

const androidDir = path.join(root, "android");
if (!fs.existsSync(androidDir)) {
  console.log("\n→ إنشاء مشروع Android (npx cap add android)…\n");
  run("npx cap add android");
} else {
  console.log("\n→ Capacitor sync android…\n");
  run("npx cap sync android");
}

const verFile = path.join(root, "landing", "public", "downloads", "android-version.json");
let version = "1.0.2";
let versionCode = 3;
if (fs.existsSync(verFile)) {
  try {
    const j = JSON.parse(fs.readFileSync(verFile, "utf8"));
    version = j.version || version;
    versionCode = Number(j.versionCode) || versionCode;
  } catch {
    /* ignore */
  }
}
patchAndroidAppGradle(version, versionCode);
patchAndroidEmbeddedCapConfig();
ensureAndroidAssetPublic();

const webAuth = { apiUrl, supabaseUrl: "", supabaseAnonKey: "" };
const assetPublic = path.join(androidDir, "app", "src", "main", "assets", "public");
if (fs.existsSync(assetPublic)) {
  fs.writeFileSync(
    path.join(assetPublic, "web-auth-config.json"),
    JSON.stringify(webAuth, null, 2) + "\n",
    "utf8",
  );
  console.log("  ✓ android assets/public/web-auth-config.json");
}

run("node scripts/verify-android-api-bundle.mjs");

console.log("\n✓ جاهز لـ Gradle assembleRelease\n");
