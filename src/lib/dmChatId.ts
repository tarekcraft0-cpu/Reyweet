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

function repairDmMembersForLookup(chat: Chat, ownerId: ID, peer: ID): Chat {
  return {
    ...chat,
    id: dmChatId(ownerId, peer),
    members: [ownerId, peer],
    isGroup: false,
    isChannel: false,
  };
}

/** إيجاد المحادثة من openChat حتى لو تغيّر id أو members تالفة بعد المزامنة */
export function findChatByOpenId(chats: Chat[], openId: ID, ownerId: ID): Chat | null {
  const matchesOpen = (c: Chat): boolean => {
    if (c.isGroup || c.isChannel) return c.id === openId;
    return c.id === openId || chatMergeKey(c, ownerId) === openId;
  };

  for (const c of chats) {
    if (!matchesOpen(c)) continue;
    if (c.isGroup || c.isChannel) {
      if ((c.members || []).includes(ownerId)) return c;
      continue;
    }
    const parsed = parseDmChatId(openId);
    if (parsed?.includes(ownerId)) {
      const peer = parsed[0] === ownerId ? parsed[1]! : parsed[0]!;
      return repairDmMembersForLookup(c, ownerId, peer);
    }
    if ((c.members || []).includes(ownerId)) return c;
    for (const m of c.messages || []) {
      if (m.senderId && m.senderId !== ownerId) {
        return repairDmMembersForLookup(c, ownerId, m.senderId);
      }
    }
  }

  const parsed = parseDmChatId(openId);
  if (!parsed) return null;
  const peer = parsed[0] === ownerId ? parsed[1] : parsed[1] === ownerId ? parsed[0] : null;
  if (!peer) return null;
  for (const c of chats) {
    if (c.isGroup || c.isChannel) continue;
    const members = c.members || [];
    if (members.includes(peer) || members.includes(ownerId)) {
      return repairDmMembersForLookup(c, ownerId, peer);
    }
    if ((c.messages || []).some(m => m.senderId === peer || m.senderId === ownerId)) {
      return repairDmMembersForLookup(c, ownerId, peer);
    }
  }
  return null;
}
