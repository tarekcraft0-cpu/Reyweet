/**
 * مزامنة شعار Retweet: أيقونة iOS + شاشة الإقلاع (بدون أيقونة Capacitor الافتراضية).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  springboardIconBuffers,
  splashBuffers,
  syncXcodeAssetCatalog,
} from "./lib/ios-icon-buffers.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const icons = await springboardIconBuffers(root);
  syncXcodeAssetCatalog(root, icons);
  console.log(`  ✓ ios/.../AppIcon-512@2x.png (1024×1024 من src/assets/logo.png)`);

  const splashSet = path.join(root, "ios", "App", "App", "Assets.xcassets", "Splash.imageset");
  if (fs.existsSync(path.join(root, "ios"))) {
    const { buf } = await splashBuffers(root);
    fs.mkdirSync(splashSet, { recursive: true });
    for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
      fs.writeFileSync(path.join(splashSet, name), buf);
    }
    console.log("  ✓ Splash.imageset (شعار Retweet)");
  }

  const { execSync } = await import("node:child_process");
  execSync("node scripts/generate-pwa-icons.mjs", { cwd: root, stdio: "inherit" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
