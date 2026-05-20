/**
 * يضبط عناوين Retweet في mobile/app.config.ts (أو app.json) للآيفون:
 * - apiUrl من LAN أو من PUBLIC_TUNNEL_URL.txt
 * - webAppUrl من النفق العام أو LAN :3080/app/
 *
 * شغّل: npm run mobile:sync
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.API_PORT || 3000);
const WEB_PORT = Number(process.env.WEB_PORT || 3080);

function pickLanIPv4() {
  const candidates = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      const fam = ni.family;
      if ((fam !== "IPv4" && fam !== 4) || ni.internal) continue;
      if (ni.address.startsWith("169.254.")) continue;
      candidates.push(ni.address);
    }
  }
  return candidates.find(a => a.startsWith("192.168.")) || candidates[0] || "127.0.0.1";
}

function readStableUrlFromEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return "";
  const m = fs.readFileSync(envPath, "utf8").match(/^RETWEET_STABLE_URL=(.+)$/m);
  return m ? m[1].trim().replace(/\/$/, "") : "";
}

function readPublicTunnel() {
  const stable = readStableUrlFromEnv();
  if (stable) {
    return { site: stable, app: `${stable}/app` };
  }
  const p = path.join(root, "PUBLIC_TUNNEL_URL.txt");
  if (!fs.existsSync(p)) return { site: "", app: "" };
  const lines = fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const site = (lines[0] || "").replace(/\/$/, "");
  const app = (lines.find(l => /\/app\/?$/.test(l)) || (site ? `${site}/app` : "")).replace(/\/$/, "");
  return { site, app };
}

const useVercel = process.argv.includes("--vercel");
const usePublic = process.env.MOBILE_USE_PUBLIC === "1" || process.argv.includes("--public");
const host = process.env.LAN_HOST?.trim() || pickLanIPv4();
const tunnel = readPublicTunnel();
const vercelApp = "https://reyweet.vercel.app/app";
let apiUrl = usePublic && tunnel.site ? tunnel.site : `http://${host}:${API_PORT}`;
let webAppUrl = usePublic && tunnel.app ? tunnel.app : `http://${host}:${WEB_PORT}/app`;
if (useVercel) {
  webAppUrl = vercelApp;
  if (!apiUrl.startsWith("https://") || apiUrl.includes(":3080")) {
    const apiFile = path.join(root, "PUBLIC_API_URL.txt");
    if (fs.existsSync(apiFile)) {
      const u = fs.readFileSync(apiFile, "utf8").trim().split(/\r?\n/)[0]?.trim();
      if (u) apiUrl = u.replace(/\/$/, "");
    }
  }
}

function patchAppConfigTs() {
  const p = path.join(root, "mobile/app.config.ts");
  if (!fs.existsSync(p)) return false;
  let text = fs.readFileSync(p, "utf8");
  text = text.replace(/apiUrl:\s*"[^"]*"/, `apiUrl: "${apiUrl}"`);
  text = text.replace(/webAppUrl:\s*"[^"]*"/, `webAppUrl: "${webAppUrl}"`);
  fs.writeFileSync(p, text, "utf8");
  console.log(`  ✓ mobile/app.config.ts`);
  return true;
}

function patchAppJson() {
  const p = path.join(root, "mobile/app.json");
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.expo = j.expo || {};
  j.expo.extra = j.expo.extra || {};
  j.expo.extra.apiUrl = apiUrl;
  j.expo.extra.webAppUrl = webAppUrl;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n", "utf8");
  console.log(`  ✓ mobile/app.json`);
}

console.log("\n══ مزامنة عناوين تطبيق الآيفون ══\n");
console.log(`  API:      ${apiUrl}`);
console.log(`  WebView:  ${webAppUrl}\n`);

if (!patchAppConfigTs()) patchAppJson();

const envPath = path.join(root, "mobile/.env");
const envLines = [
  `EXPO_PUBLIC_API_URL=${apiUrl}`,
  `EXPO_PUBLIC_WEB_APP_URL=${webAppUrl}`,
  `EXPO_PUBLIC_WEB_APP_URL_STRICT=1`,
];
if (fs.existsSync(envPath)) {
  let text = fs.readFileSync(envPath, "utf8");
  for (const line of envLines) {
    const key = line.split("=")[0];
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, text, "utf8");
} else {
  fs.writeFileSync(envPath, envLines.join("\n") + "\n", "utf8");
}
console.log(`  ✓ mobile/.env`);

console.log(`
للتثبيت على الآيفون (Mac + Xcode + كابل):
  npm run mobile:ios:install
`);
