import type { Chat, ID, Message } from "./types";
import { visibleChatMessages } from "./store";
import { dmChatId } from "./dmChatId";
import { messageContent } from "./chatNormalize";
import { isStickerImageContent, isStickerVideoContent } from "./stickerUtils";

const PREVIEW_MAX = 96;

function truncateText(s: string, max = PREVIEW_MAX): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export function lastMessagePreview(last: Message | undefined): string {
  if (!last) return "—";
  const c = messageContent(last);
  if (last.type === "text") return truncateText(c);
  if (last.type === "sticker") {
    return isStickerImageContent(c) || isStickerVideoContent(c) ? "ملصق" : truncateText(c, 24);
  }
  if (last.type === "image") return last.viewOnce ? "صورة (مرة واحدة)" : "صورة";
  if (last.type === "drawing") return last.viewOnce ? "رسم (مرة واحدة)" : "رسم";
  if (last.type === "video") return last.viewOnce ? "فيديو (مرة واحدة)" : "فيديو";
  if (last.type === "voice") return "رسالة صوتية";
  if (last.type === "shared_post") return "منشور";
  if (last.type === "shared_story") return "ستوري";
  return `[${last.type}]`;
}

export function chatHasUnread(c: Chat, meId: ID): boolean {
  const msgs = visibleChatMessages(c, meId);
  const last = msgs[msgs.length - 1];
  if (!last || last.senderId === meId) return false;
  const readId = c.lastReadMessageIdByUser?.[meId];
  return last.id !== readId;
}

export function chatUnreadCount(c: Chat, meId: ID): number {
  const readId = c.lastReadMessageIdByUser?.[meId];
  const hidden = c.hiddenMessageIdsByUser?.[meId];
  let readAt = -1;
  if (readId) {
    const rm = (c.messages || []).find(m => m.id === readId);
    readAt = rm?.createdAt ?? -1;
  }
  let count = 0;
  for (const m of c.messages || []) {
    if (hidden?.includes(m.id)) continue;
    if (m.senderId === meId) continue;
    if (m.createdAt > readAt) count++;
  }
  return count;
}

/** معرّف الطرف الذي يكتب في محادثة DM */
export function resolveListTypingPeerId(
  c: Chat,
  meId: ID,
  typingUserByChatId: Record<ID, ID>,
): ID | null {
  if (c.isGroup || c.isChannel) return null;
  const otherId = c.members.find(id => id !== meId);
  if (!otherId) return null;
  const storageId = dmChatId(meId, otherId);
  const typingUser =
    typingUserByChatId[storageId] ?? typingUserByChatId[c.id] ?? typingUserByChatId[openChatIdForList(c, meId)];
  return typingUser === otherId ? otherId : null;
}

function openChatIdForList(c: Chat, meId: ID): string {
  if (!c.isGroup && !c.isChannel && c.members.length === 2) {
    const other = c.members.find(id => id !== meId);
    if (other) return dmChatId(meId, other);
  }
  return c.id;
}

/** نشط خلال آخر 5 دقائق (تقريب presence من lastOpenAt) */
export function isPeerOnline(c: Chat, peerId: ID | null): boolean {
  if (!peerId) return false;
  const last = c.lastOpenAtByUser?.[peerId] ?? 0;
  return Date.now() - last < 5 * 60_000;
}

export function listTypingPreview(lang: string): string {
  return lang === "ar" ? "يكتب…" : "Typing…";
}

export const CHAT_INBOX_ROW_HEIGHT_PX = 84;
