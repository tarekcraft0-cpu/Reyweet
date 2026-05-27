import type { ID, Message } from "./types";

const DB_NAME = "retweet_chat_cache_v1";
const STORE = "messages";
const VERSION = 1;

type CacheRow = {
  key: string;
  chatId: ID;
  userId: ID;
  messages: Message[];
  updatedAt: number;
};

function cacheKey(userId: ID, chatId: ID): string {
  return `${userId}::${chatId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

export async function readCachedChatMessages(
  userId: ID,
  chatId: ID,
): Promise<Message[] | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(cacheKey(userId, chatId));
      req.onsuccess = () => {
        const row = req.result as CacheRow | undefined;
        resolve(row?.messages?.length ? row.messages : null);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function writeCachedChatMessages(
  userId: ID,
  chatId: ID,
  messages: Message[],
): Promise<void> {
  if (!messages.length) return;
  try {
    const db = await openDb();
    const row: CacheRow = {
      key: cacheKey(userId, chatId),
      chatId,
      userId,
      messages: messages.slice(-200),
      updatedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    /* ignore quota / private mode */
  }
}

export async function clearChatCacheForUser(userId: ID): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        const row = cursor.value as CacheRow;
        if (row.userId === userId) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    /* ignore */
  }
}
