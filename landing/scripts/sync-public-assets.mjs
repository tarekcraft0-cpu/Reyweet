/**
 * Ensures landing/public/ exists. Does not overwrite logo.png / favicon.png
 * (keep the branded assets committed in landing/public/).
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const landingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(landingRoot, "public");

mkdirSync(publicDir, { recursive: true });

const logo = path.join(publicDir, "logo.png");
if (!existsSync(logo)) {
  console.warn("sync-public-assets: missing landing/public/logo.png — add your app logo there.");
} else {
  console.log("sync-public-assets: using existing logo.png");
}
