/** تهيئة Sentry اختيارية — يتطلب تثبيت @sentry/react و VITE_SENTRY_DSN */
export async function initSentryIfConfigured(): Promise<void> {
  const dsn = (import.meta as { env?: { VITE_SENTRY_DSN?: string } }).env?.VITE_SENTRY_DSN?.trim();
  if (!dsn || typeof window === "undefined") return;
  if (import.meta.env.DEV) {
    console.info("[telemetry] VITE_SENTRY_DSN set; install @sentry/react to enable Sentry");
  }
}
