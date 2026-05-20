import type { Chat, ID } from "./types";

/** معرّف ثابت لمحادثة DM بين مستخدمين — يمنع تجميع رسائل أزواج مختلفين تحت chatId عشوائي */
export function dmChatId(userA: ID, userB: ID): string {
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
  return `dm:${a}:${b}`;
}

export function isDmChatId(id: string): boolean {
  return id.startsWith("dm:");
}

export function parseDmChatId(id: string): [ID, ID] | null {
  if (!isDmChatId(id)) return null;
  const body = id.slice(3);
  const sep = body.indexOf(":");
  if (sep <= 0) return null;
  const a = body.slice(0, sep);
  const b = body.slice(sep + 1);
  if (!a || !b) return null;
  return [a, b];
}

export function dmPeerFromChat(chat: Chat, ownerId: ID): ID | null {
  if (chat.isGroup || chat.isChannel) return null;
  return chat.members.find(id => id !== ownerId) ?? null;
}

/** مفتاح تخزين موحّد — يدمج غرف legacy ذات id عشوائي مع dm: */
export function chatMergeKey(chat: Chat, ownerId: ID): string {
  const peer = dmPeerFromChat(chat, ownerId);
  if (peer) return dmChatId(ownerId, peer);
  return chat.id;
}

export function canonicalizeDmChatId(chat: Chat, ownerId: ID): Chat {
  const peer = dmPeerFromChat(chat, ownerId);
  if (!peer) return chat;
  const id = dmChatId(ownerId, peer);
  if (chat.id === id) return chat;
  return { ...chat, id, members: [ownerId, peer], isGroup: false, isChannel: false };
}

/** معرّف موحّد لفتح المحادثة في الواجهة (DM → dm:… وإلا chat.id) */
export function openChatIdFor(chat: Chat, ownerId: ID): string {
  return chatMergeKey(chat, ownerId);
}

/** إيجاد المحادثة من openChat حتى لو تغيّر id بعد الدمج */
export function findChatByOpenId(chats: Chat[], openId: ID, ownerId: ID): Chat | null {
  for (const c of chats) {
    if (!c.members.includes(ownerId)) continue;
    if (c.isGroup || c.isChannel) {
      if (c.id === openId) return c;
      continue;
    }
    if (c.id === openId || chatMergeKey(c, ownerId) === openId) return c;
  }
  const parsed = parseDmChatId(openId);
  if (!parsed) return null;
  const peer = parsed[0] === ownerId ? parsed[1] : parsed[1] === ownerId ? parsed[0] : null;
  if (!peer) return null;
  for (const c of chats) {
    if (c.isGroup || c.isChannel) continue;
    if (!c.members.includes(ownerId)) continue;
    if (dmPeerFromChat(c, ownerId) === peer) return c;
  }
  return null;
}
