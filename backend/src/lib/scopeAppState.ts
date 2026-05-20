import type { AppState, Chat, ID, Message } from "../../../src/lib/types.js";
import { canonicalizeDmChatId } from "./dmChatId.js";

function dmPeerIds(chat: Chat, ownerId: ID): string[] {
  return (chat.members || []).filter(id => id !== ownerId);
}

function messageBelongsToChatForOwner(m: Message, chat: Chat, ownerId: string): boolean {
  if (!Array.isArray(chat.members) || !chat.members.includes(ownerId)) return false;
  if (chat.isGroup || chat.isChannel) return true;
  const peers = dmPeerIds(chat, ownerId);
  if (peers.length === 1) {
    const peer = peers[0]!;
    return m.senderId === ownerId || m.senderId === peer;
  }
  if (peers.length === 0) return m.senderId === ownerId;
  return peers.includes(m.senderId) || m.senderId === ownerId;
}

function repairDmChatForOwner(chat: Chat, ownerId: string): Chat | null {
  if (chat.isGroup || chat.isChannel) return chat;
  const peers = dmPeerIds(chat, ownerId);
  if (peers.length === 0) return null;
  if (peers.length === 1) {
    return {
      ...chat,
      isGroup: false,
      isChannel: false,
      members: [ownerId, peers[0]!],
    };
  }
  let bestPeer = peers[0]!;
  let bestCount = -1;
  for (const peer of peers) {
    const n = (chat.messages || []).filter(
      m => m.senderId === ownerId || m.senderId === peer,
    ).length;
    if (n > bestCount) {
      bestCount = n;
      bestPeer = peer;
    }
  }
  return {
    ...chat,
    isGroup: false,
    isChannel: false,
    members: [ownerId, bestPeer],
  };
}

function chatBelongsToAccount(chat: Chat, ownerId: string): boolean {
  const members = Array.isArray(chat.members) ? chat.members : [];
  if (!members.includes(ownerId)) return false;
  if (chat.isGroup || chat.isChannel) return true;
  const peers = dmPeerIds(chat, ownerId);
  if (peers.length === 1) return true;
  if (peers.length === 0) return false;
  return repairDmChatForOwner(chat, ownerId) != null;
}

export function scopeChatForAccount(chat: Chat, ownerId: string): Chat | null {
  let scoped = chat;
  if (!chatBelongsToAccount(chat, ownerId)) return null;
  if (!chat.isGroup && !chat.isChannel && dmPeerIds(chat, ownerId).length !== 1) {
    const repaired = repairDmChatForOwner(chat, ownerId);
    if (!repaired) return null;
    scoped = repaired;
  }

  const messages = (scoped.messages || []).filter(m =>
    messageBelongsToChatForOwner(m, scoped, ownerId),
  );

  const lastOpenAtByUser =
    scoped.lastOpenAtByUser && scoped.lastOpenAtByUser[ownerId] != null
      ? { [ownerId]: scoped.lastOpenAtByUser[ownerId]! }
      : {};
  const lastReadMessageIdByUser =
    scoped.lastReadMessageIdByUser && scoped.lastReadMessageIdByUser[ownerId] != null
      ? { [ownerId]: scoped.lastReadMessageIdByUser[ownerId]! }
      : {};
  const hiddenMessageIdsByUser =
    scoped.hiddenMessageIdsByUser && scoped.hiddenMessageIdsByUser[ownerId]
      ? { [ownerId]: [...scoped.hiddenMessageIdsByUser[ownerId]!] }
      : undefined;

  const normalized = {
    ...scoped,
    members:
      !scoped.isGroup && !scoped.isChannel
        ? [ownerId, dmPeerIds(scoped, ownerId)[0]!]
        : scoped.members,
    lastOpenAtByUser,
    lastReadMessageIdByUser,
    hiddenMessageIdsByUser,
    messages,
  };
  return canonicalizeDmChatId(normalized, ownerId);
}

/** عزل لقطة الحساب على الخادم قبل الحفظ — لا تُخزَّن محادثات حساب آخر في snapshot */
export function scopeAppStateToOwner(ownerId: string, state: AppState): AppState {
  const chats = (state.chats || [])
    .map(c => scopeChatForAccount(c, ownerId))
    .filter((c): c is Chat => c != null);

  const notifications = (state.notifications || []).filter(n => n.userId === ownerId);
  const stories = (state.stories || []).filter(st => st.userId === ownerId);

  return {
    ...state,
    currentUserId: ownerId,
    chats,
    notifications,
    stories,
  };
}
