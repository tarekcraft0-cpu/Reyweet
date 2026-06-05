import type { Request } from "express";
import type { BotGuardResult } from "./botGuard.js";
import {
  isDirectVpsHost,
  isIngressEnforced,
  isLocalDevRequest,
  verifyAppRequestSignature,
  verifyIngressSignature,
} from "./appRequestSign.js";

function requestPath(req: Request): string {
  const base = req.baseUrl || "";
  const p = req.path || "";
  return `${base}${p}`.split("?")[0] || "";
}

function isIngressExemptPath(req: Request): boolean {
  const p = requestPath(req);
  if (p === "/health") return true;
  if (p.includes("/rt-ws")) return true;
  if (p.startsWith("/media/") || p.startsWith("/uploads/")) return true;
  return false;
}

/** يمنع استدعاء API مباشرة عبر IP السيرفر — فقط بروكسي Vercel أو توقيع التطبيق */
export function assertApiIngress(req: Request): BotGuardResult {
  if (!isIngressEnforced()) return { ok: true };
  if (isLocalDevRequest(req)) return { ok: true };
  if (isIngressExemptPath(req)) return { ok: true };
  if (verifyIngressSignature(req)) return { ok: true };
  if (verifyAppRequestSignature(req)) return { ok: true };
  if (isDirectVpsHost(req)) {
    return {
      ok: false,
      status: 403,
      error: "الوصول المباشر للخادم ممنوع — استخدم تطبيق Retweet الرسمي أو الموقع",
      code: "direct_vps_denied",
    };
  }
  return {
    ok: false,
    status: 403,
    error: "طلب API غير مصرح",
    code: "api_ingress_denied",
  };
}
