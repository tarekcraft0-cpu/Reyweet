/**
 * يكتب رابط API للواجهة على Vercel (بروكسي) مع backend على VPS.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_VPS_API,
  readPublicApiUrl,
  resolveVpsBackendUrl,
  resolveWebFrontendApiUrl,
  isTunnelApiUrl,
  shouldUseVercelApiProxy,
  VERCEL_SITE_URL,
} from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRaw = readPublicApiUrl() || PRODUCTION_VPS_API;
const backendUrl = resolveVpsBackendUrl(backendRaw);
const useProxy = shouldUseVercelApiProxy(backendUrl) || isTunnelApiUrl(backendRaw);
const apiUrl = resolveWebFrontendApiUrl(backendRaw);
const siteUrl = VERCEL_SITE_URL;
const webAppUrl = `${VERCEL_SITE_URL}/app/`;

if (useProxy) {
  console.log(`  (بروكسي Vercel: ${VERCEL_SITE_URL} → ${backendUrl})`);
} else {
  console.log(`  (اتصال مباشر: ${backendUrl})`);
}

function writeJson(rel, extra = {}) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let base = {};
  if (fs.existsSync(p)) {
    try {
      base = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(
    p,
    JSON.stringify({ ...base, apiUrl, supabaseUrl: "", supabaseAnonKey: "", ...extra }, null, 2) + "\n",
    "utf8",
  );
  console.log(`  ✓ ${rel} → ${apiUrl}`);
}

writeJson("spa/public/web-auth-config.json");
writeJson("landing/public/app-config.json", {
  appPath: "/app/",
  siteUrl,
  webAppUrl,
});

const spaDist = path.join(root, "spa-dist/web-auth-config.json");
if (fs.existsSync(path.dirname(spaDist))) {
  writeJson("spa-dist/web-auth-config.json");
}

console.log(`\nرابط API للواجهة: ${apiUrl}`);
console.log(`Backend VPS:       ${backendUrl}`);
console.log(`رابط التطبيق:      ${webAppUrl}\n`);
