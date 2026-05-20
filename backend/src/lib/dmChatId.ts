import type { Chat } from "../../../src/lib/types.js";

export function dmChatId(userA: string, userB: string): string {
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
  return `dm:${a}:${b}`;
}

export function isDmChatId(id: string): boolean {
  return id.startsWith("dm:");
}

export function dmPeerFromChat(chat: Chat, ownerId: string): string | null {
  if (chat.isGroup || chat.isChannel) return null;
  return chat.members.find(id => id !== ownerId) ?? null;
}

export function canonicalizeDmChatId(chat: Chat, ownerId: string): Chat {
  const peer = dmPeerFromChat(chat, ownerId);
  if (!peer) return chat;
  const id = dmChatId(ownerId, peer);
  if (chat.id === id) return chat;
  return { ...chat, id, members: [ownerId, peer], isGroup: false, isChannel: false };
}

/** تجميع صفوف DM حسب الزوج وليس chatId القديم */
export function dmBucketKeyForRow(
  userId: string,
  row: { chatId: string; senderId: string; receiverId: string | null },
): string {
  if (row.receiverId) {
    const peer = row.senderId === userId ? row.receiverId : row.senderId;
    return dmChatId(userId, peer);
  }
  if (row.senderId !== userId) return dmChatId(userId, row.senderId);
  return row.chatId;
}
