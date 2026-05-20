import type { AppState, Chat, Message } from "../../../src/lib/types.js";
import type { MessageRow } from "../db/engine.js";
import { dmBucketKeyForRow } from "./dmChatId.js";
import { filterMessagesForParticipant } from "./chatAccess.js";
import { scopeChatForAccount } from "./scopeAppState.js";

function inferDmMembersForUser(userId: string, rows: MessageRow[]): [string, string] | null {
  const peerCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.senderId === userId && row.receiverId) {
      peerCounts.set(row.receiverId, (peerCounts.get(row.receiverId) ?? 0) + 1);
    } else if (row.receiverId === userId && row.senderId !== userId) {
      peerCounts.set(row.senderId, (peerCounts.get(row.senderId) ?? 0) + 1);
    }
  }
  let bestPeer: string | null = null;
  let best = 0;
  for (const [peer, n] of peerCounts) {
    if (n > best) {
      best = n;
      bestPeer = peer;
    }
  }
  if (!bestPeer) return null;
  return [userId, bestPeer];
}

export function messageRowToClient(row: MessageRow): Message {
  const ex = row.extrasJson ?? {};
  return {
    id: row.id,
    senderId: row.senderId,
    type: row.type as Message["type"],
    content: row.content,
    createdAt: new Date(row.createdAt).getTime(),
    durationSec: typeof ex.durationSec === "number" ? ex.durationSec : undefined,
    shareText: typeof ex.shareText === "string" ? ex.shareText : undefined,
    viewOnce: ex.viewOnce === true,
    viewOnceOpenedByUserIds: Array.isArray(ex.viewOnceOpenedByUserIds)
      ? (ex.viewOnceOpenedByUserIds as string[])
      : undefined,
    replyTo: ex.replyTo as Message["replyTo"],
    reactions: ex.reactions as Message["reactions"],
    forwardedFrom: ex.forwardedFrom as Message["forwardedFrom"],
  };
}

export function messageToRow(chatId: string, m: Message, receiverId: string | null): MessageRow {
  const { id, senderId, type, content, createdAt, ...extras } = m;
  const extrasJson =
    Object.keys(extras).length > 0 ? (extras as Record<string, unknown>) : undefined;
  return {
    id,
    chatId,
    senderId,
    receiverId,
    type,
    content,
    createdAt: new Date(createdAt).toISOString(),
    extrasJson,
  };
}

export function mergeMessageLists(local: Message[], remote: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of local) byId.set(m.id, m);
  for (const m of remote) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export function resolveReceiverId(chat: Chat, senderId: string): string | null {
  const isDm = !chat.isGroup && !chat.isChannel && chat.members.length === 2;
  if (!isDm) return null;
  return chat.members.find(id => id !== senderId) ?? null;
}

/** يستعيد محادثات DM المفقودة من messages.json */
export async function hydrateChatsFromUserMessages(
  state: AppState,
  userId: string,
): Promise<AppState> {
  const { listMessagesForUser } = await import("../db/engine.js");
  const rows = await listMessagesForUser(userId);
  if (rows.length === 0) return state;

  const byChat = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.chatId) continue;
    const list = byChat.get(row.chatId) ?? [];
    list.push(row);
    byChat.set(row.chatId, list);
  }

  const chatsById = new Map((state.chats || []).map(c => [c.id, c]));

  for (const [chatId, msgs] of byChat) {
    const remote = msgs.map(messageRowToClient);
    const existing = chatsById.get(chatId);
    if (existing) {
      const merged = {
        ...existing,
        messages: mergeMessageLists(existing.messages, remote),
      };
      const scoped = scopeChatForAccount(merged, userId);
      if (scoped) chatsById.set(chatId, scoped);
      continue;
    }
    const dmMembers = inferDmMembersForUser(userId, msgs);
    if (!dmMembers) continue;
    const draft: Chat = {
      id: chatId,
      isGroup: false,
      isChannel: false,
      members: dmMembers,
      admins: [],
      messages: remote,
      request: false,
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
    };
    const scoped = scopeChatForAccount(draft, userId);
    if (scoped) chatsById.set(chatId, scoped);
  }

  return { ...state, chats: [...chatsById.values()] };
}

export async function hydrateStateWithMessages(
  state: AppState,
  userId?: string,
): Promise<AppState> {
  const { listMessagesByChatIds } = await import("../db/engine.js");
  const ownerId = userId || state.currentUserId;
  const chatIds = state.chats.map(c => c.id);
  if (chatIds.length === 0) return state;
  const grouped = await listMessagesByChatIds(chatIds);
  return {
    ...state,
    chats: state.chats.map(c => {
      const rows = grouped.get(c.id) ?? [];
      const visible = ownerId ? filterMessagesForParticipant(ownerId, c, rows) : rows;
      const remote = visible.map(messageRowToClient);
      return { ...c, messages: mergeMessageLists(c.messages, remote) };
    }),
  };
}

export function extractMessagesFromChats(chats: Chat[]): MessageRow[] {
  const rows: MessageRow[] = [];
  for (const chat of chats) {
    for (const m of chat.messages || []) {
      rows.push(messageToRow(chat.id, m, resolveReceiverId(chat, m.senderId)));
    }
  }
  return rows;
}
