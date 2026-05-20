/**
 * بناء APK لأندرويد ونسخه إلى landing/public/downloads/retweet.apk
 *
 * المسارات:
 *   A) EAS (موصى به على Windows): EXPO_TOKEN + npm run mobile:apk:build
 *   B) محلي: Android SDK + JDK → expo prebuild + gradlew assembleRelease
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  mobileDir,
  root,
  copyApkToDownloads,
  findLocalApkArtifact,
  readAppVersion,
  writeAndroidVersionJson,
} from "./lib/android-release.mjs";

function run(cmd, args, cwd = mobileDir, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function patchEasAndroid() {
  const easPath = path.join(mobileDir, "eas.json");
  const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
  const apiFile = path.join(root, "PUBLIC_API_URL.txt");
  let apiUrl = "";
  if (fs.existsSync(apiFile)) {
    apiUrl = fs.readFileSync(apiFile, "utf8").trim().split(/\r?\n/)[0]?.trim() || "";
  }
  const env = {
    EXPO_PUBLIC_WEB_APP_URL: "https://reyweet.vercel.app/app",
    EXPO_PUBLIC_WEB_APP_URL_STRICT: "1",
    ...(apiUrl ? { EXPO_PUBLIC_API_URL: apiUrl.replace(/\/$/, "") } : {}),
  };
  eas.build["android-apk"] = {
    distribution: "internal",
    android: { buildType: "apk" },
    env,
  };
  fs.writeFileSync(easPath, JSON.stringify(eas, null, 2) + "\n", "utf8");
}

function buildWithEas() {
  console.log("\n→ EAS Build (Android APK)…\n");
  const outDir = path.join(mobileDir, "dist-apk");
  fs.mkdirSync(outDir, { recursive: true });
  const local = process.argv.includes("--local");
  const args = [
    "eas-cli",
    "build",
    "--platform",
    "android",
    "--profile",
    "android-apk",
    "--non-interactive",
    "--output",
    path.join(outDir, "retweet.apk"),
  ];
  if (local) args.push("--local");
  run("npx", args);
  return path.join(outDir, "retweet.apk");
}

function buildWithGradle() {
  console.log("\n→ بناء محلي (prebuild + Gradle)…\n");
  const androidDir = path.join(mobileDir, "android");
  if (!fs.existsSync(androidDir)) {
    run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"]);
  }
  const gradlew =
    process.platform === "win32"
      ? path.join(androidDir, "gradlew.bat")
      : path.join(androidDir, "gradlew");
  if (!fs.existsSync(gradlew)) {
    console.error("gradlew غير موجود — ثبّت Android Studio أو استخدم EAS: npm run mobile:apk:build");
    process.exit(1);
  }
  run(gradlew, ["assembleRelease"], androidDir);
  const apk = findLocalApkArtifact();
  if (!apk) {
    console.error("لم يُعثر على APK بعد Gradle — راجع android/app/build/outputs/apk/");
    process.exit(1);
  }
  const outDir = path.join(mobileDir, "dist-apk");
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, "retweet.apk");
  fs.copyFileSync(apk, dest);
  return dest;
}

console.log("\n══ Retweet — بناء APK (Android) ══\n");

execSync("node scripts/sync-mobile-ios.mjs --vercel", { cwd: root, stdio: "inherit" });
patchEasAndroid();

const useEas = process.argv.includes("--eas") || !!process.env.EXPO_TOKEN?.trim();
let builtApk = "";

if (useEas) {
  if (!process.env.EXPO_TOKEN?.trim()) {
    console.error("❌ لبناء EAS عيّن EXPO_TOKEN من https://expo.dev");
    process.exit(1);
  }
  run("npx", ["eas-cli", "whoami"]);
  builtApk = buildWithEas();
} else {
  try {
    builtApk = buildWithGradle();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

const dest = copyApkToDownloads(builtApk);
const ver = readAppVersion();
writeAndroidVersionJson({
  version: ver.version,
  versionCode: ver.versionCode,
  notes: "بناء APK من المشروع",
});

console.log(`\n✓ APK جاهز: ${dest}`);
console.log(`  بعد النشر: ${process.env.RETWEET_VERCEL_SITE_URL || "https://reyweet.vercel.app"}/downloads/retweet.apk\n`);
