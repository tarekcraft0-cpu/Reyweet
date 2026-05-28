import type { ModeratorActionType, ModeratorRole } from "./moderationTypes";

export const MODERATOR_ROLE_ACTIONS: Record<ModeratorRole, readonly ModeratorActionType[]> = {
  support_agent: ["ignore", "warn", "restrict", "delete_content"],
  senior_moderator: [
    "ignore",
    "warn",
    "temp_ban",
    "restrict",
    "shadow_ban",
    "delete_content",
    "force_password_reset",
  ],
  admin: [
    "ignore",
    "warn",
    "temp_ban",
    "perm_ban",
    "shadow_ban",
    "restrict",
    "delete_content",
    "force_password_reset",
  ],
  super_admin: [
    "ignore",
    "warn",
    "temp_ban",
    "perm_ban",
    "shadow_ban",
    "restrict",
    "delete_content",
    "force_password_reset",
  ],
  internal_trusted: [
    "ignore",
    "warn",
    "temp_ban",
    "perm_ban",
    "shadow_ban",
    "restrict",
    "delete_content",
    "force_password_reset",
  ],
};

export function moderatorCan(role: ModeratorRole, action: ModeratorActionType): boolean {
  return MODERATOR_ROLE_ACTIONS[role].includes(action);
}

export function canReviewAppeals(role: ModeratorRole): boolean {
  return role !== "support_agent";
}

export function canInternalUnban(role: ModeratorRole): boolean {
  return role === "internal_trusted" || role === "super_admin";
}
