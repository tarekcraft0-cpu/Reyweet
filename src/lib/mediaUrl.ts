import { peekApiBaseUrl } from "./apiConfig";
import { getApiBaseUrl } from "./apiBackend";
import { isPrivateApiUrl } from "./apiUrlPolicy";

/** وسائط يمكن عرضها في <img> أو <video> (وليس نصاً خاماً) */
export function isRenderableMediaUrl(s: string | undefined | null): boolean {
  if (!s?.trim()) return false;
  const t = s.trim();
  return (
    t.startsWith("data:") ||
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("blob:") ||
    t.startsWith("/media/")
  );
}

function getMediaResolveBase(): string {
  const fromApi = getApiBaseUrl() || peekApiBaseUrl();
  if (fromApi) return fromApi.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const w = window as Window & { __RETWEET_API_URL__?: string };
    const injected = w.__RETWEET_API_URL__?.trim().replace(/\/$/, "");
    if (injected && !isPrivateApiUrl(injected)) return injected;
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
        path = u.pathname;
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
    const base = getMediaResolveBase();
    if (base) return `${base}${path.split("?")[0]}`;
    return path.split("?")[0] ?? path;
  }

  return v;
}

/** يحوّل مسار نسبي من الخادم (/media/...) إلى رابط كامل للعرض */
export function resolveMediaUrl(src: string | undefined | null): string {
  return normalizeMediaRef(src);
}
