#!/usr/bin/env node
/** إعادة تطبيق شعار Retweet على IPA موجود دون build:spa */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyRetweetIconsToAppBundle,
  springboardIconBuffers,
} from "./lib/ios-icon-buffers.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ipaIn =
  process.argv[2]?.trim() ||
  path.join(root, "ios", "build", "Reyweet-ready.ipa");
const ipaOut = path.join(root, "ios", "build", "Reyweet-ready.ipa");
const ipaDl = path.join(root, "landing", "public", "downloads", "retweet.ipa");
const work = path.join(root, ".ipa-icon-patch");

async function main() {
  if (!fs.existsSync(ipaIn)) {
    console.error("missing", ipaIn);
    process.exit(1);
  }
  const icons = await springboardIconBuffers(root);
  if (fs.existsSync(work)) fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const zip = path.join(work, "in.zip");
  fs.copyFileSync(ipaIn, zip);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${work.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit", shell: true },
  );
  const appDir = fs.readdirSync(path.join(work, "Payload")).find((d) => d.endsWith(".app"));
  const appPath = path.join(work, "Payload", appDir);
  const r = applyRetweetIconsToAppBundle(appPath, icons, { removeAssetsCar: true });
  console.log(r.removedAssetsCar ? "✓ حُذف Assets.car" : "✓ أيقونات محدّثة");
  const payloadZip = path.join(work, "payload.zip");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(work, "Payload").replace(/'/g, "''")}' -DestinationPath '${payloadZip.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit", shell: true },
  );
  fs.copyFileSync(payloadZip, ipaOut);
  fs.mkdirSync(path.dirname(ipaDl), { recursive: true });
  fs.copyFileSync(ipaOut, ipaDl);
  fs.rmSync(work, { recursive: true, force: true });
  console.log(`✓ ${ipaOut}`);
  console.log(`✓ ${ipaDl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
