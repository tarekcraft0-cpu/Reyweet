/**
 * يثبّت Android SDK محلياً إن لم يكن موجوداً (Windows/macOS/Linux).
 * يضبط ANDROID_HOME و PATH للعمليات التالية.
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function defaultSdkRoot() {
  if (process.env.ANDROID_HOME?.trim()) return process.env.ANDROID_HOME.trim();
  if (process.env.ANDROID_SDK_ROOT?.trim()) return process.env.ANDROID_SDK_ROOT.trim();
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), "Android", "Sdk");
  }
  return path.join(os.homedir(), "Android", "Sdk");
}

/** يكتب android/local.properties حتى يجد Gradle الـ SDK (لا يُرفع إلى git). */
export function writeAndroidLocalProperties(sdkRoot) {
  const sdk = (sdkRoot || resolveAndroidSdkRoot()).trim();
  if (!sdk) return false;
  const propsPath = path.join(root, "android", "local.properties");
  const sdkDir = sdk.replace(/\\/g, "/");
  fs.writeFileSync(propsPath, `## Auto-generated — do not commit\nsdk.dir=${sdkDir}\n`, "utf8");
  process.env.ANDROID_HOME = sdk;
  process.env.ANDROID_SDK_ROOT = sdk;
  return true;
}

export function resolveAndroidSdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    defaultSdkRoot(),
    path.join(root, ".android-sdk"),
  ]
    .map(s => (s || "").trim())
    .filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "platform-tools", "adb" + (process.platform === "win32" ? ".exe" : "")))) {
      return c;
    }
  }
  return defaultSdkRoot();
}

function sdkmanagerPath(sdkRoot) {
  const cmdDir = path.join(sdkRoot, "cmdline-tools", "latest", "bin");
  const name = process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager";
  return path.join(cmdDir, name);
}

function acceptAndroidLicenses(sdkRoot) {
  const licensesDir = path.join(sdkRoot, "licenses");
  fs.mkdirSync(licensesDir, { recursive: true });
  const files = {
    "android-sdk-license": "24333f8a63b6825ea9c5514f83c2829b522d8d9be0e1746f46e8a4295d983c2",
    "android-sdk-preview-license": "84831b9409646a918e30573bab7c0c9ede6ebbef157d29b6bddf30a2f5ecdb03",
    "android-sdk-arm-dbt-license": "859f317696f21c621ab41d787fb0000000000000000000000000000000000",
    "google-gdk-license": "33b6a2b64607bd11a6b40e790b5174f0aa0b03a56e4bf12f0b43bd5a01023000",
  };
  for (const [name, hash] of Object.entries(files)) {
    fs.writeFileSync(path.join(licensesDir, name), `${hash}\n`, "utf8");
  }
  const sm = sdkmanagerPath(sdkRoot);
  if (fs.existsSync(sm)) {
    spawnSync(sm, ["--sdk_root=" + sdkRoot, "--licenses"], {
      input: "y\n".repeat(32),
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot },
    });
  }
}

function runSdkmanager(sdkRoot, packages) {
  const sm = sdkmanagerPath(sdkRoot);
  if (!fs.existsSync(sm)) throw new Error(`sdkmanager not found: ${sm}`);
  acceptAndroidLicenses(sdkRoot);
  const args = ["--sdk_root=" + sdkRoot, ...packages];
  const r = spawnSync(sm, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function downloadCmdlineTools(sdkRoot) {
  const url =
    process.env.ANDROID_CMDLINE_TOOLS_URL ||
    "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip";
  const zipPath = path.join(root, ".android-sdk-cache", "cmdline-tools.zip");
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  console.log("  → تحميل Android command-line tools…");
  execSync(
    `node -e "const https=require('https');const fs=require('fs');const f='${zipPath.replace(/\\/g, "/")}';const u='${url}';const go=(url)=>https.get(url,res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location)return go(res.headers.location);res.pipe(fs.createWriteStream(f)).on('finish',()=>process.exit(0));}).on('error',e=>{console.error(e);process.exit(1)});go(u);"`,
    { stdio: "inherit", cwd: root },
  );
  const extractDir = path.join(sdkRoot, "cmdline-tools", "_zip");
  fs.mkdirSync(extractDir, { recursive: true });
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: "inherit" },
    );
  } else {
    execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "inherit" });
  }
  const latest = path.join(sdkRoot, "cmdline-tools", "latest");
  fs.mkdirSync(path.dirname(latest), { recursive: true });
  const inner = path.join(extractDir, "cmdline-tools");
  if (fs.existsSync(inner)) {
    if (fs.existsSync(latest)) fs.rmSync(latest, { recursive: true, force: true });
    fs.renameSync(inner, latest);
  }
  fs.rmSync(extractDir, { recursive: true, force: true });
}

export function ensureAndroidSdk() {
  let sdkRoot = resolveAndroidSdkRoot();
  const adb = path.join(sdkRoot, "platform-tools", "adb" + (process.platform === "win32" ? ".exe" : ""));
  if (fs.existsSync(adb)) {
    process.env.ANDROID_HOME = sdkRoot;
    process.env.ANDROID_SDK_ROOT = sdkRoot;
    return sdkRoot;
  }

  sdkRoot = process.env.ANDROID_HOME?.trim() || defaultSdkRoot();
  fs.mkdirSync(sdkRoot, { recursive: true });

  if (!fs.existsSync(sdkmanagerPath(sdkRoot))) {
    downloadCmdlineTools(sdkRoot);
  }

  const packages = [
    "platform-tools",
    "platforms;android-34",
    "build-tools;34.0.0",
  ];
  console.log("\n→ تثبيت حزم Android SDK…\n");
  runSdkmanager(sdkRoot, packages);

  process.env.ANDROID_HOME = sdkRoot;
  process.env.ANDROID_SDK_ROOT = sdkRoot;
  const sep = process.platform === "win32" ? ";" : ":";
  const extra = [path.join(sdkRoot, "platform-tools"), sdkmanagerPath(sdkRoot).replace(/[/\\]sdkmanager\.bat?$/, "")];
  process.env.PATH = [...extra, process.env.PATH || ""].join(sep);
  console.log(`  ✓ ANDROID_HOME=${sdkRoot}\n`);
  return sdkRoot;
}

if (process.argv[1]?.endsWith("ensure-android-sdk.mjs")) {
  ensureAndroidSdk();
}
