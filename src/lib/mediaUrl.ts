import { peekApiBaseUrl } from "./apiConfig";
import { getApiBaseUrl } from "./apiBackend";
import {
  isLanOrLocalHostname,
  isNativeCapacitorShell,
  isPrivateApiUrl,
  isPublicAppHost,
  isStaleMobileApiUrl,
  isTunnelPublicHost,
  isVpsProductionHost,
  PRODUCTION_VPS_HOST,
  VERCEL_SITE_URL,
} from "./apiUrlPolicy";

/** وسائط يمكن عرضها في <img> أو <video> (وليس نصاً خاماً) */
export function isRenderableMediaUrl(s: string | undefined | null): boolean {
  if (!s?.trim()) return false;
  const t = s.trim();
  return (
    t.startsWith("data:") ||
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("blob:") ||
    t.startsWith("/media/") ||
    t.startsWith("/stickers/") ||
    t.startsWith("/app/")
  );
}

/**
 * على HTTPS (Vercel إلخ): عنوان API بـ http:// يُحمِّل الفيديو كمحتوى مختلط فيُحظر.
 * نعرض الملفات تحت `/media/` من منشأ الصفحة حيث يعمل بروكسي `/media`.
 */
function coerceMediaBaseForHttpsPage(base: string): string {
  const b = base.trim().replace(/\/$/, "");
  if (!b || typeof window === "undefined") return b;
  if (!isPublicAppHost()) return b;
  if (!window.location.protocol.startsWith("https")) return b;
  if (!b.startsWith("http://")) return b;
  try {
    if (isLanOrLocalHostname(new URL(b).hostname)) return b;
  } catch {
    return b;
  }
  return window.location.origin.replace(/\/$/, "");
}

/** منشأ الصفحة الحالية — الأفضل لعرض /media/ عبر بروكسي Vercel (HTTPS) */
function pageOriginForMedia(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin.replace(/\/$/, "");
}

/**
 * منشأ عرض الملفات (/media/ …) — على iOS/Capacitor لا نستخدم capacitor://localhost
 * بل عنوان API الإنتاج (Vercel HTTPS) المحقون في index.html.
 */
export function getMediaServingOrigin(): string {
  if (typeof window === "undefined") return VERCEL_SITE_URL;

  if (isNativeCapacitorShell()) {
    const w = window as Window & { __RETWEET_API_URL__?: string };
    const injected = w.__RETWEET_API_URL__?.trim().replace(/\/$/, "");
    if (injected && !isPrivateApiUrl(injected) && !isStaleMobileApiUrl(injected)) {
      return injected;
    }
    const fromApi = (getApiBaseUrl() || peekApiBaseUrl() || "").replace(/\/$/, "");
    if (fromApi && !isPrivateApiUrl(fromApi) && !isStaleMobileApiUrl(fromApi)) return fromApi;
    return VERCEL_SITE_URL;
  }

  if (isPublicAppHost() && !isVpsProductionHost()) {
    return pageOriginForMedia() || VERCEL_SITE_URL;
  }

  const fromApi = getApiBaseUrl() || peekApiBaseUrl();
  if (fromApi?.trim()) return coerceMediaBaseForHttpsPage(fromApi.trim());
  const injected = (window as Window & { __RETWEET_API_URL__?: string }).__RETWEET_API_URL__?.trim();
  if (injected && !isPrivateApiUrl(injected)) return coerceMediaBaseForHttpsPage(injected);
  return pageOriginForMedia() || VERCEL_SITE_URL;
}

function getMediaResolveBase(): string {
  return getMediaServingOrigin();
}

function isServerMediaPath(path: string): boolean {
  return (
    path.startsWith("/media/") ||
    path.startsWith("/stickers/") ||
    path.startsWith("/public/")
  );
}

function resolveServerMediaPath(pathnameOnly: string, search: string): string {
  const base = getMediaServingOrigin().replace(/\/$/, "");
  return `${base}${pathnameOnly}${search}`;
}

/** يحوّل روابط قديمة (نفق/localhost) إلى مسار /media/ ثم يضيف عنوان API الحالي */
export function normalizeMediaRef(src: string | undefined | null): string {
  const v = (src ?? "").trim();
  if (!v) return "";
  if (v.startsWith("data:") || v.startsWith("blob:")) return v;
  if (v.length <= 4 && !v.startsWith("/") && !/^https?:\/\//i.test(v)) return v;

  let path = v;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (u.pathname.startsWith("/media/")) {
        path = `${u.pathname}${u.search || ""}`;
      } else if (v.includes("/media/")) {
        const m = v.match(/(\/media\/(?:images|videos)\/[^\s?#"']+)/i);
        if (m) path = m[1];
      }
    } catch {
      const m = v.match(/(\/media\/(?:images|videos)\/[^\s?#"']+)/i);
      if (m) path = m[1];
    }
  }

  if (isServerMediaPath(path)) {
    const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const pathnameOnly = path.split("?")[0] ?? path;
    return resolveServerMediaPath(pathnameOnly, search);
  }

  /** روابط مطلقة: لا نُسقط كل https — ملصقات وملفات /app/ وباقي المواقع */
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (isPrivateApiUrl(v)) return "";
      if (isTunnelPublicHost(u.hostname) || /\.trycloudflare\.com$/i.test(u.hostname)) return "";

      /** ميديا من السيرفر — على الويب عبر منشأ الصفحة؛ على iOS عبر Vercel API */
      if (isServerMediaPath(u.pathname)) {
        return resolveServerMediaPath(u.pathname, u.search || "");
      }

      /** روابط مخزَّنة تشير إلى الـ VPS مباشرة — نمرِّرها على بروكسي الإنتاج */
      if (u.hostname === PRODUCTION_VPS_HOST && isServerMediaPath(u.pathname)) {
        return resolveServerMediaPath(u.pathname, u.search || "");
      }

      const h = u.hostname;
      if (!isNativeCapacitorShell()) {
        if (typeof window !== "undefined" && h === window.location.hostname)
          return `${u.origin}${u.pathname}${u.search || ""}`;
      }
      if (h === "reyweet.vercel.app" || h.endsWith(".vercel.app"))
        return `${u.origin}${u.pathname}${u.search || ""}`;
      /** https خارجي (صور روابط خارجية إن وُجدت) */
      if (u.protocol === "https:") return `${u.origin}${u.pathname}${u.search || ""}`;
      /** http قديم على iOS — إن كان مسار ميديا نعيده عبر HTTPS Vercel */
      if (isNativeCapacitorShell() && u.pathname.startsWith("/media/")) {
        return resolveServerMediaPath(u.pathname, u.search || "");
      }
      /** http قديم بدون /media/ — يُحظر على صفحات HTTPS */
      return "";
    } catch {
      return "";
    }
  }

  return v;
}

/** للتخزين المحلي — مسار /media/...?v= بدون ربطه بنفق ثابت */
export function toStoredMediaRef(src: string | undefined | null): string {
  const v = (src ?? "").trim();
  if (!v) return "";
  if (v.startsWith("data:") || v.startsWith("blob:")) return v;
  if (v.length <= 4 && !v.startsWith("/") && !/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/media/")) return v;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (u.pathname.startsWith("/media/")) return `${u.pathname}${u.search || ""}`;
    } catch {
      /* ignore */
    }
    const m = v.match(/(\/media\/(?:images|videos)\/[^\s#"']+(?:\?v=\d+)?)/i);
    if (m) return m[1];
  }
  return v;
}

/** يحوّل مسار نسبي من الخادم (/media/...) إلى رابط كامل للعرض */
export function resolveMediaUrl(src: string | undefined | null): string {
  return normalizeMediaRef(src);
}
