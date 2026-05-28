/**
 * App Store submission gate — fails CI if production bundle or native project is not ready.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const mobile = spawnSync(process.execPath, ["scripts/verify-mobile-app.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (mobile.status !== 0) {
  fail("mobile:verify failed");
  if (mobile.stdout) console.log(mobile.stdout);
  if (mobile.stderr) console.error(mobile.stderr);
}

const bundle = spawnSync(process.execPath, ["scripts/verify-ios-api-bundle.mjs"], {
  cwd: root,
  encoding: "utf8",
});
if (bundle.status !== 0) {
  fail("ios:verify-bundle failed");
}

for (const rel of [
  "ios/App/App/PrivacyInfo.xcprivacy",
  "ios/App/App/ar.lproj/InfoPlist.strings",
  "landing/public/privacy.html",
  "capacitor.config.ts",
]) {
  if (!fs.existsSync(path.join(root, rel))) fail(`missing ${rel}`);
}

const plist = read(path.join(root, "ios/App/App/Info.plist"));
if (!plist.includes("ITSAppUsesNonExemptEncryption")) {
  fail("Info.plist missing ITSAppUsesNonExemptEncryption");
}

const pbx = read(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"));
if (!pbx.includes("PrivacyInfo.xcprivacy")) {
  fail("Xcode project must include PrivacyInfo.xcprivacy");
}
if (!pbx.includes("IPHONEOS_DEPLOYMENT_TARGET = 15.0")) {
  fail("iOS deployment target should be 15.0");
}

const indexPaths = [
  path.join(root, "ios/App/App/public/index.html"),
  path.join(root, "dist/index.html"),
];
let checkedHtml = 0;
for (const p of indexPaths) {
  const html = read(p);
  if (!html) continue;
  checkedHtml++;
  if (/__RETWEET_API_DEBUG__\s*=\s*true/.test(html)) {
    fail(`${path.relative(root, p)} has production API debug flag`);
  }
}

const srcSettings = read(path.join(root, "src/components/screens/SettingsScreen.tsx"));
if (!srcSettings.includes("apiDeleteAccount") && !srcSettings.includes("deleteAccount")) {
  fail("Settings must expose in-app account deletion");
}
if (!srcSettings.includes("privacy.html")) {
  fail("Settings must link to privacy policy URL");
}

const server = read(path.join(root, "backend/src/server.ts"));
if (!server.includes('app.delete("/v1/me/account"')) {
  fail("backend missing DELETE /v1/me/account");
}

const privacy = read(path.join(root, "landing/public/privacy.html"));
if (!privacy.includes("حذف الحساب") && !privacy.includes("Delete account")) {
  fail("privacy.html must document account deletion");
}

console.log("\n══ App Store readiness ══\n");
if (errors.length) {
  errors.forEach(e => console.log(`  ✗ ${e}`));
  console.log("");
  process.exit(1);
}
console.log(`✓ App Store checks passed (${checkedHtml} bundle HTML file(s) scanned)\n`);
