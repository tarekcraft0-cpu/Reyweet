import type { ModeratorRole } from "../../../src/lib/moderationTypes.js";
import { isPlatformAdmin } from "../lib/verificationAdmin.js";

import { SUPPORT_OFFICIAL_ACCOUNT_ID } from "../../../src/lib/supportOfficialAccount.js";

const DEFAULT_INTERNAL_IDS = ["u_founder_tareqf", SUPPORT_OFFICIAL_ACCOUNT_ID];

export function getModeratorRole(userId: string): ModeratorRole | null {
  const internal = (process.env.INTERNAL_TRUSTED_USER_IDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const trusted = [...DEFAULT_INTERNAL_IDS, ...internal];
  if (trusted.includes(userId)) return "internal_trusted";

  const superIds = (process.env.SUPER_ADMIN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (superIds.includes(userId) || isPlatformAdmin(userId)) return "super_admin";

  const adminIds = (process.env.MODERATOR_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (adminIds.includes(userId)) return "admin";

  const senior = (process.env.SENIOR_MODERATOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (senior.includes(userId)) return "senior_moderator";

  const support = (process.env.SUPPORT_AGENT_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (support.includes(userId)) return "support_agent";

  if (isPlatformAdmin(userId)) return "admin";
  return null;
}

export function requireModeratorRole(userId: string): ModeratorRole {
  const role = getModeratorRole(userId);
  if (!role) throw new Error("MODERATOR_FORBIDDEN");
  return role;
}

export function verifyInternalOverrideKey(header: string | undefined): boolean {
  const secret = process.env.MODERATION_INTERNAL_SECRET?.trim();
  if (!secret || !header) return false;
  return header === secret;
}
