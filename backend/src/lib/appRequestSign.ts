import crypto from "node:crypto";
import type { Request } from "express";

const APP_SKEW_MS = 5 * 60 * 1000;
const INGRESS_SKEW_MS = 90 * 1000;

export function appSigningSecret(): string {
  return (process.env.RETWEET_APP_SIGNING_SECRET || "").trim();
}

export function ingressSecret(): string {
  return (process.env.RETWEET_INGRESS_SECRET || appSigningSecret() || "").trim();
}

export function isIngressEnforced(): boolean {
  if (process.env.REQUIRE_API_INGRESS === "0") return false;
  if (process.env.REQUIRE_API_INGRESS === "1") return true;
  return ingressSecret().length >= 16;
}

export function signPayload(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export function verifyAppRequestSignature(req: Request): boolean {
  const secret = appSigningSecret();
  if (!secret || secret.length < 16) return false;
  const t = String(req.headers["x-retweet-app-time"] || "").trim();
  const sig = String(req.headers["x-retweet-app-sig"] || "").trim().toLowerCase();
  if (!t || !sig || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > APP_SKEW_MS) return false;
  const method = (req.method || "GET").toUpperCase();
  const path = (req.originalUrl || req.url || req.path || "").split("?")[0] || "/";
  const payload = `${t}\n${method}\n${path}`;
  const expected = signPayload(secret, payload);
  return timingSafeEqualHex(sig, expected);
}

export function verifyIngressSignature(req: Request): boolean {
  const secret = ingressSecret();
  if (!secret || secret.length < 16) return false;
  const t = String(req.headers["x-retweet-ingress-time"] || "").trim();
  const sig = String(req.headers["x-retweet-ingress-sig"] || "").trim().toLowerCase();
  if (!t || !sig || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > INGRESS_SKEW_MS) return false;
  const expected = signPayload(secret, t);
  return timingSafeEqualHex(sig, expected);
}

export function isLocalDevRequest(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const ip = String(req.socket.remoteAddress || "")
    .replace(/^::ffff:/, "")
    .trim();
  return ip === "127.0.0.1" || ip === "::1";
}

export function isDirectVpsHost(req: Request): boolean {
  const host = String(req.headers.host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  const publicHost = (process.env.PUBLIC_VPS_HOST || "109.199.111.29").trim().toLowerCase();
  return host === publicHost || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
