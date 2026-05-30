import type { UserRow } from "../db/engine.js";

import { SUPPORT_OFFICIAL_ACCOUNT_ID } from "../../../src/lib/supportOfficialAccount.js";

const DEFAULT_ADMIN_IDS = ["u_founder_tareqf", SUPPORT_OFFICIAL_ACCOUNT_ID];

export function getAdminUserIds(): string[] {
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (!raw) return [...DEFAULT_ADMIN_IDS];
  return [...new Set([...DEFAULT_ADMIN_IDS, ...raw.split(",").map(s => s.trim()).filter(Boolean)])];
}

export function isPlatformAdmin(userId: string): boolean {
  return getAdminUserIds().includes(userId);
}

export function userRowToVerificationPayload(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    verified: user.verified === true,
    isSubscribed: user.isSubscribed === true,
    subscriptionPlan: user.subscriptionPlan ?? "",
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    verificationStatus: user.verificationStatus ?? (user.verified ? "approved" : "none"),
    verificationBadgeColor: user.verificationBadgeColor ?? "blue",
    verificationRequestedAt: user.verificationRequestedAt,
    verificationRejectReason: user.verificationRejectReason,
  };
}
