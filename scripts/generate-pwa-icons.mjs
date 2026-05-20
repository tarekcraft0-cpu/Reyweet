/**
 * يولّد أيقونات PWA من شعار Retweet (src/assets/logo.png).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoSrc = path.join(root, "src/assets/logo.png");

async function loadSharp() {
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(root, "backend/node_modules/sharp"),
    "sharp",
  ];
  for (const id of candidates) {
    try {
      return require(id);
    } catch {
      /* try next */
    }
  }
  throw new Error("sharp غير متوفر — شغّل: npm install --prefix backend");
}

async function iconBuffer(sharp, size, paddingRatio = 0.12) {
  const pad = Math.round(size * paddingRatio);
  const inner = size - pad * 2;
  const resized = await sharp(logoSrc)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(logoSrc)) {
    console.error("generate-pwa-icons: missing", logoSrc);
    process.exit(1);
  }
  const sharp = await loadSharp();

  const targets = [
    { file: "spa/public/icons/apple-touch-icon.png", size: 180 },
    { file: "spa/public/icons/icon-192.png", size: 192 },
    { file: "spa/public/icons/icon-512.png", size: 512 },
    { file: "spa/public/favicon.png", size: 48 },
    { file: "landing/public/logo.png", size: 512 },
    { file: "landing/public/favicon.png", size: 48 },
    { file: "landing/public/apple-touch-icon.png", size: 180 },
  ];

  for (const { file, size } of targets) {
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = await iconBuffer(sharp, size);
    fs.writeFileSync(dest, buf);
    console.log(`  ✓ ${file} (${size}×${size})`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
