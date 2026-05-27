import { peekApiBaseUrl } from "./apiConfig";
import { getApiBaseUrl } from "./apiBackend";
import {
  isLanOrLocalHostname,
  isPrivateApiUrl,
  isPublicAppHost,
  isTunnelPublicHost,
  PRODUCTION_VPS_HOST,
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

function getMediaResolveBase(): string {
  const fromApi = getApiBaseUrl() || peekApiBaseUrl();
  if (fromApi?.trim()) return coerceMediaBaseForHttpsPage(fromApi.trim());
  if (typeof window !== "undefined") {
    const w = window as Window & { __RETWEET_API_URL__?: string };
    const injected = w.__RETWEET_API_URL__?.trim().replace(/\/$/, "");
    if (injected && !isPrivateApiUrl(injected))
      return coerceMediaBaseForHttpsPage(injected);
  }
  return "";
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

  if (path.startsWith("/media/")) {
    const base = getMediaResolveBase().replace(/\/$/, "");
    const search = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    const pathnameOnly = path.split("?")[0] ?? path;
    if (base) return `${base}${pathnameOnly}${search}`;
    return `${pathnameOnly}${search}`;
  }

  /** روابط مطلقة: لا نُسقط كل https — ملصقات وملفات /app/ وباقي المواقع */
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      if (isPrivateApiUrl(v)) return "";
      if (isTunnelPublicHost(u.hostname) || /\.trycloudflare\.com$/i.test(u.hostname)) return "";

      /** ميديا من السيرفر — عرض عبر المنشأ الحالي أو بروكسي Vercel */
      if (u.pathname.startsWith("/media/")) {
        const b = getMediaResolveBase().replace(/\/$/, "");
        const origin =
          typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
        const merged = (b || origin).replace(/\/$/, "");
        return merged ? `${merged}${u.pathname}${u.search || ""}` : `${u.pathname}${u.search || ""}`;
      }

      /** روابط مخزَّنة تشير إلى الـ VPS مباشرة — نمرِّرها على بروكسي الصفحة */
      if (
        u.hostname === PRODUCTION_VPS_HOST &&
        (u.pathname.startsWith("/stickers/") ||
          u.pathname.startsWith("/app/") ||
          u.pathname.startsWith("/public/"))
      ) {
        const origin =
          typeof window !== "undefined" ? window.location.origin.replace(/\/$/, "") : "";
        if (origin) return `${origin}${u.pathname}${u.search || ""}`;
      }

      const h = u.hostname;
      if (typeof window !== "undefined" && h === window.location.hostname)
        return `${u.origin}${u.pathname}${u.search || ""}`;
      if (h === "reyweet.vercel.app" || h.endsWith(".vercel.app"))
        return `${u.origin}${u.pathname}${u.search || ""}`;
      /** https خارجي (صور روابط خارجية إن وُجدت) */
      if (u.protocol === "https:") return `${u.origin}${u.pathname}${u.search || ""}`;
      /** http خارجي — يُحظر على صفحات HTTPS */
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
