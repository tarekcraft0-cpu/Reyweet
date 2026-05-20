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

function readRepoApiUrl() {
  for (const rel of ["spa/public/web-auth-config.json", "landing/public/app-config.json"]) {
    const p = path.join(root, rel);
    if (!existsSync(p)) continue;
    try {
      const u = String(JSON.parse(readFileSync(p, "utf8")).apiUrl || "")
        .trim()
        .replace(/\/$/, "");
      if (u) return u;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** عند ضبط RETWEET_PUBLIC_API_URL أو VITE_API_URL يُربط تسجيل الدخول بقاعدة البيانات المحلية */
const sameOrigin = process.env.RETWEET_SAME_ORIGIN === "1";
const envApi = sameOrigin
  ? ""
  : (process.env.RETWEET_PUBLIC_API_URL || process.env.VITE_API_URL || "")
      .trim()
      .replace(/\/$/, "");
const repoApi = readRepoApiUrl();
const apiUrl = repoApi || envApi;
if (repoApi && envApi && repoApi !== envApi) {
  console.warn(
    `prepare-vercel-static: repo API (${repoApi}) overrides stale Vercel env (${envApi})`,
  );
}
const supabaseUrl = apiUrl
  ? ""
  : (process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
const supabaseAnonKey = apiUrl
  ? ""
  : (
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
const vercelSite = (process.env.RETWEET_VERCEL_SITE_URL || "https://reyweet.vercel.app").replace(
  /\/$/,
  "",
);

writeFileSync(
  configPath,
  JSON.stringify(
    {
      ...baseConfig,
      apiUrl: apiUrl || baseConfig.apiUrl || "",
      siteUrl: vercelSite,
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
  const webAuth = {
    apiUrl: apiUrl || baseConfig.apiUrl || "",
    supabaseUrl: supabaseUrl || baseConfig.supabaseUrl || "",
    supabaseAnonKey: supabaseAnonKey || baseConfig.supabaseAnonKey || "",
  };
  const webAuthFull = {
    apiUrl: apiUrl || webAuth.apiUrl || "",
    supabaseUrl: webAuth.supabaseUrl || "",
    supabaseAnonKey: webAuth.supabaseAnonKey || "",
  };
  writeFileSync(
    path.join(dest, "web-auth-config.json"),
    JSON.stringify(webAuthFull, null, 2) + "\n",
    "utf8",
  );
  const indexPath = path.join(dest, "index.html");
  if (apiUrl && existsSync(indexPath)) {
    let html = readFileSync(indexPath, "utf8");
    const tag = `<script>window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};</script>`;
    if (!html.includes("__RETWEET_API_URL__")) {
      html = html.replace("</head>", `${tag}\n</head>`);
      writeFileSync(indexPath, html, "utf8");
    }
  }
  break;
}

if (apiUrl) {
  console.log(`prepare-vercel-static: API العام للواجهة → ${apiUrl}`);
}
