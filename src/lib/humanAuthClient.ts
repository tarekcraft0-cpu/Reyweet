import { apiFetch, ensureApiRuntimeConfig, getApiBaseUrl } from "./apiBackend";
import { isNativeCapacitorShell } from "./apiUrlPolicy";

let cachedChallengeId: string | null = null;
let cachedAt = 0;
const CHALLENGE_TTL_MS = 6 * 60 * 1000;
let authTurnstileToken: string | null = null;

export function setAuthTurnstileToken(token: string | null): void {
  authTurnstileToken = token?.trim() || null;
}

export function getAuthTurnstileToken(): string | null {
  return authTurnstileToken;
}

export type AuthHumanExtras = {
  humanChallengeId?: string;
  turnstileToken?: string;
  _hp?: string;
};

/** جلب تحدي بشري من الخادم — يُستهلك مرة واحدة لكل محاولة دخول/تسجيل */
export async function refreshHumanChallenge(): Promise<string | null> {
  await ensureApiRuntimeConfig();
  if (!getApiBaseUrl() && typeof window === "undefined") return null;
  try {
    const res = await apiFetch("/auth/human-challenge", { method: "GET", token: null });
    const data = (await res.json().catch(() => ({}))) as { challengeId?: string };
    if (!res.ok || !data.challengeId) return null;
    cachedChallengeId = data.challengeId;
    cachedAt = Date.now();
    return data.challengeId;
  } catch {
    return null;
  }
}

export async function getHumanChallengeId(): Promise<string | null> {
  if (cachedChallengeId && Date.now() - cachedAt < CHALLENGE_TTL_MS) return cachedChallengeId;
  return refreshHumanChallenge();
}

const MESSENGER_WEBVIEW_UA =
  /telegram(?:\/[\d.]+)?\s|telegrambot|whatsapp\/|fbav\/|fban\/|instagram\s|line\/|discord\/|snapchat/i;

export function isMessengerInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return MESSENGER_WEBVIEW_UA.test(navigator.userAgent || "");
}

export function isClientAutomationDetected(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isMessengerInAppBrowser()) return true;
  const nav = navigator as Navigator & { webdriver?: boolean };
  if (nav.webdriver === true) return true;
  const ua = navigator.userAgent || "";
  if (/HeadlessChrome|PhantomJS|selenium|webdriver|puppeteer|playwright/i.test(ua)) return true;
  return false;
}

export async function buildAuthHumanBody(
  base: Record<string, unknown>,
  turnstileToken?: string | null,
): Promise<Record<string, unknown>> {
  if (isClientAutomationDetected()) {
    throw new Error(
      "الدخول من تيليجرام أو بوتات خارجية ممنوع — حمّل تطبيق Retweet الرسمي أو افتح الموقع من Safari/Chrome",
    );
  }
  const humanChallengeId = await getHumanChallengeId();
  const ts = turnstileToken?.trim() || authTurnstileToken || undefined;
  return {
    ...base,
    humanChallengeId: humanChallengeId || undefined,
    turnstileToken: ts,
    _hp: "",
  };
}

export function nativeClientHeader(): Record<string, string> {
  if (isNativeCapacitorShell()) return { "X-Retweet-Client": "native" };
  return {};
}
