/**
 * Copies `landing/` into `_vercel_site/` for Vercel static hosting,
 * excluding `node_modules`. Run after `npm run build --prefix landing`.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  PRODUCTION_VPS_API,
  readPublicApiUrl,
  resolveVpsBackendUrl,
  resolveWebFrontendApiUrl,
  isTunnelApiUrl,
  shouldUseVercelApiProxy,
  VERCEL_SITE_URL,
} from "./lib/read-public-api-url.mjs";

const root = process.cwd();
const landingDir = path.join(root, "landing");
const outDir = path.join(root, "_vercel_site");

if (!existsSync(landingDir)) {
  console.error("prepare-vercel-static: missing directory landing/");
  process.exit(1);
}

function resolveSiteOutDir(dir) {
  if (!existsSync(dir)) return dir;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    return dir;
  } catch (e) {
    if (e?.code !== "EBUSY" && e?.code !== "EPERM") throw e;
    const alt = `${dir}-${Date.now()}`;
    console.warn(`prepare-vercel-static: ${path.basename(dir)} مقفول — استخدام ${path.basename(alt)}`);
    return alt;
  }
}

const siteOutDir = resolveSiteOutDir(outDir);

cpSync(landingDir, siteOutDir, {
  recursive: true,
  filter: (src) => {
    const n = src.split(path.sep).join("/");
    return !n.includes("/node_modules/") && !n.endsWith("/node_modules");
  },
});

const manifestScript = path.join(landingDir, "scripts", "write-manifest.mjs");
const manifestRun = spawnSync(process.execPath, [manifestScript, siteOutDir], {
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

const sameOrigin = process.env.RETWEET_SAME_ORIGIN === "1";
const envApi = sameOrigin
  ? ""
  : (process.env.RETWEET_PUBLIC_API_URL || process.env.VITE_API_URL || "")
      .trim()
      .replace(/\/$/, "");
const repoApi = readRepoApiUrl();
const backendFromEnv = (process.env.RETWEET_BACKEND_URL || "").trim().replace(/\/$/, "");
const backendRaw = (
  backendFromEnv ||
  readPublicApiUrl() ||
  PRODUCTION_VPS_API ||
  envApi ||
  repoApi
).replace(/\/$/, "");
const backendApiUrl = resolveVpsBackendUrl(backendRaw);
const vercelSite = (process.env.RETWEET_VERCEL_SITE_URL || VERCEL_SITE_URL).replace(/\/$/, "");
/** HTTPS على Vercel — بروكسي API/WebSocket إلى VPS (لا نفق trycloudflare في bundle) */
const useApiProxy =
  shouldUseVercelApiProxy(backendApiUrl) || isTunnelApiUrl(backendRaw) || process.env.VERCEL === "1";
const apiUrl = resolveWebFrontendApiUrl(backendRaw);
const siteUrl = vercelSite;
const webAppUrl = `${vercelSite}/app/`;

if (isTunnelApiUrl(envApi) || isTunnelApiUrl(backendFromEnv)) {
  console.warn(
    "prepare-vercel-static: تجاهل نفق trycloudflare من env — الواجهة تستخدم reyweet.vercel.app",
  );
}
if (useApiProxy) {
  console.log(
    `prepare-vercel-static: بروكسي API ${backendApiUrl} ← ${vercelSite} (بدون تحويل إلى IP)`,
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

const configPath = path.join(siteOutDir, "public/app-config.json");
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
      siteUrl,
      webAppUrl,
      supabaseUrl: supabaseUrl || baseConfig.supabaseUrl || "",
      supabaseAnonKey: supabaseAnonKey || baseConfig.supabaseAnonKey || "",
      appPath: "/app/",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

const appDest = path.join(siteOutDir, "app");
const appCandidates = ["spa-dist", "dist/client", "dist", ".output/public"];
for (const rel of appCandidates) {
  const src = path.join(root, rel);
  if (!existsSync(path.join(src, "index.html"))) continue;
  if (existsSync(appDest)) rmSync(appDest, { recursive: true, force: true });
  cpSync(src, appDest, { recursive: true });
  console.log(`prepare-vercel-static: copied web app from ${rel} → app/`);
  const favSrc = path.join(root, "public/favicon.png");
  const favDest = path.join(appDest, "favicon.png");
  if (existsSync(favSrc)) cpSync(favSrc, favDest);
  const webAuth = {
    apiUrl: apiUrl || baseConfig.apiUrl || "",
    supabaseUrl: supabaseUrl || baseConfig.supabaseUrl || "",
    supabaseAnonKey: supabaseAnonKey || baseConfig.supabaseAnonKey || "",
  };
  writeFileSync(
    path.join(appDest, "web-auth-config.json"),
    JSON.stringify(webAuth, null, 2) + "\n",
    "utf8",
  );
  const indexPath = path.join(appDest, "index.html");
  if (existsSync(indexPath)) {
    let html = readFileSync(indexPath, "utf8");
    html = html.replace(/<script>window\.__RETWEET_API_URL__=[^<]*<\/script>\s*/gi, "");
    html = html.replace(/<script>window\.__RETWEET_APP_BUILD__=[^<]*<\/script>\s*/gi, "");
    html = html.replace(
      /<script>\s*\(function\(\)\{[\s\S]*?retweet_app_build[\s\S]*?\}\)\(\);\s*<\/script>\s*/gi,
      "",
    );
    const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());
    const apiTag = `<script>window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};</script>`;
    const buildTag = `<script>window.__RETWEET_APP_BUILD__=${JSON.stringify(buildId)};</script>`;
    const cacheBustTag = `<script>(function(){try{var k="retweet_app_build",b=window.__RETWEET_APP_BUILD__||"";var s=localStorage.getItem(k);if(s&&b&&s!==b&&!/force=\\d+/.test(location.search)){localStorage.setItem(k,b);location.replace("/app/?force="+Date.now());return}if(b)localStorage.setItem(k,b)}catch(e){}})();</script>`;
    html = html.replace("</head>", `${apiTag}\n${buildTag}\n${cacheBustTag}\n</head>`);
    writeFileSync(indexPath, html, "utf8");
  }
  break;
}

if (apiUrl) {
  console.log(`prepare-vercel-static: API العام للواجهة → ${apiUrl}`);
}

const apiProxyRewrites = useApiProxy
  ? [
      { source: "/health", destination: `${backendApiUrl}/health` },
      { source: "/auth/:path*", destination: `${backendApiUrl}/auth/:path*` },
      { source: "/v1/:path*", destination: `${backendApiUrl}/v1/:path*` },
      { source: "/media/:path*", destination: "/api/media-stream?path=:path*" },
      { source: "/socket.io", destination: `${backendApiUrl}/socket.io` },
      { source: "/socket.io/:path*", destination: `${backendApiUrl}/socket.io/:path*` },
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
      { source: "/app/:path((?!.*\\.).*)", destination: "/app/index.html" },
    ]
  : [
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
      { source: "/app/:path((?!.*\\.).*)", destination: "/app/index.html" },
    ];

const siteVercel = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null,
  rewrites: [
    ...apiProxyRewrites,
    { source: "/downloads/:path*", destination: "/public/downloads/:path*" },
  ],
  headers: [
    {
      source: "/downloads/(.*\\.plist)",
      headers: [{ key: "Content-Type", value: "application/xml; charset=utf-8" }],
    },
    {
      source: "/downloads/(.*\\.ipa)",
      headers: [
        { key: "Content-Type", value: "application/octet-stream" },
        { key: "Content-Disposition", value: 'attachment; filename="Retweet.ipa"' },
      ],
    },
    {
      source: "/downloads/(.*\\.apk)",
      headers: [
        { key: "Content-Type", value: "application/vnd.android.package-archive" },
        { key: "Content-Disposition", value: 'attachment; filename="Retweet.apk"' },
      ],
    },
    {
      source: "/downloads/android-version.json",
      headers: [
        { key: "Content-Type", value: "application/json; charset=utf-8" },
        { key: "Cache-Control", value: "no-store, max-age=0" },
      ],
    },
    {
      source: "/downloads/ios-version.json",
      headers: [
        { key: "Content-Type", value: "application/json; charset=utf-8" },
        { key: "Cache-Control", value: "no-store, max-age=0" },
      ],
    },
    {
      source: "/app/index.html",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
      ],
    },
    {
      source: "/app/",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
      ],
    },
  ],
};

if (useApiProxy) {
  siteVercel.functions = {
    "api/media-stream.js": { maxDuration: 60 },
  };
  const apiRoot = path.join(root, "api");
  const apiDestSite = path.join(siteOutDir, "api");
  if (existsSync(apiRoot)) {
    if (existsSync(apiDestSite)) rmSync(apiDestSite, { recursive: true, force: true });
    cpSync(apiRoot, apiDestSite, { recursive: true });
    console.log("prepare-vercel-static: نسخ api/ → _vercel_site/api (بروكسي الفيديو)");
  }
}

writeFileSync(path.join(siteOutDir, "vercel.json"), JSON.stringify(siteVercel, null, 2) + "\n", "utf8");
if (siteOutDir !== outDir) {
  writeFileSync(path.join(root, ".vercel-deploy-dir.txt"), siteOutDir + "\n", "utf8");
}
console.log(`prepare-vercel-static: ✓ ${path.basename(siteOutDir)}/vercel.json (SPA على Vercel + بروكسي API)`);
