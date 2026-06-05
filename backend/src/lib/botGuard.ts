import type { Request } from "express";
import { verifyAppRequestSignature } from "./appRequestSign.js";

/** أنماط وكلاء معروفة للأتمتة والبوتات — ليست متصفحات بشرية */
const BLOCKED_UA_PATTERNS: RegExp[] = [
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /webdriver/i,
  /puppeteer/i,
  /playwright/i,
  /python-requests/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /go-http-client/i,
  /java\/[\d.]+.*http/i,
  /libwww-perl/i,
  /scrapy/i,
  /httpclient/i,
  /okhttp/i,
  /postmanruntime/i,
  /insomnia/i,
  /telegrambot/i,
  /node-fetch/i,
  /\baxios\b/i,
  /\bundici\b/i,
  /aiohttp/i,
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
  /automation/i,
  /electron.*headless/i,
  /slimerjs/i,
  /nightmare/i,
  /zombiejs/i,
  /splash/i,
  /httrack/i,
  /masscan/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
];

/** متصفحات داخل تطبيقات مراسلة — تُستغل غالباً لأتمتة دخول عبر بوتات */
const IN_APP_MESSENGER_UA =
  /telegram(?:\/[\d.]+)?\s|telegrambot|whatsapp\/|fbav\/|fban\/|instagram\s|line\/|discord\/|snapchat/i;

/** تطبيق أصلي موثّق — توقيع HMAC فقط (لا Origin ولا X-Retweet-Client وحدهما) */
export function isNativeClientRequest(req: Request): boolean {
  return verifyAppRequestSignature(req);
}

export function isTelegramOrMessengerWebView(req: Request): boolean {
  const ua = String(req.headers["user-agent"] || "").trim();
  if (!ua) return false;
  return IN_APP_MESSENGER_UA.test(ua);
}

export function detectBlockedBotUserAgent(req: Request): string | null {
  const ua = String(req.headers["user-agent"] || "").trim();
  if (!ua) return "missing_user_agent";
  if (isTelegramOrMessengerWebView(req)) return "blocked_messenger_webview";
  for (const re of BLOCKED_UA_PATTERNS) {
    if (re.test(ua)) return `blocked_ua:${re.source.slice(0, 40)}`;
  }
  return null;
}

/** متصفح ويب حقيقي يرسل عادة Accept-Language و Sec-Fetch */
export function lacksBrowserSignals(req: Request): boolean {
  if (verifyAppRequestSignature(req)) return false;
  const acceptLang = String(req.headers["accept-language"] || "").trim();
  if (!acceptLang || acceptLang.length < 2) return true;
  const secFetch = String(req.headers["sec-fetch-site"] || req.headers["sec-fetch-mode"] || "").trim();
  if (!secFetch && req.method === "POST") return true;
  return false;
}

export function isHoneypotTripped(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const hp = (body as Record<string, unknown>)._hp;
  if (hp == null || hp === "") return false;
  const s = String(hp).trim();
  return s.length > 0;
}

export function isAuthStrictMode(): boolean {
  const flag = process.env.AUTH_STRICT_MODE?.trim();
  if (flag === "0" || flag === "false") return false;
  return true;
}

export type BotGuardResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code: string };

export function assertHumanAuthClient(req: Request, body?: unknown): BotGuardResult {
  if (!isAuthStrictMode()) return { ok: true };

  const uaBlock = detectBlockedBotUserAgent(req);
  if (uaBlock) {
    return {
      ok: false,
      status: 403,
      error: "تم رفض الطلب — أتمتة أو بوت غير مسموح",
      code: uaBlock,
    };
  }

  if (isHoneypotTripped(body)) {
    return {
      ok: false,
      status: 403,
      error: "تم رفض الطلب",
      code: "honeypot",
    };
  }

  if (lacksBrowserSignals(req)) {
    return {
      ok: false,
      status: 403,
      error: "متصفح غير مدعوم — استخدم تطبيق Retweet الرسمي أو متصفحك على الهاتف",
      code: "browser_signals",
    };
  }

  return { ok: true };
}

/** جلسة API مصادق عليها — رفض بوتات/تيليجرام/أتمتة في الوضع الصارم */
export function assertStrictApiSession(req: Request): BotGuardResult {
  if (!isAuthStrictMode()) return { ok: true };
  if (verifyAppRequestSignature(req)) return { ok: true };

  if (isTelegramOrMessengerWebView(req)) {
    return {
      ok: false,
      status: 403,
      error: "الدخول عبر تيليجرام أو بوتات خارجية ممنوع — استخدم تطبيق Retweet الرسمي",
      code: "messenger_webview",
    };
  }

  const uaBlock = detectBlockedBotUserAgent(req);
  if (uaBlock) {
    return {
      ok: false,
      status: 403,
      error: "تم رفض الطلب — أتمتة أو بوت غير مسموح",
      code: uaBlock,
    };
  }

  if (lacksBrowserSignals(req)) {
    return {
      ok: false,
      status: 403,
      error: "متصفح غير مدعوم — استخدم تطبيق Retweet الرسمي",
      code: "browser_signals",
    };
  }

  return { ok: true };
}
