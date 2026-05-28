import type { ID } from "./types";

/** أدوار المجموعة — مطابقة لـ Instagram DM */
export type GroupRole = "owner" | "admin" | "moderator" | "member";

/** نوع/ظهور المجموعة */
export type GroupVisibility = "public" | "private" | "invite_only";

/** صلاحيات فردية قابلة للتوسع */
export type GroupPermission =
  | "group.delete"
  | "group.transfer_ownership"
  | "group.edit_info"
  | "group.edit_settings"
  | "group.manage_invites"
  | "group.view_audit"
  | "members.add"
  | "members.remove"
  | "members.ban"
  | "members.unban"
  | "members.mute"
  | "members.restrict"
  | "members.view_list"
  | "roles.assign_admin"
  | "roles.remove_admin"
  | "roles.assign_moderator"
  | "roles.remove_moderator"
  | "roles.demote_any_admin"
  | "join_requests.approve"
  | "messages.send"
  | "messages.delete_any"
  | "messages.pin"
  | "messages.schedule";

export interface GroupMemberRecord {
  userId: ID;
  role: GroupRole;
  joinedAt: number;
  addedBy?: ID;
  mutedUntil?: number;
  restrictedUntil?: number;
}

export interface GroupSettings {
  description?: string;
  visibility: GroupVisibility;
  approvalRequired: boolean;
  whoCanSendMessages: "everyone" | "admins" | "moderators";
  whoCanAddMembers: "everyone" | "admins";
  whoCanEditGroup: "owner" | "admins";
  slowModeSeconds: number;
  blockLinks: boolean;
  antiSpam: boolean;
  profanityFilter: boolean;
  autoDeleteHours: number;
  muteMentions: boolean;
  muteCalls: boolean;
  theme?: string;
}

export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  visibility: "invite_only",
  approvalRequired: false,
  whoCanSendMessages: "everyone",
  whoCanAddMembers: "admins",
  whoCanEditGroup: "admins",
  slowModeSeconds: 0,
  blockLinks: false,
  antiSpam: true,
  profanityFilter: false,
  autoDeleteHours: 0,
  muteMentions: false,
  muteCalls: false,
};

/** سجل مجموعة مركزي (مصدر حقيقة للـ RBAC على الخادم) */
export interface GroupRegistryRecord {
  chatId: ID;
  ownerId: ID;
  createdAt: number;
  createdBy: ID;
  name: string;
  avatar: string;
  inviteCode: string;
  settings: GroupSettings;
  members: GroupMemberRecord[];
  bannedUserIds: ID[];
  joinRequests: { userId: ID; at: number }[];
  pinnedMessageIds: ID[];
  updatedAt: number;
}

export type GroupAuditAction =
  | "group.created"
  | "group.updated"
  | "group.deleted"
  | "member.added"
  | "member.removed"
  | "member.banned"
  | "member.unbanned"
  | "member.muted"
  | "member.restricted"
  | "role.changed"
  | "ownership.transferred"
  | "invite.regenerated"
  | "join_request.accepted"
  | "join_request.rejected";

export interface GroupAuditEntry {
  id: string;
  chatId: ID;
  actorId: ID;
  action: GroupAuditAction;
  targetUserId?: ID;
  meta?: Record<string, unknown>;
  at: number;
}
