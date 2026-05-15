/**
 * Copies `landing/` into `_vercel_site/` for Vercel static hosting,
 * excluding `node_modules`. Run after `npm run build --prefix landing`.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const landingDir = path.join(root, "landing");
const outDir = path.join(root, "_vercel_site");

if (!existsSync(landingDir)) {
  console.error("prepare-vercel-static: missing directory landing/");
  process.exit(1);
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

cpSync(landingDir, outDir, {
  recursive: true,
  filter: (src) => {
    const n = src.split(path.sep).join("/");
    return !n.includes("/node_modules/") && !n.endsWith("/node_modules");
  },
});

const manifestScript = path.join(landingDir, "scripts", "write-manifest.mjs");
const manifestRun = spawnSync(process.execPath, [manifestScript, outDir], {
  stdio: "inherit",
  env: process.env,
});
if (manifestRun.status !== 0) {
  process.exit(manifestRun.status ?? 1);
}
