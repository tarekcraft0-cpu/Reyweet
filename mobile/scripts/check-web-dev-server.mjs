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

function probe(hostname, port, path, onOk, onFail) {
  const req = http.request(
    { hostname, port, path, method: "HEAD", timeout: 3500 },
    res => {
      res.resume();
      onOk();
    },
  );
  req.on("timeout", () => {
    req.destroy();
    onFail();
  });
  req.on("error", onFail);
  req.end();
}

function printFail(webUrl) {
  console.error(`
[retweet-mobile] لا يوجد استجابة من خادم الويب: ${webUrl}

  الحل:
  1) من جذر مشروع Retweet (حيث يوجد تطبيق الويب + ‎npm run dev:lan‎) شغّل:
       npm run dev:lan
     حتى يستمع Vite على المنفذ ‎3077‎ وعلى واجهة الشبكة (LAN).

  2) إذا غيّر الراوتر عنوان جهازك، احذف قيمة ‎EXPO_PUBLIC_WEB_APP_URL‎ من ‎mobile/.env‎
     ليستخدم التطبيق الاكتشاف التلقائي، أو حدّثها لتطابق عنوان «Network» من Vite.

  3) جدار حماية ويندوز (كمسؤول): من مجلد ‎mobile‎ شغّل ‎npm run open:dev-firewall‎
     أو اسمح لـ Node.js بالشبكة الخاصة.

  لتجاوز هذا الفحص مؤقتاً: set SKIP_WEB_CHECK=1
`);
}

const webUrl = readWebAppUrlFromEnvFile();
if (!webUrl) {
  console.warn(
    "[retweet-mobile] EXPO_PUBLIC_WEB_APP_URL غير مضبوط — سيستنتج التطبيق عنوان Vite من عنوان Expo (Metro) على الهاتف. تأكد أن ‎npm run dev:lan‎ يعمل على المنفذ ‎3077‎.",
  );
  probe(
    "127.0.0.1",
    3077,
    "/",
    () => process.exit(0),
    () => {
      console.warn(
        "[retweet-mobile] لا يوجد استجابة من ‎127.0.0.1:3077‎ — شغّل من جذر المشروع: npm run dev:lan",
      );
      process.exit(0);
    },
  );
} else {
  let u;
  try {
    u = new URL(webUrl);
  } catch {
    console.error("[retweet-mobile] EXPO_PUBLIC_WEB_APP_URL في ‎.env‎ ليس رابطاً صالحاً:", webUrl);
    process.exit(1);
  }

  const port = u.port || (u.protocol === "https:" ? 443 : 80);
  const path = u.pathname || "/";

  probe(u.hostname, port, path, () => process.exit(0), () => {
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      printFail(webUrl);
      process.exit(1);
    }
    probe("127.0.0.1", port, path, () => process.exit(0), () => {
      printFail(webUrl);
      process.exit(1);
    });
  });
}
