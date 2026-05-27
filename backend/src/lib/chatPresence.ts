import { broadcastSseToUser } from "./realtimeHub.js";
import { emitToUser } from "./realtimeSocket.js";

type TypingEntry = {
  userId: string;
  expiresAt: number;
  chatId: string;
  peerId: string | null;
};

const typingByChat = new Map<string, Map<string, TypingEntry>>();

const TYPING_TTL_MS = 3_000;
const PRUNE_INTERVAL_MS = 1_000;

function parseDmChatId(id: string): [string, string] | null {
  if (!id.startsWith("dm:")) return null;
  const body = id.slice(3);
  const sep = body.indexOf(":");
  if (sep <= 0) return null;
  const a = body.slice(0, sep);
  const b = body.slice(sep + 1);
  if (!a || !b) return null;
  return [a, b];
}

/** مفتاح غرفة الكتابة — يتوافق مع dmChatId في الواجهة */
function chatKey(chatId: string, peerId: string | null): string {
  if (chatId.startsWith("dm:")) return chatId;
  if (peerId) {
    const [a, b] = [chatId, peerId].sort();
    return `dm:${a}:${b}`;
  }
  return `chat:${chatId}`;
}

function typingTargets(senderId: string, chatId: string, peerId: string | null): string[] {
  if (peerId && peerId !== senderId) return [peerId];
  const dm = parseDmChatId(chatId);
  if (!dm) return [];
  const other = dm[0] === senderId ? dm[1] : dm[1] === senderId ? dm[0] : null;
  return other ? [other] : [];
}

function notifyTyping(
  senderId: string,
  chatId: string,
  peerId: string | null,
  active: boolean,
): void {
  const payload = { chatId, userId: senderId, active };
  for (const target of typingTargets(senderId, chatId, peerId)) {
    emitToUser(target, "typing", payload);
    broadcastSseToUser(target, "typing", payload);
  }
}

function pruneExpired(): void {
  const now = Date.now();
  for (const room of typingByChat.values()) {
    for (const [uid, entry] of [...room.entries()]) {
      if (entry.expiresAt > now) continue;
      room.delete(uid);
      notifyTyping(entry.userId, entry.chatId, entry.peerId, false);
    }
  }
  for (const [key, room] of [...typingByChat.entries()]) {
    if (room.size === 0) typingByChat.delete(key);
  }
}

setInterval(pruneExpired, PRUNE_INTERVAL_MS);

export function setUserTyping(
  userId: string,
  payload: { chatId: string; peerId?: string | null },
): void {
  const peerId = payload.peerId ?? null;
  const key = chatKey(payload.chatId, peerId);
  let room = typingByChat.get(key);
  if (!room) {
    room = new Map();
    typingByChat.set(key, room);
  }
  room.set(userId, {
    userId,
    expiresAt: Date.now() + TYPING_TTL_MS,
    chatId: payload.chatId,
    peerId,
  });
  notifyTyping(userId, payload.chatId, peerId, true);
}

export function clearUserTyping(
  userId: string,
  payload: { chatId: string; peerId?: string | null },
): void {
  const peerId = payload.peerId ?? null;
  const key = chatKey(payload.chatId, peerId);
  const room = typingByChat.get(key);
  if (!room?.has(userId)) return;
  room.delete(userId);
  if (room.size === 0) typingByChat.delete(key);
  notifyTyping(userId, payload.chatId, peerId, false);
}

/** عند قطع الاتصال — إلغاء كل حالات الكتابة لهذا المستخدم */
export function clearAllTypingForUser(userId: string): void {
  for (const room of typingByChat.values()) {
    for (const [uid, entry] of [...room.entries()]) {
      if (uid !== userId) continue;
      room.delete(uid);
      notifyTyping(entry.userId, entry.chatId, entry.peerId, false);
    }
  }
  for (const [key, room] of [...typingByChat.entries()]) {
    if (room.size === 0) typingByChat.delete(key);
  }
}
