/**
 * بناء landing + SPA لـ https://reyweet.vercel.app مع ربط API العام.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicApiUrl, VERCEL_SITE_URL } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiUrl = readPublicApiUrl();

if (!apiUrl) {
  console.error(`
══ رابط API العام مطلوب ══

شغّل أولاً (في نافذة منفصلة):
  npm run api:tunnel

ثم أعد:
  npm run vercel:build
`);
  process.exit(1);
}

console.log("\n══ بناء لـ Vercel (reyweet.vercel.app) ══\n");
console.log(`  API:  ${apiUrl}`);
console.log(`  Site: ${VERCEL_SITE_URL}\n`);

process.env.RETWEET_PUBLIC_API_URL = apiUrl;
delete process.env.RETWEET_SAME_ORIGIN;

execSync("node scripts/write-public-web-config.mjs", { cwd: root, stdio: "inherit" });

execSync("npm run build:spa", { cwd: root, stdio: "inherit" });
execSync("npm run build --prefix landing", { cwd: root, stdio: "inherit" });
execSync("node scripts/prepare-vercel-static.mjs", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, RETWEET_PUBLIC_API_URL: apiUrl },
});

console.log("\n✓ جاهز للنشر على Vercel — npm run vercel:deploy\n");
