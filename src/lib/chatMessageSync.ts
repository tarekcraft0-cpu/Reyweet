import type { ID } from "./types";

/** حالة التزامن لكل محادثة (للتحميل التدريجي عند السحب لأعلى) */
export type ChatMessageSyncMeta = {
  hasMore: boolean;
  oldestCursor?: number;
  loading: boolean;
};

const metaByChat = new Map<string, ChatMessageSyncMeta>();
const inFlight = new Map<string, Promise<void>>();

function key(userId: ID, chatId: ID): string {
  return `${userId}::${chatId}`;
}

export function getChatMessageSyncMeta(userId: ID, chatId: ID): ChatMessageSyncMeta {
  return metaByChat.get(key(userId, chatId)) ?? { hasMore: false, loading: false };
}

export function setChatMessageSyncMeta(
  userId: ID,
  chatId: ID,
  patch: Partial<ChatMessageSyncMeta>,
): void {
  const k = key(userId, chatId);
  const prev = metaByChat.get(k) ?? { hasMore: false, loading: false };
  metaByChat.set(k, { ...prev, ...patch });
}

export function clearChatMessageSyncForUser(userId: ID): void {
  const prefix = `${userId}::`;
  for (const k of metaByChat.keys()) {
    if (k.startsWith(prefix)) metaByChat.delete(k);
  }
  for (const k of inFlight.keys()) {
    if (k.startsWith(prefix)) inFlight.delete(k);
  }
}

/** يمنع تحميلين متوازيين لنفس المحادثة */
export async function runChatMessageLoad(
  userId: ID,
  chatId: ID,
  job: () => Promise<void>,
): Promise<void> {
  const k = key(userId, chatId);
  const pending = inFlight.get(k);
  if (pending) return pending;
  const p = job().finally(() => {
    inFlight.delete(k);
    setChatMessageSyncMeta(userId, chatId, { loading: false });
  });
  inFlight.set(k, p);
  setChatMessageSyncMeta(userId, chatId, { loading: true });
  return p;
}
