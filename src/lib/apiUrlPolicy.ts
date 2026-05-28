/** VPS الإنتاج — عنوان API المباشر (nginx :80 → :3000) */
export const PRODUCTION_VPS_HOST = "109.199.111.29";
export const PRODUCTION_VPS_API = `http://${PRODUCTION_VPS_HOST}`;
/** الواجهة العامة — بروكسي API (HTTPS) */
export const VERCEL_SITE_URL = "https://reyweet.vercel.app";

/** الواجهة تُخدم من نفس الـ VPS (اتصال API/WebSocket مباشر بدون بروكسي) */
export function isVpsProductionHost(hostname?: string): boolean {
  const h =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  return h === PRODUCTION_VPS_HOST;
}

/** عناوين لا تصل إليها متصفحات الإنترنت (LAN / localhost). */
export function isPrivateApiUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const { hostname, protocol } = new URL(u);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

/** نفق Cloudflare المؤقت — الواجهة والـ API على نفس الأصل عند التوجيه إلى :3000 */
export function isTunnelPublicHost(hostname?: string): boolean {
  const h =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  return /\.trycloudflare\.com$/i.test(h);
}

export function isPublicAppHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    isVpsProductionHost(h) ||
    h === "reyweet.vercel.app" ||
    h.endsWith(".vercel.app") ||
    isTunnelPublicHost(h)
  );
}

/** عنوان API يطابق VPS الإنتاج */
export function isProductionVpsApiUrl(url: string): boolean {
  try {
    return new URL(url.trim()).hostname === PRODUCTION_VPS_HOST;
  } catch {
    return false;
  }
}

/** لا تستخدم http://hostname:3000 إلا على LAN/localhost */
export function isLanOrLocalHostname(hostname: string): boolean {
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  return false;
}

/** تطبيق iOS/Android (Capacitor) */
export function isNativeCapacitorShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __RETWEET_NATIVE_SHELL__?: boolean;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (w.__RETWEET_NATIVE_SHELL__ === true) return true;
  try {
    return w.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** نفق Cloudflare مؤقت — يُرفض إلا إذا الصفحة على نفس النفق (تطوير نشط) */
export function isExpiredTunnelApiUrl(url: string): boolean {
  const u = url.trim();
  if (!u || !/\.trycloudflare\.com/i.test(u)) return false;
  if (typeof window === "undefined") return true;
  try {
    return new URL(u).origin !== window.location.origin;
  } catch {
    return true;
  }
}

/** عناوين API قديمة (نفق منتهٍ، HTTP VPS على HTTPS، إلخ) */
export function isStaleMobileApiUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (isExpiredTunnelApiUrl(u)) return true;
  if (isProductionVpsApiUrl(u)) return true;
  if (u.startsWith("http://") && !isPrivateApiUrl(u)) return true;
  return false;
}

/** عنوان لا يصلح للصفحة الحالية (LAN على الإنتاج، HTTP من HTTPS، VPS مباشر على Vercel) */
export function isBlockedApiUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (isNativeCapacitorShell()) {
    return isPrivateApiUrl(u) || isStaleMobileApiUrl(u);
  }
  if (typeof window === "undefined") return false;
  if (window.location.protocol === "https:" && u.startsWith("http://")) return true;
  if (isPrivateApiUrl(u)) {
    if (isPublicAppHost()) return true;
    try {
      const apiHost = new URL(u).hostname;
      if (isLanOrLocalHostname(apiHost) && isLanOrLocalHostname(window.location.hostname)) {
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  }
  if (isPublicAppHost() && !isVpsProductionHost() && isProductionVpsApiUrl(u)) return true;
  if (isExpiredTunnelApiUrl(u)) return true;
  return false;
}

/** عنوان API آمن بعد رفض العناوين المحظورة */
export function sanitizeApiBaseUrl(candidate: string): string {
  const u = candidate.trim().replace(/\/$/, "");
  if (!u || isBlockedApiUrl(u)) {
    if (isNativeCapacitorShell()) return VERCEL_SITE_URL;
    if (typeof window !== "undefined") {
      const path = window.location.pathname || "";
      if (isVpsProductionHost() || (isPublicAppHost() && path.startsWith("/app"))) {
        return "";
      }
    }
    return VERCEL_SITE_URL;
  }
  return u;
}
