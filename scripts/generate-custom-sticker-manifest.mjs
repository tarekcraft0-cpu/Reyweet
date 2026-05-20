/**
 * ينسخ ملصقاتك من public/stickers/custom إلى spa/public/stickers/custom
 * ويبني manifest.json للتبويب «مخصص».
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "public", "stickers", "custom");
const destDir = path.join(root, "spa", "public", "stickers", "custom");
const out = path.join(destDir, "manifest.json");

const MEDIA_RE = /\.(png|jpe?g|webp|gif|avif|svg|mp4|webm|mov|m4v|ogg)$/i;

fs.mkdirSync(destDir, { recursive: true });

if (!fs.existsSync(srcDir)) {
  fs.writeFileSync(out, JSON.stringify({ files: [] }, null, 2), "utf8");
  console.log("generate-custom-sticker-manifest: لا مجلد public/stickers/custom — قائمة فارغة");
  process.exit(0);
}

const files = fs
  .readdirSync(srcDir, { withFileTypes: true })
  .filter(e => e.isFile() && MEDIA_RE.test(e.name) && e.name !== "manifest.json")
  .map(e => e.name)
  .sort((a, b) => a.localeCompare(b, "ar"));

for (const name of files) {
  const from = path.join(srcDir, name);
  const to = path.join(destDir, name);
  const st = fs.statSync(from);
  if (!fs.existsSync(to) || fs.statSync(to).mtimeMs < st.mtimeMs || fs.statSync(to).size !== st.size) {
    fs.copyFileSync(from, to);
  }
}

// احذف من الوجهة ما لم يعد في المصدر
for (const name of fs.readdirSync(destDir)) {
  if (name === "manifest.json") continue;
  if (!files.includes(name)) {
    try {
      fs.unlinkSync(path.join(destDir, name));
    } catch {
      /* ignore */
    }
  }
}

fs.writeFileSync(out, JSON.stringify({ files }, null, 2), "utf8");
console.log(`generate-custom-sticker-manifest: ${files.length} ملصق → spa/public/stickers/custom`);
