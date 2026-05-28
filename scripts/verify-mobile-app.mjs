/**
 * Validates Reyweet is structured as a Capacitor mobile app (App Store ready layout).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function must(cond, msg) {
  if (!cond) errors.push(msg);
}

function warn(cond, msg) {
  if (!cond) warnings.push(msg);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

must(fs.existsSync(path.join(root, "capacitor.config.ts")), "capacitor.config.ts missing");
must(fs.existsSync(path.join(root, "ios", "App", "App.xcodeproj")), "ios/App Xcode project missing");
must(
  fs.existsSync(path.join(root, "ios", "App", "App", "RetweetBridgeViewController.swift")),
  "RetweetBridgeViewController.swift missing (native shell)",
);
must(fs.existsSync(path.join(root, "src", "spa", "WebAppRoot.tsx")), "SPA entry missing");
must(fs.existsSync(path.join(root, "vite.spa.config.ts")), "vite.spa.config.ts missing");

const capTs = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
must(/appId:\s*["']com\.reyweet\.app["']/.test(capTs), "capacitor.config.ts appId must be com.reyweet.app");
warn(!/server:\s*\{/.test(capTs), "capacitor.config.ts should not set server.url for store builds");

const iosCap = readJson(path.join(root, "ios", "App", "App", "capacitor.config.json"));
if (iosCap) {
  must(iosCap.appId === "com.reyweet.app", "ios embedded appId mismatch");
  must(iosCap.webDir === "public", "ios embedded webDir should be public");
  warn(
    Array.isArray(iosCap.packageClassList) && iosCap.packageClassList.length > 0,
    "ios capacitor.config.json packageClassList is empty — run npm run ios:prepare after cap sync",
  );
}

const iosApp = readJson(path.join(root, "ios-app.config.json"));
if (iosApp) {
  must(iosApp.bundled === true, "ios-app.config.json must have bundled: true");
  must(/^https:\/\//.test(iosApp.apiUrl || ""), "ios-app.config.json apiUrl must be HTTPS");
} else {
  warnings.push("ios-app.config.json missing — run npm run ios:prepare");
}

const plist = fs.readFileSync(path.join(root, "ios", "App", "App", "Info.plist"), "utf8");
must(plist.includes("NSCameraUsageDescription"), "Info.plist missing camera usage");
must(plist.includes("ITSAppUsesNonExemptEncryption"), "Info.plist missing encryption export key");

const podfile = fs.readFileSync(path.join(root, "ios", "App", "Podfile"), "utf8");
must(podfile.includes("CapacitorKeyboard"), "Podfile missing CapacitorKeyboard pod");

must(
  fs.existsSync(path.join(root, "ios", "App", "App", "PrivacyInfo.xcprivacy")),
  "PrivacyInfo.xcprivacy missing",
);
must(
  fs.existsSync(path.join(root, "landing", "public", "privacy.html")),
  "landing/public/privacy.html missing",
);

const pkg = readJson(path.join(root, "package.json"));
must(pkg?.dependencies?.["@capacitor/ios"], "package.json missing @capacitor/ios");
must(pkg?.scripts?.["ios:prepare"], "package.json missing ios:prepare script");

console.log("\n══ Mobile app structure check ══\n");
if (warnings.length) {
  console.log("Warnings:");
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  console.log("");
}
if (errors.length) {
  console.log("Errors:");
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  console.log("");
  process.exit(1);
}
console.log("✓ Reyweet is a Capacitor hybrid mobile app (iOS / App Store layout)\n");
