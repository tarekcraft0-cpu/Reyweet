import type { Request } from "express";
import { findUserByEmailOrUsername, findUserIdsByEmail, getUserById } from "../db/engine.js";
import {
  findUsersByIp,
  findUsersSharingIpWith,
  getUserModerationState,
  saveUserModerationState,
} from "../db/moderationStore.js";
import { applyModerationAction } from "../moderation/banEngine.js";
import { revokeAllTrustedDevices } from "./loginSecurity.js";
import { rateLimitClientKey, rateLimitHit, rateLimitPeek } from "./rateLimit.js";
import { isAuthStrictMode } from "./botGuard.js";
import { blockIpPermanently, isIpPermanentlyBlockedSync } from "./ipBlocklist.js";
import { invalidateAllUserTokens } from "./tokenSecurity.js";
import {
  SYSTEM_BOT_GUARD_ACTOR,
  SYSTEM_BOT_LINK_ACTOR,
} from "./botModerationActors.js";

export { SYSTEM_BOT_GUARD_ACTOR, SYSTEM_BOT_LINK_ACTOR };

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

function linkTypeLabel(linkType: "ip" | "email"): string {
  return linkType === "ip" ? "نفس عنوان IP" : "نفس البريد الإلكتروني";
}

async function sourceUsername(sourceUserId: string): Promise<string> {
  const u = await getUserById(sourceUserId);
  return u?.username ? `@${u.username}` : "حساب آخر";
}

/** حظر مباشر — نشاط بوت — لا يُرفع إلا بطعن مقبول */
export async function autoBanUserForBotAccess(userId: string, code: string): Promise<void> {
  if (!isAuthStrictMode() || !userId) return;
  try {
    const prev = await getUserModerationState(userId);
    const alreadyBotBanned =
      prev.violations?.some(
        v => v.moderatorId === SYSTEM_BOT_GUARD_ACTOR || v.moderatorId === SYSTEM_BOT_LINK_ACTOR,
      ) &&
      (prev.accountStatus === "BANNED" ||
        prev.accountStatus === "PERMANENTLY_BANNED" ||
        prev.accountStatus === "TEMP_BANNED");
    if (!alreadyBotBanned) {
      await applyModerationAction(userId, SYSTEM_BOT_GUARD_ACTOR, "ban", {
        reason: "نشاط بوت — حظر تلقائي فوري",
        guideline: `كود: ${code}. لا يُرفع الحظر تلقائياً — قدّم طعناً من داخل التطبيق فقط.`,
      });
      const state = await getUserModerationState(userId);
      state.linkedBanSourceUserId = undefined;
      state.linkedBanType = undefined;
      await saveUserModerationState(state);
    }
    await revokeAllTrustedDevices(userId);
    await invalidateAllUserTokens(userId);
  } catch (e) {
    console.warn("[bot-guard] auto-ban failed:", userId, e);
  }
}

/** حظر ربط — مرتبط بحساب بوت عبر IP أو إيميل */
export async function autoBanUserForBotLink(
  userId: string,
  sourceUserId: string,
  linkType: "ip" | "email",
  code: string,
): Promise<void> {
  if (!isAuthStrictMode() || !userId || userId === sourceUserId) return;
  try {
    const prev = await getUserModerationState(userId);
    if (
      prev.violations?.some(
        v => v.moderatorId === SYSTEM_BOT_GUARD_ACTOR || v.moderatorId === SYSTEM_BOT_LINK_ACTOR,
      ) &&
      (prev.accountStatus === "BANNED" ||
        prev.accountStatus === "PERMANENTLY_BANNED" ||
        prev.accountStatus === "TEMP_BANNED")
    ) {
      return;
    }

    const srcLabel = await sourceUsername(sourceUserId);
    const via = linkTypeLabel(linkType);
    await applyModerationAction(userId, SYSTEM_BOT_LINK_ACTOR, "ban", {
      reason: "حظر ربط — مرتبط بحساب آخر تم تعطيله",
      guideline: `تم تعطيل هذا الحساب لأنه مرتبط بـ ${srcLabel} عبر ${via}. الحساب المرتبط عُطّل تلقائياً بسبب نشاط بوت. إذا كنت تعتقد أن هذا خطأ يمكنك تقديم طعن. كود: ${code}`,
    });
    const state = await getUserModerationState(userId);
    state.linkedBanSourceUserId = sourceUserId;
    state.linkedBanType = linkType;
    await saveUserModerationState(state);
    await revokeAllTrustedDevices(userId);
    await invalidateAllUserTokens(userId);
  } catch (e) {
    console.warn("[bot-guard] linked-ban failed:", userId, sourceUserId, e);
  }
}

async function findLinkedAccounts(
  seedUserId: string,
  requestIp: string,
): Promise<Array<{ userId: string; linkType: "ip" | "email" }>> {
  const linked = new Map<string, "ip" | "email">();
  const seed = await getUserById(seedUserId);
  const seedState = await getUserModerationState(seedUserId);

  const ips = new Set(seedState.ipAddresses ?? []);
  if (requestIp && requestIp !== "unknown") ips.add(requestIp);

  for (const ip of ips) {
    for (const uid of await findUsersByIp(ip)) {
      if (uid !== seedUserId) linked.set(uid, "ip");
    }
  }
  for (const uid of await findUsersSharingIpWith(seedUserId)) {
    if (uid !== seedUserId) linked.set(uid, "ip");
  }

  if (seed?.email?.trim()) {
    for (const uid of await findUserIdsByEmail(seed.email)) {
      if (uid !== seedUserId && !linked.has(uid)) linked.set(uid, "email");
    }
  }

  return [...linked.entries()].map(([userId, linkType]) => ({ userId, linkType }));
}

async function banBotNetwork(seedIds: string[], ip: string, code: string): Promise<string[]> {
  const banned = new Set<string>();
  const seeds = [...new Set(seedIds.filter(Boolean))];

  for (const seedId of seeds) {
    await autoBanUserForBotAccess(seedId, code);
    banned.add(seedId);

    for (const { userId, linkType } of await findLinkedAccounts(seedId, ip)) {
      if (banned.has(userId)) continue;
      await autoBanUserForBotLink(userId, seedId, linkType, code);
      banned.add(userId);
    }
  }

  if (ip && ip !== "unknown") {
    const fallbackSeed = seeds[0];
    for (const uid of await findUsersByIp(ip)) {
      if (banned.has(uid)) continue;
      if (fallbackSeed) {
        await autoBanUserForBotLink(uid, fallbackSeed, "ip", code);
      } else {
        await autoBanUserForBotAccess(uid, code);
      }
      banned.add(uid);
    }
  }

  return [...banned];
}

/** محاولة دخول/تسجيل بوت — حظر الحساب + الحسابات المرتبطة + IP */
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

  const bannedIds = await banBotNetwork(seedIds, ip, code);
  if (ip && ip !== "unknown") {
    try {
      await blockIpPermanently(ip, `بوت — ${code}`, bannedIds);
    } catch (e) {
      console.warn("[bot-guard] IP block failed:", ip, e);
    }
  }
}

/** جلسة API تُكتشف كبوت — حظر فوري للحساب + الحسابات المرتبطة */
export async function handleBotSessionViolation(
  req: Request,
  userId: string,
  code: string,
): Promise<void> {
  if (!userId || !isAuthStrictMode()) return;
  const ip = clientIpFromRequest(req);
  const bannedIds = await banBotNetwork([userId], ip, code);
  if (ip && ip !== "unknown") {
    try {
      await blockIpPermanently(ip, `جلسة بوت — ${code}`, bannedIds);
    } catch (e) {
      console.warn("[bot-guard] session IP block failed:", ip, e);
    }
  }
  console.warn("[bot-guard] session auto-banned:", userId, code, ip, "linked:", bannedIds.length);
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
