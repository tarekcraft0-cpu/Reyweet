import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** نطاق إنتاج الواجهة (بروكسي API + WebSocket) */
export const VERCEL_SITE_URL = "https://reyweet.vercel.app";
/** VPS الإنتاج — API مباشر */
export const PRODUCTION_VPS_HOST = "109.199.111.29";
export const PRODUCTION_VPS_API = `http://${PRODUCTION_VPS_HOST}`;

/** الواجهة على Vercel HTTPS — API عبر بروكسي نفس النطاق (ليس IP مباشر) */
export function shouldUseVercelApiProxy(backendUrl) {
  if (process.env.RETWEET_USE_VERCEL_PROXY === "0") return false;
  return (
    backendUrl.startsWith("http://") &&
    !/localhost|127\.0\.0\.1|192\.168\./i.test(backendUrl)
  );
}

/** نفق Cloudflare مؤقت — لا يُنشر في bundle الإنتاج */
export function isTunnelApiUrl(url) {
  return /\.trycloudflare\.com/i.test(String(url || "").trim());
}

/** Backend لبروكسي Vercel (rewrites → VPS) — ليس نفقاً منتهياً */
export function resolveVpsBackendUrl(raw) {
  const u = String(raw || "")
    .trim()
    .replace(/\/$/, "");
  if (!u || isTunnelApiUrl(u)) return PRODUCTION_VPS_API;
  if (shouldUseVercelApiProxy(u)) return u;
  if (u.startsWith("http://109.199.111.29") || u === PRODUCTION_VPS_API) return PRODUCTION_VPS_API;
  if (u.startsWith("http://") && !/localhost|127\.0\.0\.1|192\.168\./i.test(u)) return u;
  return PRODUCTION_VPS_API;
}

/** عنوان API في الواجهة (SPA) — دائماً reyweet.vercel.app على الإنتاج */
export function resolveWebFrontendApiUrl(raw) {
  const u = String(raw || "")
    .trim()
    .replace(/\/$/, "");
  if (!u || isTunnelApiUrl(u)) return VERCEL_SITE_URL;
  if (shouldUseVercelApiProxy(u) || u.startsWith("http://")) return VERCEL_SITE_URL;
  if (u.includes("reyweet.vercel.app") || u.endsWith(".vercel.app")) return VERCEL_SITE_URL;
  return VERCEL_SITE_URL;
}

export function readPublicApiUrl() {
  const apiFile = path.join(root, "PUBLIC_API_URL.txt");
  if (fs.existsSync(apiFile)) {
    const line = fs
      .readFileSync(apiFile, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.startsWith("http"));
    if (line) {
      const u = line.replace(/\/$/, "");
      if (!isTunnelApiUrl(u)) return u;
    }
  }

  const fromEnv = (process.env.RETWEET_PUBLIC_API_URL || process.env.RETWEET_STABLE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv && !isTunnelApiUrl(fromEnv)) return fromEnv;

  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const key of ["RETWEET_PUBLIC_API_URL", "RETWEET_STABLE_URL"]) {
      const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
      const v = m?.[1]?.trim().replace(/\/$/, "");
      if (v && !isTunnelApiUrl(v)) return v;
    }
  }

  const tunnelFile = path.join(root, "PUBLIC_TUNNEL_URL.txt");
  if (fs.existsSync(tunnelFile)) {
    const line = fs
      .readFileSync(tunnelFile, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.startsWith("http"));
    if (line && !isTunnelApiUrl(line)) return line.replace(/\/$/, "");
  }

  /** أنشئ PUBLIC_API_URL.txt عبر npm run contabo:deploy ثم npm run vercel:deploy */
  return "";
}

/** API للتطبيق (iOS/Android) — HTTPS عبر Vercel فقط (iOS يحظر HTTP VPS) */
export function resolveMobileApiUrl() {
  const explicit = (process.env.CAPACITOR_API_URL || process.env.RETWEET_MOBILE_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;

  const raw = readPublicApiUrl();
  if (raw && raw.startsWith("https://") && !/\.trycloudflare\.com/i.test(raw)) {
    return raw.replace(/\/$/, "");
  }
  if (raw && shouldUseVercelApiProxy(raw)) return VERCEL_SITE_URL;
  if (raw && /\.trycloudflare\.com/i.test(raw)) return VERCEL_SITE_URL;
  if (raw && raw.startsWith("http://")) return VERCEL_SITE_URL;
  return VERCEL_SITE_URL;
}

