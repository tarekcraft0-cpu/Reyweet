/**
 * يولّد أيقونة iOS 1024×1024 من شعار Retweet ويضعها في مشروع Capacitor.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoSrc = path.join(root, "src/assets/logo.png");
const dest = path.join(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
);

async function loadSharp() {
  const require = createRequire(import.meta.url);
  for (const id of [path.join(root, "backend/node_modules/sharp"), "sharp"]) {
    try {
      return require(id);
    } catch {
      /* next */
    }
  }
  throw new Error("sharp missing — run: npm install --prefix backend");
}

async function main() {
  if (!fs.existsSync(logoSrc)) {
    console.error("sync-ios-app-icon: missing", logoSrc);
    process.exit(1);
  }
  const sharp = await loadSharp();
  const size = 1024;
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  const resized = await sharp(logoSrc)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();
  const buf = await sharp({
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
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log(`  ✓ ${path.relative(root, dest)} (1024×1024)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
