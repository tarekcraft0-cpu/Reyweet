import fs from "node:fs";

const NATIVE_VIEWPORT_CRITICAL_STYLE = `<style id="retweet-native-viewport-critical">
html,body,#root{width:100%!important;max-width:100%!important;margin:0!important;padding-left:0!important;padding-right:0!important;left:0!important;right:0!important;overflow-x:hidden!important;box-sizing:border-box!important;transform:none!important;}
html[data-native-app="1"] [data-tab-panel],html.retweet-native-shell [data-tab-panel]{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:translate3d(0,0,0)!important;left:0!important;right:0!important;}
html[data-native-app="1"] .retweet-no-select-pane,html[data-native-app="1"] #root > *{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;}
</style>`;

const REMOTE_APP_URL = "https://reyweet.vercel.app/app/";

/** يعيد توجيه التطبيق الأصلي إلى الويب عند خطأ showOnboarding في IPA قديم */
export function injectNativeCrashFallback(html) {
  const fallbackId = "retweet-native-crash-fallback";
  if (html.includes(fallbackId)) return html;
  const tag = `<script id="${fallbackId}">(function(){var U=${JSON.stringify(REMOTE_APP_URL)};function go(){if(window.__RETWEET_REMOTE_FALLBACK__)return;window.__RETWEET_REMOTE_FALLBACK__=1;try{location.replace(U+"?native=1&force="+Date.now());}catch(e){location.href=U;}}function bad(m){m=String(m||"");return/showOnboarding|Can't find variable/i.test(m);}window.addEventListener("error",function(e){if(bad(e&&e.message))go();},true);window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;if(bad(r&&r.message||r))go();},true);})();</script>`;
  return html.replace("<head>", `<head>\n${tag}`);
}

/** إصلاح مسارات index.html — Capacitor يحتاج ./assets وليس /app/assets */
export function fixCapacitorBundledHtml(indexPath) {
  if (!indexPath || !String(indexPath).endsWith("index.html")) return;
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, "utf8");
  html = html
    .replace(/\/app\/assets\//g, "./assets/")
    .replace(/src="\/app\/assets\//g, 'src="./assets/')
    .replace(/href="\/app\/assets\//g, 'href="./assets/')
    .replace(/href="\/app\/favicon/g, 'href="./favicon')
    .replace(/href="\/app\/icons\//g, 'href="./icons/')
    .replace(/href="\/app\/manifest/g, 'href="./manifest')
    .replace(/src="\/app\/native-no-select-bootstrap\.js"/g, 'src="./native-no-select-bootstrap.js"');
  if (!html.includes("native-no-select-bootstrap.js")) {
    html = html.replace("</head>", '<script src="./native-no-select-bootstrap.js"></script>\n</head>');
  }
  if (!html.includes("retweet-native-viewport-critical")) {
    html = html.replace("<head>", `<head>\n${NATIVE_VIEWPORT_CRITICAL_STYLE}`);
  }
  html = injectNativeCrashFallback(html);
  fs.writeFileSync(indexPath, html, "utf8");
}
