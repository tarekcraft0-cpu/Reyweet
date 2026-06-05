import type { Request } from "express";

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
  /\bbot\b/i,
  /crawler/i,
  /spider/i,
];

/** متصفح تيليجرام الداخلي للبشر — لا نحظره */
const HUMAN_TELEGRAM_WEBVIEW = /telegram(?:\/[\d.]+)?\s/i;

export function isNativeClientRequest(req: Request): boolean {
  const origin = String(req.headers.origin || "").toLowerCase();
  if (origin.startsWith("capacitor://") || origin.startsWith("ionic://")) return true;
  const client = String(req.headers["x-retweet-client"] || "").toLowerCase();
  return client === "native" || client === "capacitor" || client === "ios" || client === "android";
}

export function detectBlockedBotUserAgent(req: Request): string | null {
  const ua = String(req.headers["user-agent"] || "").trim();
  if (!ua) return "missing_user_agent";
  if (HUMAN_TELEGRAM_WEBVIEW.test(ua)) return null;
  for (const re of BLOCKED_UA_PATTERNS) {
    if (re.test(ua)) return `blocked_ua:${re.source.slice(0, 40)}`;
  }
  return null;
}

/** متصفح ويب حقيقي يرسل عادة Accept-Language و Sec-Fetch */
export function lacksBrowserSignals(req: Request): boolean {
  if (isNativeClientRequest(req)) return false;
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
