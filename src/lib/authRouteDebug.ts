/** تتبع مسار الواجهة بعد تسجيل الدخول — يظهر في Console */
export function logAuthRoute(
  phase: string,
  detail?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const payload = {
    phase,
    path: window.location.pathname,
    hash: window.location.hash || "",
    search: window.location.search || "",
    ...detail,
  };
  console.log("[Retweet auth/route]", JSON.stringify(payload));
}
