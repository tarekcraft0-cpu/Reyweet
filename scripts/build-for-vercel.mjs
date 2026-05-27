/**
 * بناء landing + SPA لـ https://reyweet.vercel.app مع ربط API العام.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readPublicApiUrl,
  PRODUCTION_VPS_API,
  VERCEL_SITE_URL,
  shouldUseVercelApiProxy,
} from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendUrl = readPublicApiUrl() || PRODUCTION_VPS_API;
const useProxy = shouldUseVercelApiProxy(backendUrl);
const apiUrl = useProxy ? VERCEL_SITE_URL : backendUrl;

if (!backendUrl) {
  console.log(`
══ رابط API العام مطلوب ══

حدِّث عنوان الـ VPS في الملف:
  PUBLIC_API_URL.txt   (يكتبه تلقائياً: npm run contabo:deploy)

أو لتطوير محلي بدون VPS:
  npm run api:tunnel
`);
  process.exit(1);
}

console.log("\n══ بناء لـ Vercel (reyweet.vercel.app) ══\n");
console.log(`  API (واجهة): ${apiUrl}`);
if (useProxy) console.log(`  Backend:      ${backendUrl}`);
console.log(`  Site:         ${VERCEL_SITE_URL}\n`);

delete process.env.RETWEET_SAME_ORIGIN;

execSync("node scripts/write-public-web-config.mjs", { cwd: root, stdio: "inherit" });

execSync("npm run build:spa", { cwd: root, stdio: "inherit" });
execSync("npm run build --prefix landing", { cwd: root, stdio: "inherit" });
execSync("node scripts/prepare-vercel-static.mjs", {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    RETWEET_BACKEND_URL: backendUrl,
    RETWEET_PUBLIC_API_URL: apiUrl,
  },
});

console.log("\n✓ جاهز للنشر على Vercel — npm run vercel:deploy\n");
