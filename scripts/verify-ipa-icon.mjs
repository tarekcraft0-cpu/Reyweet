#!/usr/bin/env node
/**
 * يتحقق أن IPA لا يحتوي Assets.car وأن أيقونات AppIcon من شعار Retweet.
 *   node scripts/verify-ipa-icon.mjs [path/to.ipa]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { springboardIconBuffers } from "./lib/ios-icon-buffers.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ipa =
  process.argv[2]?.trim() ||
  path.join(root, "ios", "build", "Reyweet-ready.ipa");

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function main() {
  if (!fs.existsSync(ipa)) {
    console.error("verify-ipa-icon: missing", ipa);
    process.exit(1);
  }
  const work = path.join(root, ".ipa-verify-tmp");
  if (fs.existsSync(work)) fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const zip = path.join(work, "pkg.zip");
  fs.copyFileSync(ipa, zip);
  const { execSync } = await import("node:child_process");
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${work.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit", shell: true },
  );

  const payload = path.join(work, "Payload");
  const appDir = fs.readdirSync(payload).find((d) => d.endsWith(".app"));
  if (!appDir) {
    console.error("no .app in IPA");
    process.exit(1);
  }
  const appPath = path.join(payload, appDir);
  const car = path.join(appPath, "Assets.car");
  let ok = true;

  if (fs.existsSync(car)) {
    console.error("✗ Assets.car موجود — قد يظهر شعار قديم. أعد: npm run ios:package");
    ok = false;
  } else {
    console.log("✓ لا يوجد Assets.car");
  }

  const expected = await springboardIconBuffers(root);
  for (const [name, buf] of Object.entries(expected.files)) {
    const p = path.join(appPath, name);
    if (!fs.existsSync(p)) {
      console.error(`✗ مفقود: ${name}`);
      ok = false;
      continue;
    }
    const got = fs.readFileSync(p);
    if (sha(got) !== sha(buf)) {
      console.error(`✗ ${name} لا يطابق شعار Retweet`);
      ok = false;
    }
  }
  if (ok) console.log("✓ كل أيقونات AppIcon تطابق src/assets/logo.png");
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
