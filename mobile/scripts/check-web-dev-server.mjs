/**
 * قبل `expo start`: يتأكد أن خادم Vite (WebView) يستجيب على العنوان في `.env`.
 * تجاوز الفحص: set SKIP_WEB_CHECK=1
 */
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.SKIP_WEB_CHECK === "1") {
  process.exit(0);
}

function readWebAppUrlFromEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return "";
  const text = readFileSync(envPath, "utf8");
  const line = text.split(/\r?\n/).find(l => /^\s*EXPO_PUBLIC_WEB_APP_URL\s*=/.test(l));
  if (!line) return "";
  const raw = line.replace(/^\s*EXPO_PUBLIC_WEB_APP_URL\s*=\s*/, "").trim();
  return raw.replace(/^["']|["']$/g, "").trim();
}

const webUrl = readWebAppUrlFromEnvFile();
if (!webUrl) {
  console.warn(
    "[retweet-mobile] تحذير: EXPO_PUBLIC_WEB_APP_URL غير مضبوط في ‎.env‎ — Expo سيعمل لكن WebView لن يحمّل الويب حتى تضبط العنوان.",
  );
  process.exit(0);
}

let u;
try {
  u = new URL(webUrl);
} catch {
  console.error("[retweet-mobile] EXPO_PUBLIC_WEB_APP_URL في ‎.env‎ ليس رابطاً صالحاً:", webUrl);
  process.exit(1);
}

const opts = {
  hostname: u.hostname,
  port: u.port || (u.protocol === "https:" ? 443 : 80),
  path: u.pathname || "/",
  method: "HEAD",
  timeout: 3500,
};

const req = http.request(opts, res => {
  res.resume();
  process.exit(0);
});

req.on("timeout", () => {
  req.destroy();
  printFail();
  process.exit(1);
});

req.on("error", () => {
  printFail();
  process.exit(1);
});

function printFail() {
  console.error(`
[retweet-mobile] لا يوجد استجابة من خادم الويب: ${webUrl}

  الحل:
  1) من جذر مشروع Retweet (حيث يوجد تطبيق الويب + ‎npm run dev:lan‎) شغّل:
       npm run dev:lan
     حتى يستمع Vite على المنفذ ‎3077‎ وعلى واجهة الشبكة (LAN).

  2) إذا غيّر الراوتر عنوان جهازك، حدّث ‎EXPO_PUBLIC_WEB_APP_URL‎ في ‎mobile/.env‎
     (نفس عنوان «Network» الذي يطبعه Vite).

  3) جدار حماية ويندوز (كمسؤول): من مجلد ‎mobile‎ شغّل ‎npm run open:dev-firewall‎
     أو اسمح لـ Node.js بالشبكة الخاصة.

  لتجاوز هذا الفحص مؤقتاً: set SKIP_WEB_CHECK=1
`);
}

req.end();
