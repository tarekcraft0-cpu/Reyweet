import type { Request } from "express";
import { findUserByEmailOrUsername } from "../db/engine.js";
import { applyModerationAction } from "../moderation/banEngine.js";
import { revokeAllTrustedDevices } from "./loginSecurity.js";
import { rateLimitClientKey, rateLimitHit, rateLimitPeek } from "./rateLimit.js";
import { isAuthStrictMode } from "./botGuard.js";

export const SYSTEM_BOT_GUARD_ACTOR = "system:bot-guard";

function identifierFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const id =
    (typeof b.identifier === "string" && b.identifier.trim()) ||
    (typeof b.email === "string" && b.email.trim()) ||
    (typeof b.username === "string" && b.username.trim()) ||
    "";
  return id || null;
}

/** حظر دائم تلقائي — دخول بوت لحساب موجود */
export async function autoBanUserForBotAccess(
  userId: string,
  code: string,
): Promise<void> {
  if (!isAuthStrictMode()) return;
  try {
    await applyModerationAction(userId, SYSTEM_BOT_GUARD_ACTOR, "perm_ban", {
      reason: "دخول آلي أو بوت — حظر تلقائي من النظام",
      guideline: `كود: ${code}`,
    });
    await revokeAllTrustedDevices(userId);
  } catch (e) {
    console.warn("[bot-guard] auto-ban failed:", userId, e);
  }
}

/** عند محاولة دخول بوت: حظر الحساب إن وُجد + تسجيل ضربات IP */
export async function handleBotAuthViolation(
  req: Request,
  body: unknown,
  code: string,
): Promise<void> {
  if (!isAuthStrictMode()) return;

  const ipKey = rateLimitClientKey(req);
  rateLimitHit(`bot-strike:${ipKey}`, 20, 24 * 60 * 60 * 1000);

  const identifier = identifierFromBody(body);
  if (identifier) {
    const user = await findUserByEmailOrUsername(identifier);
    if (user?.id) {
      await autoBanUserForBotAccess(user.id, code);
    }
  }
}

/** جلسة مصادقة من بوت — حظر فوري للحساب النشط */
export async function handleBotSessionViolation(
  req: Request,
  userId: string,
  code: string,
): Promise<void> {
  if (!isAuthStrictMode() || !userId) return;
  const rl = rateLimitHit(`bot-session:${userId}`, 2, 60 * 60 * 1000);
  if (!rl.ok) return;
  await autoBanUserForBotAccess(userId, `session:${code}`);
}

export function isIpBotBlocked(req: Request): boolean {
  const ipKey = rateLimitClientKey(req);
  const strike = rateLimitPeek(`bot-strike:${ipKey}`, 20, 24 * 60 * 60 * 1000);
  return !strike.ok;
}
