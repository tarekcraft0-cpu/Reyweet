import { clearRetweetLocalSession } from "./uiErrorMessage";

/** يقرأ رمز الاستعادة من `?reset=` (رابط البريد) أو `#auth-reset?token=` */
export function parsePasswordResetTokenFromUrl(href?: string): string | null {
  if (typeof window === "undefined" && !href) return null;
  try {
    const url = new URL(href || window.location.href);
    const fromQuery = url.searchParams.get("reset")?.trim();
    if (fromQuery) return fromQuery;
    const hash = url.hash.replace(/^#/, "");
    if (!hash.startsWith("auth-reset")) return null;
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    return new URLSearchParams(q).get("token")?.trim() || null;
  } catch {
    return null;
  }
}

/** يمسح الجلسة المحلية عند فتح رابط الاستعادة حتى تظهر شاشة إعادة التعيين */
export function bootstrapPasswordResetFromUrl(): string | null {
  const token = parsePasswordResetTokenFromUrl();
  if (!token) return null;
  clearRetweetLocalSession();
  return token;
}

/** يزيل الرمز من العنوان بعد قراءته (لا يُستدعى قبل AuthScreen) */
export function cleanPasswordResetFromBrowserUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    if (url.hash.replace(/^#/, "").startsWith("auth-reset")) url.hash = "";
    const next = url.pathname + (url.search || "") + url.hash;
    window.history.replaceState(null, "", next || "/app/");
  } catch {
    /* ignore */
  }
}
