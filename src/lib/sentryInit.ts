/** تهيئة Sentry اختيارية عند تعيين VITE_SENTRY_DSN */
export async function initSentryIfConfigured(): Promise<void> {
  const dsn = (import.meta as { env?: { VITE_SENTRY_DSN?: string } }).env?.VITE_SENTRY_DSN?.trim();
  if (!dsn || typeof window === "undefined") return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.05,
      environment: (import.meta as { env?: { MODE?: string } }).env?.MODE || "production",
    });
  } catch {
    /* @sentry/react غير مثبت — يُستخدم telemetry المحلي */
  }
}
