import fs from "node:fs";
import path from "node:path";
import { fixCapacitorBundledHtml } from "./fix-capacitor-html.mjs";
import { nativeBuildScriptTags, resolveNativeBuildId } from "./native-build-id.mjs";

const NATIVE_VIEWPORT_CRITICAL_STYLE = `<style id="retweet-native-viewport-critical">
html,body,#root{width:100%!important;max-width:100%!important;margin:0!important;padding-left:0!important;padding-right:0!important;left:0!important;right:0!important;overflow-x:hidden!important;box-sizing:border-box!important;transform:none!important;}
html[data-native-app="1"] [data-tab-panel],html.retweet-native-shell [data-tab-panel]{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:translate3d(0,0,0)!important;left:0!important;right:0!important;}
</style>`;

/** حقن API + build id + bootstrap في index.html داخل حزمة Capacitor */
export function injectNativeShellIndex(indexPath, apiUrl, rootDir = path.dirname(indexPath)) {
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
  const buildId = resolveNativeBuildId();
  const { buildTag, cacheBustTag } = nativeBuildScriptTags(buildId);
  const tag = `<script>window.__RETWEET_NATIVE_SHELL__=true;window.__RETWEET_NO_SELECT_BOOT__=true;${debugPart}window.__RETWEET_API_URL__=${JSON.stringify(apiUrl)};document.documentElement.classList.add("retweet-native-shell");document.documentElement.setAttribute("data-native-app","1");if(document.body)document.body.setAttribute("data-native-app","1");window.dispatchEvent(new Event("retweet-api-config-ready"));</script>`;
  html = html.replace(/<script>window\.__RETWEET[^<]*<\/script>\s*/gi, "");
  html = html.replace(/<html([^>]*)>/i, (m, attrs) => {
    if (/retweet-native-shell/i.test(attrs)) return m;
    const cls = /class="([^"]*)"/i.exec(attrs);
    if (cls) return `<html${attrs.replace(cls[0], `class="${cls[1]} retweet-native-shell"`)}>`;
    return `<html${attrs} class="retweet-native-shell">`;
  });
  html = html.replace(/<script>window\.__RETWEET_APP_BUILD__=[^<]*<\/script>\s*/gi, "");
  html = html.replace(
    /<script>\s*\(function\(\)\{[\s\S]*?retweet_app_build[\s\S]*?\}\)\(\);\s*<\/script>\s*/gi,
    "",
  );
  if (!html.includes("__RETWEET_NATIVE_SHELL__")) {
    html = html.replace("</head>", `${tag}\n${buildTag}\n${cacheBustTag}\n</head>`);
  } else {
    html = html.replace(/<script>window\.__RETWEET_NATIVE_SHELL__[^<]*<\/script>/i, tag);
    if (!html.includes("__RETWEET_APP_BUILD__")) {
      html = html.replace("</head>", `${buildTag}\n${cacheBustTag}\n</head>`);
    } else {
      html = html.replace(/<script>window\.__RETWEET_APP_BUILD__=[^<]*<\/script>/i, buildTag);
      if (!html.includes("retweet_app_build")) {
        html = html.replace("</head>", `${cacheBustTag}\n</head>`);
      }
    }
  }
  fs.writeFileSync(indexPath, html, "utf8");
  fixCapacitorBundledHtml(indexPath);
  const rel = rootDir ? path.relative(rootDir, indexPath) : indexPath;
  console.log(`  ✓ ${rel} (native → ${apiUrl}, build ${buildId.slice(0, 12)})`);
}
