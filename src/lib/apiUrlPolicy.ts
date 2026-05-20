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
    h === "reyweet.vercel.app" ||
    h.endsWith(".vercel.app") ||
    isTunnelPublicHost(h)
  );
}

/** لا تستخدم http://hostname:3000 إلا على LAN/localhost */
export function isLanOrLocalHostname(hostname: string): boolean {
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/i.test(hostname)) return true;
  return false;
}
