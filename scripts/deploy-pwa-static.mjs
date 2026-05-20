/** ينشر spa-dist إلى _vercel_site/app (بعد build:spa) */
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "spa-dist");
const dest = path.join(root, "_vercel_site", "app");

if (!existsSync(path.join(src, "index.html"))) {
  console.error("شغّل أولاً: npm run build:spa");
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
writeFileSync(
  path.join(dest, "web-auth-config.json"),
  JSON.stringify({ apiUrl: "", supabaseUrl: "", supabaseAnonKey: "" }, null, 2) + "\n",
  "utf8",
);
console.log("✓ PWA منشور → _vercel_site/app/");
