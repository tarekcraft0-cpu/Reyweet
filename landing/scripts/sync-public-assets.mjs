/**
 * Copies app icons from mobile/ into landing/public/ for the static site.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(landingRoot, "..");
const publicDir = path.join(landingRoot, "public");
const mobileImages = path.join(repoRoot, "mobile", "assets", "images");

const copies = [
  { from: "icon.png", to: "logo.png" },
  { from: "favicon.png", to: "favicon.png" },
];

mkdirSync(publicDir, { recursive: true });

for (const { from, to } of copies) {
  const src = path.join(mobileImages, from);
  const dest = path.join(publicDir, to);
  if (!existsSync(src)) {
    console.warn(`sync-public-assets: skip missing ${src}`);
    continue;
  }
  copyFileSync(src, dest);
  console.log(`sync-public-assets: ${to}`);
}
