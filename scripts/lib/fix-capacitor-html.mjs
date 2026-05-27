import fs from "node:fs";

/** إصلاح مسارات index.html — Capacitor يحتاج ./assets وليس /app/assets */
export function fixCapacitorBundledHtml(indexPath) {
  if (!indexPath || !String(indexPath).endsWith("index.html")) return;
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, "utf8");
  html = html
    .replace(/\/app\/assets\//g, "./assets/")
    .replace(/href="\/app\/favicon/g, 'href="./favicon')
    .replace(/href="\/app\/icons\//g, 'href="./icons/')
    .replace(/href="\/app\/manifest/g, 'href="./manifest');
  fs.writeFileSync(indexPath, html, "utf8");
}
