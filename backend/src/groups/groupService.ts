import { randomUUID } from "node:crypto";
import type { Chat } from "../../../src/lib/types.js";
import type { GroupMemberRecord, GroupRegistryRecord, GroupRole } from "../../../src/lib/groupTypes.js";
import { DEFAULT_GROUP_SETTINGS } from "../../../src/lib/groupTypes.js";
import {
  adminsFromRoles,
  canChangeMemberRole,
  canGroup,
  mergeGroupSettings,
} from "../../../src/lib/groupRbac.js";
import type { GroupPermission } from "../../../src/lib/groupTypes.js";
import {
  appendGroupAudit,
  deleteGroupRecord,
  getGroupRecord,
  saveGroupRecord,
  settingsFromRecord,
} from "../db/groupRegistry.js";
import {
  loadGroupChatForAdmin,
  patchGroupChatForMembers,
  syncGroupChatCanonical,
} from "../lib/groupChatDelivery.js";
import { registerGroupInvite } from "../db/groupInvites.js";
import { emitToUsers } from "../lib/realtimeSocket.js";
import { broadcastSseToUser } from "../lib/realtimeHub.js";

export class GroupAuthError extends Error {
  constructor(
    message: string,
    readonly code: "forbidden" | "not_found" | "bad_request" = "forbidden",
  ) {
    super(message);
    this.name = "GroupAuthError";
  }
}

function recordToChatPatch(record: GroupRegistryRecord): Partial<Chat> {
  const memberRoles: Record<string, GroupRole> = {};
  for (const m of record.members) memberRoles[m.userId] = m.role;
  const admins = adminsFromRoles(record.ownerId, memberRoles, record.members.map(m => m.userId));
  return {
    ownerId: record.ownerId,
    description: record.settings.description,
    groupVisibility: record.settings.visibility,
    isPublicGroup: record.settings.visibility === "public",
    memberRoles,
    memberMeta: Object.fromEntries(
      record.members.map(m => [m.userId, { joinedAt: m.joinedAt, addedBy: m.addedBy }]),
    ),
    groupSettings: record.settings,
    bannedUserIds: [...record.bannedUserIds],
    members: record.members.map(m => m.userId),
    admins,
    name: record.name,
    avatar: record.avatar,
    inviteCode: record.inviteCode,
    joinRequests: record.joinRequests,
    pinnedMessageIds: record.pinnedMessageIds,
  };
}

export async function ensureGroupRecord(chat: Chat, creatorId: string): Promise<GroupRegistryRecord> {
  let record = await getGroupRecord(chat.id);
  if (record) return record;

  const ownerId = chat.ownerId || chat.createdByUserId || creatorId;
  const now = Date.now();
  const members: GroupMemberRecord[] = chat.members.map(userId => ({
    userId,
    role:
      userId === ownerId
        ? "owner"
        : (chat.admins || []).includes(userId)
          ? "admin"
          : chat.memberRoles?.[userId] || "member",
    joinedAt: chat.memberMeta?.[userId]?.joinedAt ?? now,
    addedBy: chat.memberMeta?.[userId]?.addedBy,
  }));

  record = {
    chatId: chat.id,
    ownerId,
    createdAt: now,
    createdBy: creatorId,
    name: chat.name || "مجموعة",
    avatar: chat.avatar || "👥",
    inviteCode: chat.inviteCode || randomUUID().slice(0, 10),
    settings: mergeGroupSettings({
      ...chat.groupSettings,
      visibility:
        chat.groupVisibility ||
        (chat.isPublicGroup ? "public" : "invite_only"),
      description: chat.description,
    }),
    members,
    bannedUserIds: chat.bannedUserIds || [],
    joinRequests: chat.joinRequests || [],
    pinnedMessageIds: chat.pinnedMessageIds || [],
    updatedAt: now,
  };
  await saveGroupRecord(record);
  if (record.inviteCode) await registerGroupInvite(record.inviteCode, chat.id, ownerId);
  return record;
}

export async function loadGroupContext(
  chatId: string,
  actorId: string,
): Promise<{ chat: Chat; record: GroupRegistryRecord }> {
  const chat = await loadGroupChatForAdmin(chatId, actorId);
  if (!chat || !chat.isGroup || chat.isChannel) {
    throw new GroupAuthError("المجموعة غير موجودة", "not_found");
  }
  const record = await ensureGroupRecord(chat, actorId);
  const patch = recordToChatPatch(record);
  const merged: Chat = { ...chat, ...patch };
  return { chat: merged, record };
}

export async function requirePermission(
  chatId: string,
  actorId: string,
  permission: GroupPermission,
): Promise<{ chat: Chat; record: GroupRegistryRecord }> {
  const ctx = await loadGroupContext(chatId, actorId);
  if (!canGroup(ctx.chat, actorId, permission)) {
    throw new GroupAuthError("غير مصرح بهذا الإجراء", "forbidden");
  }
  return ctx;
}

async function syncRecordToSnapshots(record: GroupRegistryRecord, actorId: string): Promise<Chat> {
  const patch = recordToChatPatch(record);
  const memberIds = record.members.map(m => m.userId);
  await patchGroupChatForMembers(record.chatId, memberIds, {
    name: patch.name,
    avatar: patch.avatar,
    memberIds,
    isPublicGroup: patch.isPublicGroup,
    inviteCode: patch.inviteCode,
    joinRequests: patch.joinRequests,
    groupPatch: patch,
  });
  const payload = { chatId: record.chatId, kind: "group_updated" };
  for (const uid of memberIds) {
    broadcastSseToUser(uid, "sync_hint", payload);
    emitToUsers([uid], "group:updated", { chatId: record.chatId, patch });
  }
  const chat = await loadGroupChatForAdmin(record.chatId, actorId);
  return chat || ({ id: record.chatId, isGroup: true, ...patch } as Chat);
}

export async function updateGroupSettings(
  chatId: string,
  actorId: string,
  partial: Partial<GroupRegistryRecord["settings"]> & { name?: string; description?: string; avatar?: string },
): Promise<Chat> {
  await requirePermission(chatId, actorId, "group.edit_settings");
  const { record } = await loadGroupContext(chatId, actorId);
  if (partial.name) record.name = partial.name.trim();
  if (partial.avatar) record.avatar = partial.avatar;
  if (partial.description !== undefined) {
    record.settings = { ...record.settings, description: partial.description };
  }
  record.settings = settingsFromRecord({ ...record.settings, ...partial });
  await saveGroupRecord(record);
  await appendGroupAudit({
    chatId,
    actorId,
    action: "group.updated",
    meta: partial,
  });
  return syncRecordToSnapshots(record, actorId);
}

export async function setMemberRole(
  chatId: string,
  actorId: string,
  targetUserId: string,
  newRole: GroupRole,
): Promise<Chat> {
  const { chat, record } = await loadGroupContext(chatId, actorId);
  const actorRole =
    chat.memberRoles?.[actorId] ||
    (chat.ownerId === actorId ? "owner" : (chat.admins || []).includes(actorId) ? "admin" : "member");
  const target = record.members.find(m => m.userId === targetUserId);
  if (!target) throw new GroupAuthError("العضو غير موجود", "not_found");
  if (!canChangeMemberRole(actorRole, target.role, newRole)) {
    throw new GroupAuthError("لا يمكن تغيير هذا الدور", "forbidden");
  }
  if (newRole === "admin" && actorRole !== "owner" && !canGroup(chat, actorId, "roles.assign_admin")) {
    throw new GroupAuthError("لا يمكن تعيين مشرف", "forbidden");
  }
  target.role = newRole;
  if (newRole === "owner") {
    const prevOwner = record.members.find(m => m.role === "owner");
    if (prevOwner && prevOwner.userId !== targetUserId) prevOwner.role = "admin";
    record.ownerId = targetUserId;
  }
  await saveGroupRecord(record);
  await appendGroupAudit({
    chatId,
    actorId,
    action: "role.changed",
    targetUserId,
    meta: { newRole },
  });
  return syncRecordToSnapshots(record, actorId);
}

export async function transferOwnership(
  chatId: string,
  actorId: string,
  newOwnerId: string,
): Promise<Chat> {
  await requirePermission(chatId, actorId, "group.transfer_ownership");
  return setMemberRole(chatId, actorId, newOwnerId, "owner");
}

export async function banMember(
  chatId: string,
  actorId: string,
  targetUserId: string,
): Promise<Chat> {
  await requirePermission(chatId, actorId, "members.ban");
  const { record } = await loadGroupContext(chatId, actorId);
  if (targetUserId === record.ownerId) throw new GroupAuthError("لا يمكن حظر المالك", "bad_request");
  if (!record.bannedUserIds.includes(targetUserId)) record.bannedUserIds.push(targetUserId);
  record.members = record.members.filter(m => m.userId !== targetUserId);
  await saveGroupRecord(record);
  await appendGroupAudit({ chatId, actorId, action: "member.banned", targetUserId });
  await patchGroupChatForMembers(chatId, record.members.map(m => m.userId), {
    removeMemberIds: [targetUserId],
    groupPatch: recordToChatPatch(record),
  });
  return syncRecordToSnapshots(record, actorId);
}

export async function muteMember(
  chatId: string,
  actorId: string,
  targetUserId: string,
  untilMs: number,
): Promise<Chat> {
  await requirePermission(chatId, actorId, "members.mute");
  const { chat, record } = await loadGroupContext(chatId, actorId);
  const muted = { ...(chat.mutedUserIds || {}), [targetUserId]: untilMs };
  await appendGroupAudit({
    chatId,
    actorId,
    action: "member.muted",
    targetUserId,
    meta: { untilMs },
  });
  await patchGroupChatForMembers(chatId, chat.members, {
    groupPatch: { mutedUserIds: muted },
  });
  const m = record.members.find(x => x.userId === targetUserId);
  if (m) m.mutedUntil = untilMs;
  await saveGroupRecord(record);
  return loadGroupContext(chatId, actorId).then(c => c.chat);
}

export async function deleteGroup(chatId: string, actorId: string): Promise<void> {
  await requirePermission(chatId, actorId, "group.delete");
  const { record } = await loadGroupContext(chatId, actorId);
  const members = [...record.members.map(m => m.userId)];
  await appendGroupAudit({ chatId, actorId, action: "group.deleted" });
  await deleteGroupRecord(chatId);
  await patchGroupChatForMembers(chatId, members, {
    removeMemberIds: members.filter(id => id !== actorId),
    groupPatch: { members: [actorId] },
  });
  emitToUsers(members, "group:deleted", { chatId });
}

export function assertCanSendMessage(chat: Chat, userId: string): void {
  if (chat.bannedUserIds?.includes(userId)) throw new GroupAuthError("محظور من المجموعة", "forbidden");
  if (chat.restrictedUserIds?.includes(userId)) {
    throw new GroupAuthError("حسابك مقيّد في هذه المجموعة", "forbidden");
  }
  const mutedUntil = chat.mutedUserIds?.[userId];
  if (mutedUntil && mutedUntil > Date.now()) {
    throw new GroupAuthError("أنت مكتوم مؤقتاً", "forbidden");
  }
  const settings = mergeGroupSettings(chat.groupSettings);
  const role =
    chat.memberRoles?.[userId] ||
    (chat.ownerId === userId ? "owner" : (chat.admins || []).includes(userId) ? "admin" : "member");
  if (settings.whoCanSendMessages === "admins" && role !== "owner" && role !== "admin") {
    throw new GroupAuthError("الإرسال للمشرفين فقط", "forbidden");
  }
  if (settings.whoCanSendMessages === "moderators" && role === "member") {
    throw new GroupAuthError("الإرسال للمشرفين والمشرفين المساعدين فقط", "forbidden");
  }
  if (!canGroup(chat, userId, "messages.send")) {
    throw new GroupAuthError("غير مصرح بالإرسال", "forbidden");
  }
}
