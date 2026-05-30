import type { ID } from "./types";

const PREFIX = "retweet:chat-draft:";

function key(chatId: ID, userId: ID): string {
  return `${PREFIX}${userId}:${chatId}`;
}

export function loadChatDraft(userId: ID, chatId: ID): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(key(chatId, userId)) ?? "";
  } catch {
    return "";
  }
}

export function saveChatDraft(userId: ID, chatId: ID, text: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const k = key(chatId, userId);
    const trimmed = text.trim();
    if (!trimmed) localStorage.removeItem(k);
    else localStorage.setItem(k, text);
  } catch {
    /* ignore quota */
  }
}

export function clearChatDraft(userId: ID, chatId: ID): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key(chatId, userId));
  } catch {
    /* ignore */
  }
}
