import { isNativeCapacitorShell } from "./apiUrlPolicy";

const APP_SIGN_SECRET = (import.meta.env.VITE_RETWEET_APP_SIGNING_SECRET || "").trim();

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** توقيع طلبات التطبيق الأصلي — يمنع تزوير Origin: capacitor:// */
export async function appRequestSignHeaders(
  method: string,
  path: string,
): Promise<Record<string, string>> {
  if (!APP_SIGN_SECRET || APP_SIGN_SECRET.length < 16) return {};
  if (!isNativeCapacitorShell()) return {};
  const t = Date.now().toString();
  const m = method.toUpperCase();
  const p = path.startsWith("/") ? path : `/${path}`;
  const payload = `${t}\n${m}\n${p.split("?")[0]}`;
  const sig = await hmacSha256Hex(APP_SIGN_SECRET, payload);
  return {
    "X-Retweet-App-Time": t,
    "X-Retweet-App-Sig": sig,
    "X-Retweet-Client": "native",
  };
}
