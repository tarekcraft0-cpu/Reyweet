/**
 * يكتب رابط API العام (نفق Cloudflare) في ملفات الويب والموبايل.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPublicApiUrl } from "./lib/read-public-api-url.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiUrl = readPublicApiUrl();

if (!apiUrl) {
  console.warn("write-public-web-config: لا يوجد RETWEET_PUBLIC_API_URL أو PUBLIC_API_URL.txt — شغّل npm run api:tunnel");
  process.exit(0);
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
writeJson("landing/public/app-config.json", { appPath: "/app/", siteUrl: "https://reyweet.vercel.app" });

const spaDist = path.join(root, "spa-dist/web-auth-config.json");
if (fs.existsSync(path.dirname(spaDist))) {
  writeJson("spa-dist/web-auth-config.json");
}

console.log(`\nرابط API العام: ${apiUrl}\n`);
