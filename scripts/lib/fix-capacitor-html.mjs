import fs from "node:fs";

const NATIVE_VIEWPORT_CRITICAL_STYLE = `<style id="retweet-native-viewport-critical">
html,body,#root{width:100%!important;max-width:100%!important;margin:0!important;padding-left:0!important;padding-right:0!important;left:0!important;right:0!important;overflow-x:hidden!important;box-sizing:border-box!important;transform:none!important;}
html[data-native-app="1"] [data-tab-panel],html.retweet-native-shell [data-tab-panel]{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;transform:translate3d(0,0,0)!important;left:0!important;right:0!important;}
html[data-native-app="1"] .retweet-no-select-pane,html[data-native-app="1"] #root > *{width:100%!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;}
</style>`;

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
  fs.writeFileSync(indexPath, html, "utf8");
}
