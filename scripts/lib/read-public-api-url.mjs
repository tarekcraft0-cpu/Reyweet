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

export function readPublicApiUrl() {
  const apiFile = path.join(root, "PUBLIC_API_URL.txt");
  if (fs.existsSync(apiFile)) {
    const line = fs
      .readFileSync(apiFile, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.startsWith("http"));
    if (line) return line.replace(/\/$/, "");
  }

  const fromEnv = (process.env.RETWEET_PUBLIC_API_URL || process.env.RETWEET_STABLE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const key of ["RETWEET_PUBLIC_API_URL", "RETWEET_STABLE_URL"]) {
      const m = text.match(new RegExp(`^${key}=(.+)$`, "m"));
      if (m?.[1]?.trim()) return m[1].trim().replace(/\/$/, "");
    }
  }

  const tunnelFile = path.join(root, "PUBLIC_TUNNEL_URL.txt");
  if (fs.existsSync(tunnelFile)) {
    const line = fs
      .readFileSync(tunnelFile, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .find(l => l.startsWith("http"));
    if (line) return line.replace(/\/$/, "");
  }

  /** أنشئ PUBLIC_API_URL.txt عبر npm run contabo:deploy ثم npm run vercel:deploy */
  return "";
}

