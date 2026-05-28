import type { Chat, ID } from "./types";
import type {
  GroupMemberRecord,
  GroupPermission,
  GroupRole,
  GroupSettings,
} from "./groupTypes";
import { DEFAULT_GROUP_SETTINGS } from "./groupTypes";

/** مصفوفة الصلاحيات — RBAC */
export const GROUP_ROLE_PERMISSIONS: Record<GroupRole, readonly GroupPermission[]> = {
  owner: [
    "group.delete",
    "group.transfer_ownership",
    "group.edit_info",
    "group.edit_settings",
    "group.manage_invites",
    "group.view_audit",
    "members.add",
    "members.remove",
    "members.ban",
    "members.unban",
    "members.mute",
    "members.restrict",
    "members.view_list",
    "roles.assign_admin",
    "roles.remove_admin",
    "roles.assign_moderator",
    "roles.remove_moderator",
    "roles.demote_any_admin",
    "join_requests.approve",
    "messages.send",
    "messages.delete_any",
    "messages.pin",
    "messages.schedule",
  ],
  admin: [
    "group.edit_info",
    "group.edit_settings",
    "group.manage_invites",
    "members.add",
    "members.remove",
    "members.ban",
    "members.mute",
    "members.restrict",
    "members.view_list",
    "roles.assign_moderator",
    "roles.remove_moderator",
    "roles.demote_any_admin",
    "join_requests.approve",
    "messages.send",
    "messages.delete_any",
    "messages.pin",
    "messages.schedule",
  ],
  moderator: [
    "members.view_list",
    "members.mute",
    "members.restrict",
    "messages.send",
    "messages.delete_any",
    "messages.pin",
  ],
  member: ["members.view_list", "messages.send"],
};

export function roleHasPermission(role: GroupRole, permission: GroupPermission): boolean {
  return GROUP_ROLE_PERMISSIONS[role].includes(permission);
}

export function resolveGroupRole(
  chat: Pick<Chat, "ownerId" | "memberRoles" | "admins" | "members">,
  userId: ID,
): GroupRole | null {
  if (!chat.members.includes(userId)) return null;
  if (chat.ownerId === userId) return "owner";
  const fromMap = chat.memberRoles?.[userId];
  if (fromMap) return fromMap;
  if ((chat.admins || []).includes(userId)) return "admin";
  return "member";
}

export function canGroup(
  chat: Pick<Chat, "ownerId" | "memberRoles" | "admins" | "members" | "bannedUserIds">,
  userId: ID,
  permission: GroupPermission,
): boolean {
  if (chat.bannedUserIds?.includes(userId)) return false;
  const role = resolveGroupRole(chat, userId);
  if (!role) return false;
  return roleHasPermission(role, permission);
}

/** Admin يقدر يسحب Admin ثاني إذا عنده roles.demote_any_admin والهدف ليس Owner */
export function canChangeMemberRole(
  actorRole: GroupRole,
  targetRole: GroupRole,
  newRole: GroupRole,
): boolean {
  if (actorRole === "owner") return targetRole !== "owner" || newRole === "owner";
  if (actorRole !== "admin") return false;
  if (targetRole === "owner") return false;
  if (newRole === "owner") return false;
  if (targetRole === "admin" && newRole !== "admin") {
    return roleHasPermission("admin", "roles.demote_any_admin");
  }
  if (newRole === "admin") return roleHasPermission("admin", "roles.assign_admin");
  if (newRole === "moderator") return roleHasPermission("admin", "roles.assign_moderator");
  if (targetRole === "moderator" && newRole === "member") {
    return roleHasPermission("admin", "roles.remove_moderator");
  }
  return false;
}

export function adminsFromRoles(
  ownerId: ID,
  memberRoles: Record<ID, GroupRole> | undefined,
  members: ID[],
): ID[] {
  const admins = new Set<ID>();
  for (const id of members) {
    const r = id === ownerId ? "owner" : memberRoles?.[id];
    if (r === "owner" || r === "admin") admins.add(id);
  }
  if (ownerId) admins.add(ownerId);
  return [...admins];
}

export function mergeGroupSettings(partial?: Partial<GroupSettings>): GroupSettings {
  return { ...DEFAULT_GROUP_SETTINGS, ...partial };
}

export function chatToMemberRoles(chat: Chat): Record<ID, GroupRole> {
  const map: Record<ID, GroupRole> = { ...(chat.memberRoles || {}) };
  const owner = chat.ownerId || chat.createdByUserId || chat.admins?.[0];
  if (owner) map[owner] = "owner";
  for (const id of chat.admins || []) {
    if (id !== owner && !map[id]) map[id] = "admin";
  }
  for (const id of chat.members) {
    if (!map[id]) map[id] = "member";
  }
  return map;
}

export function memberRecordsFromChat(chat: Chat): GroupMemberRecord[] {
  const roles = chatToMemberRoles(chat);
  const meta = chat.memberMeta || {};
  return chat.members.map(userId => ({
    userId,
    role: roles[userId] || "member",
    joinedAt: meta[userId]?.joinedAt ?? Date.now(),
    addedBy: meta[userId]?.addedBy,
    mutedUntil: chat.mutedUserIds?.[userId],
    restrictedUntil: chat.restrictedUserIds?.includes(userId)
      ? Number.MAX_SAFE_INTEGER
      : undefined,
  }));
}
