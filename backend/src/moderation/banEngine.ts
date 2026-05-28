import { randomUUID } from "node:crypto";
import type { UserRow } from "../db/engine.js";
import type {
  AccountStatus,
  ModeratorActionType,
  UserModerationState,
} from "../../../src/lib/moderationTypes.js";
import {
  appendModerationAudit,
  getUserModerationState,
  saveUserModerationState,
} from "../db/moderationStore.js";
import { emitToUsers } from "../lib/realtimeSocket.js";
import { broadcastSseToUser } from "../lib/realtimeHub.js";
import { DEFAULT_AVATAR_DATA_URI } from "../lib/defaultAvatar.js";

export type BanInfo = {
  accountStatus: AccountStatus;
  username: string;
  avatar: string;
  banReason: string;
  banGuideline?: string;
  bannedAt: number;
  banExpiresAt?: number | null;
  canAppeal: boolean;
  permanentlyDisabled: boolean;
};

export function isBannedStatus(status: AccountStatus): boolean {
  return status === "BANNED" || status === "TEMP_BANNED" || status === "PERMANENTLY_BANNED";
}

export function canAppealStatus(state: UserModerationState): boolean {
  if (state.accountStatus === "PERMANENTLY_BANNED") return false;
  return state.accountStatus === "BANNED" || state.accountStatus === "TEMP_BANNED";
}

export async function getBanInfoForUser(user: UserRow): Promise<BanInfo | null> {
  const state = await getUserModerationState(user.id);
  if (!isBannedStatus(state.accountStatus) && state.accountStatus !== "RESTRICTED") {
    if (state.accountStatus === "SHADOW_BANNED") return null;
    return null;
  }
  if (!isBannedStatus(state.accountStatus)) return null;

  const av = user.avatar?.trim() || DEFAULT_AVATAR_DATA_URI;
  return {
    accountStatus: state.accountStatus,
    username: user.username,
    avatar: av,
    banReason: state.banReason || "انتهاك إرشادات المجتمع",
    banGuideline: state.banGuideline,
    bannedAt: state.bannedAt || Date.now(),
    banExpiresAt: state.banExpiresAt,
    canAppeal: canAppealStatus(state),
    permanentlyDisabled: state.accountStatus === "PERMANENTLY_BANNED",
  };
}

export async function applyModerationAction(
  userId: string,
  moderatorId: string,
  action: ModeratorActionType,
  opts: {
    reason: string;
    guideline?: string;
    durationHours?: number;
    reportId?: string;
  },
): Promise<UserModerationState> {
  const state = await getUserModerationState(userId);
  const now = Date.now();

  state.violations.unshift({
    id: randomUUID(),
    userId,
    reportId: opts.reportId,
    action,
    reason: opts.reason,
    guideline: opts.guideline,
    at: now,
    moderatorId,
  });
  state.violationCount = state.violations.length;

  switch (action) {
    case "warn":
      break;
    case "restrict":
      state.accountStatus = "RESTRICTED";
      state.restrictedUntil = now + (opts.durationHours ?? 72) * 3600_000;
      break;
    case "shadow_ban":
      state.accountStatus = "SHADOW_BANNED";
      state.shadowBanned = true;
      break;
    case "temp_ban":
      state.accountStatus = "TEMP_BANNED";
      state.banReason = opts.reason;
      state.banGuideline = opts.guideline;
      state.bannedAt = now;
      state.banExpiresAt = now + (opts.durationHours ?? 168) * 3600_000;
      break;
    case "perm_ban":
      state.accountStatus = "PERMANENTLY_BANNED";
      state.banReason = opts.reason;
      state.banGuideline = opts.guideline;
      state.bannedAt = now;
      state.banExpiresAt = null;
      break;
    default:
      break;
  }

  if (action === "temp_ban" || action === "perm_ban") {
    state.accountStatus = action === "perm_ban" ? "PERMANENTLY_BANNED" : "TEMP_BANNED";
  }

  await saveUserModerationState(state);
  await appendModerationAudit({
    actorId: moderatorId,
    action: `ban.${action}`,
    entityType: "user",
    entityId: userId,
    meta: { reason: opts.reason, reportId: opts.reportId },
  });

  const payload = { userId, accountStatus: state.accountStatus };
  broadcastSseToUser(userId, "account:moderation", payload);
  emitToUsers([userId], "account:moderation", payload);

  return state;
}

export async function restoreAccount(userId: string, actorId: string): Promise<UserModerationState> {
  const state = await getUserModerationState(userId);
  state.accountStatus = "ACTIVE";
  state.banReason = undefined;
  state.banGuideline = undefined;
  state.bannedAt = undefined;
  state.banExpiresAt = undefined;
  state.restrictedUntil = undefined;
  state.shadowBanned = false;
  await saveUserModerationState(state);
  await appendModerationAudit({
    actorId,
    action: "account.restored",
    entityType: "user",
    entityId: userId,
  });
  const payload = { userId, accountStatus: "ACTIVE", restored: true };
  broadcastSseToUser(userId, "account:moderation", payload);
  emitToUsers([userId], "account:moderation", payload);
  return state;
}

export async function rejectAppealPermanent(userId: string, moderatorId: string): Promise<UserModerationState> {
  const state = await getUserModerationState(userId);
  state.accountStatus = "PERMANENTLY_BANNED";
  state.banReason = state.banReason || "تم رفض الطعن";
  state.banExpiresAt = null;
  await saveUserModerationState(state);
  await appendModerationAudit({
    actorId: moderatorId,
    action: "appeal.rejected_permanent",
    entityType: "user",
    entityId: userId,
  });
  emitToUsers([userId], "account:moderation", {
    userId,
    accountStatus: "PERMANENTLY_BANNED",
    permanentlyDisabled: true,
  });
  return state;
}

/** بروفايل عام لمستخدم محظور — يظهر الاسم فقط */
export function bannedPublicProfilePayload(username: string) {
  return {
    id: "",
    username,
    banned: true,
    banMessage: "This account has been banned.",
    banMessageAr: "تم حظر هذا الحساب.",
    avatar: "",
    bio: "",
    followers: [],
    following: [],
    verified: false,
    isPrivate: true,
  };
}

export async function resolveEffectiveStatus(userId: string): Promise<AccountStatus> {
  const state = await getUserModerationState(userId);
  if (
    state.accountStatus === "TEMP_BANNED" &&
    state.banExpiresAt &&
    state.banExpiresAt < Date.now()
  ) {
    state.accountStatus = "ACTIVE";
    state.banReason = undefined;
    state.banExpiresAt = undefined;
    await saveUserModerationState(state);
    return "ACTIVE";
  }
  if (state.restrictedUntil && state.restrictedUntil < Date.now()) {
    state.accountStatus = "ACTIVE";
    state.restrictedUntil = undefined;
    await saveUserModerationState(state);
    return "ACTIVE";
  }
  return state.accountStatus;
}
