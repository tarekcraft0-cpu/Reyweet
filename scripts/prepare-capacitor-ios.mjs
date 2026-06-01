/**
 * تطبيق iOS (Capacitor) — نفس واجهة https://reyweet.vercel.app/app/
 * بدون Expo. يُشغَّل محلياً أو على Codemagic قبل xcodebuild.
 *
 * المتغيرات (اختياري في Codemagic):
 *   CAPACITOR_API_URL / RETWEET_PUBLIC_API_URL — افتراضي https://reyweet.vercel.app
 *   CAPACITOR_WEB_APP_URL   — افتراضي https://reyweet.vercel.app/app/
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveMobileApiUrl,
  VERCEL_SITE_URL,
} from "./lib/read-public-api-url.mjs";
import { fixCapacitorBundledHtml } from "./lib/fix-capacitor-html.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webAppUrl = (
  process.env.CAPACITOR_WEB_APP_URL ||
  `${VERCEL_SITE_URL}/app`
).replace(/\/$/, "");
/** iOS — HTTPS Vercel (بروكسي → VPS). لا نفق trycloudflare ولا IP HTTP */
const apiUrl = resolveMobileApiUrl();
const appId = process.env.CAPACITOR_APP_ID || "com.reyweet.app";
const cleartext = false;

function run(cmd, opts = {}) {
  execSync(cmd, {
    cwd: opts.cwd || root,
    stdio: "inherit",
    env: { ...process.env, ...opts.env },
    shell: process.platform === "win32",
  });
}

/** Capacitor 7 لا يوفّر `cap rm` — حذف يدوي لمجلد ios */
function removeIosPlatform() {
  const iosDir = path.join(root, "ios");
  if (fs.existsSync(iosDir)) {
    fs.rmSync(iosDir, { recursive: true, force: true });
    console.log("  ✓ حذف ios/ (إعادة إنشاء منصة iOS)");
  }
}

const NATIVE_VIEWPORT_CRITICAL_STYLE = `<style id="retweet-native-viewport-critical">
html,body,#root{width:100%!important;max-width:100%!important;margin:0!important;padding-left:0!important;padding-right:0!important;left:0!important;right:0!important;overflow-x:hidden!important;box-sizing:border-box!important;transform:none!important;}
html[data-native-app="1"] [data-tab-panel],html.retweet-native-shell [data-tab-panel]{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:translate3d(0,0,0)!important;left:0!important;right:0!important;}
</style>`;

function injectNativeShellIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, "utf8");
  if (!html.includes("retweet-native-viewport-critical")) {
    html = html.replace("<head>", `<head>\n${NATIVE_VIEWPORT_CRITICAL_STYLE}`);
  }
  html = html.replace(/src="\/app\/native-no-select-bootstrap\.js"/g, 'src="./native-no-select-bootstrap.js"');
  const bootstrap = `<script src="./native-no-select-bootstrap.js"></script>`;
  if (!html.includes("native-no-select-bootstrap.js")) {
    html = html.replace("</head>", `${bootstrap}\n</head>`);
  }
  const apiDebug =
    process.env.CAPACITOR_API_DEBUG === "1" || process.env.NODE_ENV === "development";
  const debugPart = apiDebug ? "window.__RETWEET_API_DEBUG__=true;" : "";
  const tag = `<script>window.__RETWEET_NATIVE_SHELL__=true;window.__RETWEET_NO_SELECT_BOOT__=true;${debugPart}window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};document.documentElement.classList.add("retweet-native-shell");document.documentElement.setAttribute("data-native-app","1");if(document.body)document.body.setAttribute("data-native-app","1");window.dispatchEvent(new Event("retweet-api-config-ready"));</script>`;
  html = html.replace(/<script>window\.__RETWEET[^<]*<\/script>\s*/gi, "");
  html = html.replace(/<html([^>]*)>/i, (m, attrs) => {
    if (/retweet-native-shell/i.test(attrs)) return m;
    const cls = /class="([^"]*)"/i.exec(attrs);
    if (cls) return `<html${attrs.replace(cls[0], `class="${cls[1]} retweet-native-shell"`)}>`;
    return `<html${attrs} class="retweet-native-shell">`;
  });
  if (!html.includes("__RETWEET_NATIVE_SHELL__")) {
    html = html.replace("</head>", `${tag}\n</head>`);
  } else {
    html = html.replace(
      /<script>window\.__RETWEET_NATIVE_SHELL__[^<]*<\/script>/i,
      tag,
    );
  }
  fs.writeFileSync(indexPath, html, "utf8");
  fixCapacitorBundledHtml(indexPath);
  console.log(`  ✓ ${path.relative(root, indexPath)} (native → ${apiUrl})`);
}

console.log("\n══ Retweet iOS — Capacitor (نسخة الموقع) ══\n");
console.log(`  وضع:     bundled (محلي داخل IPA)`);
console.log(`  API:      ${apiUrl}\n`);

process.env.RETWEET_PUBLIC_API_URL = apiUrl;
run("node scripts/write-public-web-config.mjs", { env: process.env });

console.log("→ بناء SPA (نفس بناء الموقع)…");
run(
  "node scripts/generate-pwa-icons.mjs && node scripts/generate-custom-sticker-manifest.mjs && npx vite build --config vite.spa.config.ts",
  {
    env: {
      ...process.env,
      CAPACITOR_NATIVE: "1",
      RETWEET_PUBLIC_API_URL: apiUrl,
      VITE_API_URL: apiUrl,
      VITE_API_URL_MOBILE: apiUrl,
    },
  },
);

const spaDist = path.join(root, "spa-dist");
injectNativeShellIndex(path.join(spaDist, "index.html"));

const webAuth = {
  apiUrl,
  supabaseUrl: "",
  supabaseAnonKey: "",
};
fs.writeFileSync(
  path.join(spaDist, "web-auth-config.json"),
  JSON.stringify(webAuth, null, 2) + "\n",
  "utf8",
);

/** Keep repo capacitor.config.ts (plugins, ios scroll/keyboard). Only patch appId if overridden. */
const capConfigPath = path.join(root, "capacitor.config.ts");
if (!fs.existsSync(capConfigPath)) {
  console.warn("  ⚠ capacitor.config.ts missing — run from repo root");
} else if (appId !== "com.reyweet.app") {
  let ts = fs.readFileSync(capConfigPath, "utf8");
  ts = ts.replace(/appId:\s*["'][^"']+["']/, `appId: ${JSON.stringify(appId)}`);
  fs.writeFileSync(capConfigPath, ts, "utf8");
  console.log(`  ✓ capacitor.config.ts (appId → ${appId})`);
} else {
  console.log("  ✓ capacitor.config.ts (bundled mobile — unchanged)");
}

const distDir = path.join(root, "dist");
if (fs.existsSync(spaDist)) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.cpSync(spaDist, distDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, "web-auth-config.json"),
    JSON.stringify(webAuth, null, 2) + "\n",
    "utf8",
  );
  injectNativeShellIndex(path.join(distDir, "index.html"));
  console.log("  ✓ dist/ (from spa-dist + web-auth-config)");
}

const iosDir = path.join(root, "ios");
const forceRegen = process.env.CAPACITOR_FORCE_IOS_REGEN === "1";
if (forceRegen) {
  console.log("\n→ Regenerate ios (CAPACITOR_FORCE_IOS_REGEN=1)…");
  removeIosPlatform();
  run("npx cap add ios");
} else if (fs.existsSync(iosDir)) {
  console.log("\n→ Capacitor sync (ios/ present in repo)…");
  run("npx cap sync ios");
} else {
  console.log("\n→ Create Xcode project (npx cap add ios)…");
  run("npx cap add ios");
}

const iosPublic = path.join(root, "ios", "App", "App", "public");
injectNativeShellIndex(path.join(iosPublic, "index.html"));
fs.writeFileSync(
  path.join(iosPublic, "web-auth-config.json"),
  JSON.stringify(webAuth, null, 2) + "\n",
  "utf8",
);

/** Merge metadata only — never wipe packageClassList (Capacitor native plugins). */
function patchIosEmbeddedCapConfig() {
  const iosCapJson = path.join(root, "ios", "App", "App", "capacitor.config.json");
  if (!fs.existsSync(iosCapJson)) return;
  let capJson = {};
  try {
    capJson = JSON.parse(fs.readFileSync(iosCapJson, "utf8"));
  } catch {
    capJson = {};
  }
  capJson.appId = appId;
  capJson.appName = "Reyweet";
  capJson.webDir = "public";
  let rootCap = {};
  try {
    rootCap = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
  } catch {
    try {
      const ts = fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
      const resize = ts.match(/resize:\s*["'](\w+)["']/)?.[1];
      if (resize) rootCap = { plugins: { Keyboard: { resize } } };
    } catch {
      /* ignore */
    }
  }
  if (rootCap.plugins) {
    capJson.plugins = { ...(capJson.plugins || {}), ...rootCap.plugins };
  }
  if (!Array.isArray(capJson.packageClassList)) {
    capJson.packageClassList = [];
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps["@capacitor/keyboard"] && !capJson.packageClassList.includes("KeyboardPlugin")) {
    capJson.packageClassList.push("KeyboardPlugin");
  }
  if (
    deps["@capacitor/push-notifications"] &&
    !capJson.packageClassList.includes("PushNotificationsPlugin")
  ) {
    capJson.packageClassList.push("PushNotificationsPlugin");
  }
  fs.writeFileSync(iosCapJson, JSON.stringify(capJson, null, 2) + "\n", "utf8");
  console.log(
    `  ✓ ios/App/App/capacitor.config.json (plugins: ${capJson.packageClassList.length})`,
  );
}

function ensureCapacitorIosPods() {
  const podfile = path.join(root, "ios", "App", "Podfile");
  if (!fs.existsSync(podfile)) return;
  let pod = fs.readFileSync(podfile, "utf8");
  let changed = false;
  const inserts = [
    {
      name: "CapacitorKeyboard",
      line: "  pod 'CapacitorKeyboard', :path => '../../node_modules/@capacitor/keyboard'",
    },
    {
      name: "CapacitorPushNotifications",
      line:
        "  pod 'CapacitorPushNotifications', :path => '../../node_modules/@capacitor/push-notifications'",
    },
  ];
  for (const { name, line } of inserts) {
    if (!pod.includes(name)) {
      pod = pod.replace(/pod 'CapacitorCordova'[^\n]+\n/, m => `${m}${line}\n`);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(podfile, pod, "utf8");
    console.log("  ✓ Podfile (+ CapacitorKeyboard / PushNotifications)");
  }
}

patchIosEmbeddedCapConfig();
ensureCapacitorIosPods();

const configJson = {
  webAppUrl: `${webAppUrl}/`,
  apiUrl,
  siteUrl: VERCEL_SITE_URL,
  bundleId: appId,
  bundled: true,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(
  path.join(root, "ios-app.config.json"),
  JSON.stringify(configJson, null, 2) + "\n",
  "utf8",
);
console.log("  ✓ ios-app.config.json");

console.log("\n→ التحقق من حزمة iOS…");
run("node scripts/verify-ios-api-bundle.mjs");

console.log("\n✓ جاهز لـ Codemagic / Xcode — مجلد ios/\n");
