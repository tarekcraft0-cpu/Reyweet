import type { Request } from "express";
import { findUserByEmailOrUsername } from "../db/engine.js";
import { findUsersByIp, getUserModerationState } from "../db/moderationStore.js";
import { applyModerationAction } from "../moderation/banEngine.js";
import { revokeAllTrustedDevices } from "./loginSecurity.js";
import { rateLimitClientKey, rateLimitHit, rateLimitPeek } from "./rateLimit.js";
import { isAuthStrictMode } from "./botGuard.js";
import { blockIpPermanently, isIpPermanentlyBlockedSync } from "./ipBlocklist.js";
import { invalidateAllUserTokens } from "./tokenSecurity.js";

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

/** حظر فوري — لا يُرفع إلا بطعن مقبول */
export async function autoBanUserForBotAccess(userId: string, code: string): Promise<void> {
  if (!isAuthStrictMode() || !userId) return;
  try {
    const prev = await getUserModerationState(userId);
    const alreadyBotBanned =
      prev.violations?.some(v => v.moderatorId === SYSTEM_BOT_GUARD_ACTOR) &&
      (prev.accountStatus === "BANNED" ||
        prev.accountStatus === "PERMANENTLY_BANNED" ||
        prev.accountStatus === "TEMP_BANNED");
    if (!alreadyBotBanned) {
      await applyModerationAction(userId, SYSTEM_BOT_GUARD_ACTOR, "ban", {
        reason: "نشاط بوت — حظر تلقائي فوري",
        guideline: `كود: ${code}. لا يُرفع الحظر تلقائياً — قدّم طعناً من داخل التطبيق فقط.`,
      });
    }
    await revokeAllTrustedDevices(userId);
    await invalidateAllUserTokens(userId);
  } catch (e) {
    console.warn("[bot-guard] auto-ban failed:", userId, e);
  }
}

async function banUsersLinkedToIp(ip: string, code: string, seedIds: string[]): Promise<string[]> {
  const ids = new Set(seedIds);
  if (ip && ip !== "unknown") {
    for (const uid of await findUsersByIp(ip)) ids.add(uid);
  }
  for (const uid of ids) {
    await autoBanUserForBotAccess(uid, code);
  }
  return [...ids];
}

/** محاولة دخول/تسجيل بوت — حظر كل حساب مرتبط + IP */
export async function handleBotAuthViolation(
  req: Request,
  body: unknown,
  code: string,
): Promise<void> {
  if (!isAuthStrictMode()) return;

  const ip = clientIpFromRequest(req);
  const ipKey = rateLimitClientKey(req);
  rateLimitHit(`bot-strike:${ipKey}`, 20, 24 * 60 * 60 * 1000);

  const seedIds: string[] = [];
  const identifier = identifierFromBody(body);
  if (identifier) {
    const user = await findUserByEmailOrUsername(identifier);
    if (user?.id) seedIds.push(user.id);
  }

  const bannedIds = await banUsersLinkedToIp(ip, code, seedIds);
  if (ip && ip !== "unknown") {
    try {
      await blockIpPermanently(ip, `بوت — ${code}`, bannedIds);
    } catch (e) {
      console.warn("[bot-guard] IP block failed:", ip, e);
    }
  }
}

/** جلسة API تُكتشف كبوت — حظر فوري للحساب + IP */
export async function handleBotSessionViolation(
  req: Request,
  userId: string,
  code: string,
): Promise<void> {
  if (!userId || !isAuthStrictMode()) return;
  const ip = clientIpFromRequest(req);
  const bannedIds = await banUsersLinkedToIp(ip, code, [userId]);
  if (ip && ip !== "unknown") {
    try {
      await blockIpPermanently(ip, `جلسة بوت — ${code}`, bannedIds);
    } catch (e) {
      console.warn("[bot-guard] session IP block failed:", ip, e);
    }
  }
  console.warn("[bot-guard] session auto-banned:", userId, code, ip);
}



export function clientIpFromRequest(req: Request): string {

  const key = rateLimitClientKey(req);

  return key.startsWith("ip:") ? key.slice(3) : "unknown";

}



export function isIpBotBlocked(req: Request): boolean {

  const ip = clientIpFromRequest(req);

  if (isIpPermanentlyBlockedSync(ip)) return true;

  const ipKey = rateLimitClientKey(req);

  const strike = rateLimitPeek(`bot-strike:${ipKey}`, 20, 24 * 60 * 60 * 1000);

  return !strike.ok;

}


