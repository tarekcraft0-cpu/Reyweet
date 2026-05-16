/**
 * Copies `landing/` into `_vercel_site/` for Vercel static hosting,
 * excluding `node_modules`. Run after `npm run build --prefix landing`.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const apiUrl =
  (process.env.VITE_API_URL || process.env.RETWEET_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
const supabaseUrl = (process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
const supabaseAnonKey = (
  process.env.VITE_SUPABASE_JWT_ANON ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  ""
).trim();

const configPath = path.join(outDir, "public/app-config.json");
let baseConfig = { apiUrl: "", appPath: "/app/", supabaseUrl: "", supabaseAnonKey: "" };
if (existsSync(configPath)) {
  try {
    baseConfig = { ...baseConfig, ...JSON.parse(readFileSync(configPath, "utf8")) };
  } catch {
    /* ignore */
  }
}
writeFileSync(
  configPath,
  JSON.stringify(
    {
      ...baseConfig,
      apiUrl: apiUrl || baseConfig.apiUrl || "",
      supabaseUrl: supabaseUrl || baseConfig.supabaseUrl || "",
      supabaseAnonKey: supabaseAnonKey || baseConfig.supabaseAnonKey || "",
      appPath: "/app/",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

const appCandidates = ["spa-dist", "dist/client", "dist", ".output/public"];
for (const rel of appCandidates) {
  const src = path.join(root, rel);
  if (!existsSync(path.join(src, "index.html"))) continue;
  const dest = path.join(outDir, "app");
  cpSync(src, dest, { recursive: true });
  console.log(`prepare-vercel-static: copied web app from ${rel} → app/`);
  const favSrc = path.join(root, "public/favicon.png");
  const favDest = path.join(dest, "favicon.png");
  if (existsSync(favSrc)) cpSync(favSrc, favDest);
  break;
}
