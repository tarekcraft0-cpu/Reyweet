/**
 * بناء iOS مستقل عبر EAS (profile: preview = أيقونة Retweet، ليس Expo Go).
 * يتطلب EXPO_TOKEN + ربط Apple ID على expo.dev + تسجيل الآيفون.
 */
import { spawnSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobile = path.join(root, "mobile");
const profile = process.env.EAS_IOS_PROFILE || "preview";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || mobile,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function readTunnelEnv() {
  const p = path.join(root, "PUBLIC_TUNNEL_URL.txt");
  if (!fs.existsSync(p)) return {};
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const site = (lines[0] || "").replace(/\/$/, "");
  const app = (lines.find(l => /\/app\/?$/.test(l)) || `${site}/app`).replace(/\/$/, "");
  if (!site) return {};
  return {
    EXPO_PUBLIC_API_URL: site,
    EXPO_PUBLIC_WEB_APP_URL: app,
    EXPO_PUBLIC_WEB_APP_URL_STRICT: "1",
  };
}

function patchEasPreviewEnv() {
  const easPath = path.join(mobile, "eas.json");
  const eas = JSON.parse(fs.readFileSync(easPath, "utf8"));
  const tunnel = readTunnelEnv();
  eas.build.preview.env = {
    EXPO_PUBLIC_WEB_APP_URL_STRICT: "1",
    ...tunnel,
  };
  fs.writeFileSync(easPath, JSON.stringify(eas, null, 2) + "\n", "utf8");
}

console.log("\n══ EAS Build — iOS (standalone / internal) ══\n");

if (!process.env.EXPO_TOKEN?.trim()) {
  console.error("❌ عيّن EXPO_TOKEN ثم أعد التشغيل.");
  process.exit(1);
}

execSync("node scripts/sync-mobile-ios.mjs --public", { cwd: root, stdio: "inherit" });
patchEasPreviewEnv();

console.log("→ التحقق من الحساب…");
run("npx", ["eas-cli", "whoami"]);

console.log("→ ربط المشروع…");
run("npx", ["eas-cli", "init", "--non-interactive", "--force"]);

console.log("\n→ بدء البناء السحابي (قد يستغرق 15–25 دقيقة)…\n");
run("npx", [
  "eas-cli",
  "build",
  "--platform",
  "ios",
  "--profile",
  profile,
  "--non-interactive",
  "--wait",
]);

console.log("\n✓ انتهى البناء — افتح رابط التثبيت من Safari على الآيفون.\n");
