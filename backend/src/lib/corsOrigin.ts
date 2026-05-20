/**
 * CORS للموقع (Vercel / localhost / LAN) وتطبيق الجوال (Expo WebView / Capacitor).
 * عناوين الشبكة المحلية مسموحة دائماً — لا تُقيَّد بـ NODE_ENV.
 */
export function createCorsOriginChecker(): (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void {
  const extraOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const allowAll = process.env.CORS_ALLOW_ALL === "1";

  const patterns: RegExp[] = [
    /^capacitor:\/\//i,
    /^ionic:\/\//i,
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
    /^https:\/\/reyweet\.vercel\.app$/i,
    /^https:\/\/[a-z0-9-]+-retweet\.vercel\.app$/i,
    /^https:\/\/[a-z0-9-]+(-[a-z0-9-]+)*\.vercel\.app$/i,
    /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i,
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/i,
    /^https?:\/\/\[::1\](:\d+)?$/i,
  ];

  return (origin, cb) => {
    if (allowAll) return cb(null, true);
    if (!origin) return cb(null, true);
    if (patterns.some(re => re.test(origin))) return cb(null, true);
    if (extraOrigins.some(o => origin === o || origin.startsWith(o))) return cb(null, true);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[CORS] blocked origin: ${origin}`);
    }
    cb(new Error("CORS blocked"));
  };
}
