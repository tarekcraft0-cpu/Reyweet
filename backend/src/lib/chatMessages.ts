import type { AppState, Chat, Message } from "../../../src/lib/types.js";
import type { MessageRow } from "../db/engine.js";
import { dmBucketKeyForRow, dmChatId } from "./dmChatId.js";
import { filterMessagesForParticipant } from "./chatAccess.js";
import { scopeChatForAccount } from "./scopeAppState.js";
import { getChatCatalog } from "./chatCatalog.js";

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
  const statusRaw = ex.status;
  const status =
    statusRaw === "delivered" || statusRaw === "read" || statusRaw === "sent"
      ? statusRaw
      : undefined;
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
    parentMessageId:
      typeof ex.parentMessageId === "string" ? (ex.parentMessageId as string) : undefined,
    status,
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

function findExistingDmChat(
  chatsById: Map<string, Chat>,
  userId: string,
  peerId: string,
): Chat | undefined {
  const canonical = dmChatId(userId, peerId);
  const direct = chatsById.get(canonical);
  if (direct) return direct;
  for (const c of chatsById.values()) {
    if (c.isGroup || c.isChannel) continue;
    if (c.members.includes(userId) && c.members.includes(peerId)) return c;
  }
  return undefined;
}

function mergeChatIntoMap(chatsById: Map<string, Chat>, chat: Chat, userId: string): void {
  const scoped = scopeChatForAccount(chat, userId);
  if (!scoped) return;
  const key = scoped.id;
  const prev = chatsById.get(key);
  if (!prev) {
    chatsById.set(key, scoped);
    return;
  }
  chatsById.set(key, {
    ...prev,
    ...scoped,
    id: key,
    members: scoped.members,
    messages: mergeMessageLists(prev.messages, scoped.messages),
    lastOpenAtByUser: { ...prev.lastOpenAtByUser, ...scoped.lastOpenAtByUser },
    lastReadMessageIdByUser: {
      ...prev.lastReadMessageIdByUser,
      ...scoped.lastReadMessageIdByUser,
    },
  });
}

/** يستعيد محادثات DM المفقودة من messages.json */
export async function hydrateChatsFromUserMessages(
  state: AppState,
  userId: string,
  prefetchedRows?: Awaited<ReturnType<typeof import("../db/engine.js").listMessagesForUser>>,
): Promise<AppState> {
  const { listMessagesForUser } = await import("../db/engine.js");
  const rows = prefetchedRows ?? (await listMessagesForUser(userId));
  if (rows.length === 0) return state;

  /** تجميع حسب الزوج (dm:A:B) وليس chatId القديم — يمنع اختفاء محادثات بعد دمج معرّفات legacy */
  const byBucket = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = dmBucketKeyForRow(userId, row);
    const list = byBucket.get(bucket) ?? [];
    list.push(row);
    byBucket.set(bucket, list);
  }

  const chatsById = new Map<string, Chat>();
  for (const c of state.chats || []) {
    mergeChatIntoMap(chatsById, c, userId);
  }
  const catalog = await getChatCatalog();

  for (const [bucketKey, msgs] of byBucket) {
    const remote = msgs.map(messageRowToClient);
    const dmMembers = inferDmMembersForUser(userId, msgs);
    const isDmBucket = bucketKey.startsWith("dm:") && dmMembers;

    if (isDmBucket) {
      const peer = dmMembers[0] === userId ? dmMembers[1]! : dmMembers[0]!;
      const canonicalId = dmChatId(userId, peer);
      const existing = findExistingDmChat(chatsById, userId, peer);
      const catalogChat = catalog.get(bucketKey) ?? catalog.get(canonicalId);
      const draft: Chat = existing
        ? {
            ...existing,
            id: canonicalId,
            isGroup: false,
            isChannel: false,
            members: [userId, peer],
            messages: mergeMessageLists(existing.messages, remote),
          }
        : catalogChat
          ? {
              ...catalogChat,
              id: canonicalId,
              isGroup: false,
              isChannel: false,
              members: [userId, peer],
              messages: mergeMessageLists(catalogChat.messages, remote),
            }
          : {
              id: canonicalId,
              isGroup: false,
              isChannel: false,
              members: [userId, peer],
              admins: [],
              messages: remote,
              request: false,
              lastOpenAtByUser: {},
              lastReadMessageIdByUser: {},
            };
      mergeChatIntoMap(chatsById, draft, userId);
      continue;
    }

    const chatId = bucketKey;
    const existing = chatsById.get(chatId);
    if (existing) {
      mergeChatIntoMap(
        chatsById,
        { ...existing, messages: mergeMessageLists(existing.messages, remote) },
        userId,
      );
      continue;
    }
    const catalogChat = catalog.get(chatId);
    let draft: Chat;
    if (catalogChat) {
      draft = {
        ...catalogChat,
        messages: mergeMessageLists(catalogChat.messages, remote),
      };
    } else {
      const senders = [...new Set(msgs.map(r => r.senderId).filter(Boolean))];
      draft = {
        id: chatId,
        isGroup: !chatId.startsWith("channel_"),
        isChannel: chatId.startsWith("channel_"),
        name: chatId.startsWith("channel_") ? "قناة" : "مجموعة",
        members: [...new Set([userId, ...senders])],
        admins: senders.slice(0, 1),
        messages: remote,
        request: false,
        lastOpenAtByUser: {},
        lastReadMessageIdByUser: {},
      };
    }
    mergeChatIntoMap(chatsById, draft, userId);
  }

  return { ...state, chats: [...chatsById.values()] };
}

export async function hydrateStateWithMessages(
  state: AppState,
  userId?: string,
  prefetchedRows?: Awaited<ReturnType<typeof import("../db/engine.js").listMessagesForUser>>,
): Promise<AppState> {
  const { listMessagesForUser } = await import("../db/engine.js");
  const ownerId = userId || state.currentUserId;
  if (!ownerId || state.chats.length === 0) return state;

  const allRows = prefetchedRows ?? (await listMessagesForUser(ownerId));
  const rowsByBucket = new Map<string, typeof allRows>();
  for (const row of allRows) {
    const bucket = dmBucketKeyForRow(ownerId, row);
    const list = rowsByBucket.get(bucket) ?? [];
    list.push(row);
    rowsByBucket.set(bucket, list);
  }

  return {
    ...state,
    chats: state.chats.map(c => {
      const bucket = c.isGroup || c.isChannel ? c.id : dmBucketKeyForRow(ownerId, {
        chatId: c.id,
        senderId: ownerId,
        receiverId: c.members.find(id => id !== ownerId) ?? null,
      });
      const rows = rowsByBucket.get(bucket) ?? [];
      const visible = filterMessagesForParticipant(ownerId, c, rows);
      const remote = visible.map(messageRowToClient);
      return { ...c, messages: mergeMessageLists(c.messages, remote) };
    }),
  };
}

/** قراءة messages.json مرة واحدة — يمنع التكرار في GET/PUT app-state */
export async function hydrateAppStateMessages(state: AppState, userId: string): Promise<AppState> {
  const { listMessagesForUser } = await import("../db/engine.js");
  const rows = await listMessagesForUser(userId);
  let next = await hydrateChatsFromUserMessages(state, userId, rows);
  next = await hydrateStateWithMessages(next, userId, rows);
  return next;
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
