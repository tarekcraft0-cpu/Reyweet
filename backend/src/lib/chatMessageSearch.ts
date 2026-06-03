import type { Message } from "../../../src/lib/types.js";
import { listMessagesForUser } from "../db/engine.js";
import { dmChatId } from "./dmChatId.js";
import { messageRowToClient } from "./chatMessages.js";

export type MessageSearchHit = {
  chatId: string;
  messageId: string;
  preview: string;
  createdAt: number;
  isGroup: boolean;
  chatLabel: string;
};

export async function searchMessagesForUser(
  userId: string,
  query: string,
  limit = 30,
): Promise<MessageSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const rows = await listMessagesForUser(userId);
  const hits: MessageSearchHit[] = [];

  for (const row of rows) {
    const content = (row.content || "").toLowerCase();
    if (!content.includes(q)) continue;
    const msg = messageRowToClient(row);
    const peer =
      row.senderId === userId ? row.receiverId : row.senderId;
    const isDm = !!(peer && row.receiverId);
    const chatId = isDm && peer ? dmChatId(userId, peer) : row.chatId;
    hits.push({
      chatId,
      messageId: msg.id,
      preview: msg.content.slice(0, 120),
      createdAt: msg.createdAt,
      isGroup: !isDm,
      chatLabel: isDm ? peer || chatId : row.chatId,
    });
    if (hits.length >= limit) break;
  }

  hits.sort((a, b) => b.createdAt - a.createdAt);
  return hits.slice(0, limit);
}

/** بحث داخل محادثة واحدة (نص الرسائل) */
export function searchMessagesInChat(
  userId: string,
  chat: { id: string; isGroup?: boolean; isChannel?: boolean; members: string[]; messages?: Message[] },
  query: string,
  limit = 50,
): Message[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return [];
  const msgs = chat.messages || [];
  const out: Message[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!(m.content || "").toLowerCase().includes(q)) continue;
    out.push(m);
    if (out.length >= limit) break;
  }
  return out.reverse();
}
