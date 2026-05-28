/**
 * تسجيل طلبات API — مفيد على iOS (Safari Web Inspector → Console).
 */
const PREFIX = "[Retweet API]";

export function shouldLogApi(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & { __RETWEET_API_DEBUG__?: boolean };
  return w.__RETWEET_API_DEBUG__ === true;
}

export function logApi(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (!shouldLogApi()) return;
  console.log(PREFIX, phase, detail ?? "");
}

export function formatFetchError(e: unknown, url: string): string {
  if (e instanceof Error) {
    if (e.name === "AbortError") return `انتهت مهلة الاتصال (${url})`;
    const msg = e.message?.trim();
    if (msg) return `${msg} — ${url}`;
    return `تعذر الاتصال بالخادم — ${url}`;
  }
  return `تعذر الاتصال بالخادم — ${url}`;
}

export function redactBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    if ("password" in j) return { ...j, password: "***" };
    if ("code" in j && typeof j.code === "string" && j.code.length > 2) {
      return { ...j, code: "***" };
    }
    return j;
  } catch {
    return body.length > 200 ? `${body.slice(0, 200)}…` : body;
  }
}
