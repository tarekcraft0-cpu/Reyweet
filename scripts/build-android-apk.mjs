/**
 * بناء APK (Capacitor) ونسخه إلى landing/public/downloads/retweet.apk
 *
 *   npm run android:apk:build
 *   SKIP_ANDROID_SDK=1  — إذا ANDROID_HOME مُعدّ مسبقاً
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureAndroidSdk,
  resolveAndroidSdkRoot,
  writeAndroidLocalProperties,
} from "./ensure-android-sdk.mjs";
import {
  copyApkToDownloads,
  readAppVersion,
  writeAndroidVersionJson,
  root,
} from "./lib/android-release.mjs";

const skipSdk = process.argv.includes("--skip-sdk") || process.env.SKIP_ANDROID_SDK === "1";

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function findBuiltApk() {
  const candidates = [
    path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release.apk"),
    path.join(root, "android", "app", "build", "outputs", "apk", "release", "app-release-unsigned.apk"),
    path.join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"),
    path.join(root, "android", "build", "outputs", "apk", "release", "app-release.apk"),
  ];
  return candidates.find(p => fs.existsSync(p)) || "";
}

function resolveJdk21() {
  if (process.env.JAVA_HOME?.trim()) {
    const v = spawnSync("java", ["-version"], {
      encoding: "utf8",
      env: process.env,
      shell: true,
    });
    if (String(v.stderr || v.stdout || "").includes("21.")) return process.env.JAVA_HOME;
  }
  if (process.platform === "win32") {
    const ms = path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Microsoft");
    if (fs.existsSync(ms)) {
      const dir = fs
        .readdirSync(ms)
        .filter(n => /^jdk-21/i.test(n))
        .map(n => path.join(ms, n))
        .find(p => fs.existsSync(path.join(p, "bin", "java.exe")));
      if (dir) return dir;
    }
  }
  return "";
}

console.log("\n══ Reyweet — بناء APK (Capacitor / Android) ══\n");

const jdk21 = resolveJdk21();
if (jdk21) {
  process.env.JAVA_HOME = jdk21;
  const sep = process.platform === "win32" ? ";" : ":";
  process.env.PATH = [path.join(jdk21, "bin"), process.env.PATH || ""].join(sep);
} else {
  console.warn("  ⚠ يُفضّل JDK 21 — Capacitor 7 يتطلب Java 21 للبناء");
}

if (!skipSdk) {
  try {
    ensureAndroidSdk();
  } catch (e) {
    console.error("❌ Android SDK:", e?.message || e);
    console.error("   ثبّت Android Studio أو عيّن ANDROID_HOME ثم أعد المحاولة.");
    process.exit(1);
  }
} else {
  const sdk = resolveAndroidSdkRoot();
  if (sdk) {
    process.env.ANDROID_HOME = sdk;
    process.env.ANDROID_SDK_ROOT = sdk;
  } else if (!process.env.ANDROID_HOME?.trim()) {
    console.warn("  ⚠ SKIP_ANDROID_SDK=1 لكن ANDROID_HOME غير معيّن");
  }
}

const sdkForGradle = resolveAndroidSdkRoot();
if (sdkForGradle && writeAndroidLocalProperties(sdkForGradle)) {
  console.log(`  ✓ android/local.properties → ${sdkForGradle}`);
}

run(process.execPath, [path.join(root, "scripts", "prepare-capacitor-android.mjs")]);

const androidDir = path.join(root, "android");
const gradlew =
  process.platform === "win32"
    ? path.join(androidDir, "gradlew.bat")
    : path.join(androidDir, "gradlew");

if (!fs.existsSync(gradlew)) {
  console.error("gradlew غير موجود — تأكد من npx cap add android");
  process.exit(1);
}

function gradle(task) {
  if (process.platform === "win32") {
    run("cmd", ["/c", gradlew, task], androidDir);
  } else {
    run(gradlew, [task], androidDir);
  }
}

console.log("\n→ Gradle assembleRelease…\n");
try {
  gradle("assembleRelease");
} catch {
  /* handled by exit in run */
}

let apk = findBuiltApk();
if (!apk) {
  console.log("\n→ محاولة assembleDebug…\n");
  gradle("assembleDebug");
  apk = findBuiltApk();
}

if (!apk) {
  console.error("لم يُعثر على APK بعد Gradle");
  process.exit(1);
}

const dest = copyApkToDownloads(apk);
const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
const ver = readAppVersion();
writeAndroidVersionJson({
  version: ver.version,
  versionCode: ver.versionCode,
  notes:
    "Reyweet Android v1.0.2 — إصلاح البيانات القديمة، حفظ الرسائل، safe area والكيبورد. احذف النسخة القديمة ثم ثبّت هذا الملف.",
  apkSizeMb: Number(mb),
});

console.log(`\n✓ APK جاهز: ${dest} (${mb} MB)`);
console.log(
  `  بعد النشر: ${process.env.RETWEET_VERCEL_SITE_URL || "https://reyweet.vercel.app"}/downloads/retweet.apk\n`,
);
