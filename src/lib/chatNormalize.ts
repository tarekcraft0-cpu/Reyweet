import type { Chat, ID, Message } from "./types";

const MESSAGE_TYPES = new Set<Message["type"]>([
  "text",
  "image",
  "video",
  "voice",
  "sticker",
  "drawing",
  "shared_post",
  "shared_story",
  "shared_group",
]);

function coerceMessageType(raw: unknown): Message["type"] {
  return typeof raw === "string" && MESSAGE_TYPES.has(raw as Message["type"])
    ? (raw as Message["type"])
    : "text";
}

/** يمنع تعطل ChatRoom عند رسائل تالفة من التخزين المحلي أو API قديم */
export function normalizeChatMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Message;
  if (typeof m.id !== "string" || !m.id) return null;
  if (typeof m.senderId !== "string" || !m.senderId) return null;

  const type = coerceMessageType(m.type);
  const content = typeof m.content === "string" ? m.content : "";
  const createdAt =
    typeof m.createdAt === "number" && Number.isFinite(m.createdAt) ? m.createdAt : Date.now();

  let replyTo = m.replyTo;
  if (replyTo && typeof replyTo === "object") {
    replyTo = {
      id: typeof replyTo.id === "string" ? replyTo.id : "",
      content: typeof replyTo.content === "string" ? replyTo.content : "",
      type: coerceMessageType(replyTo.type),
    };
  } else {
    replyTo = undefined;
  }

  const status =
    m.status === "sent" || m.status === "delivered" || m.status === "read"
      ? m.status
      : undefined;

  return {
    ...m,
    type,
    content,
    createdAt,
    replyTo,
    parentMessageId:
      typeof m.parentMessageId === "string" ? m.parentMessageId : replyTo?.id,
    status,
    reactions: Array.isArray(m.reactions) ? m.reactions : undefined,
    viewOnceOpenedByUserIds: Array.isArray(m.viewOnceOpenedByUserIds)
      ? m.viewOnceOpenedByUserIds
      : undefined,
  };
}

/** يضمن وجود messages[] ورسائل صالحة قبل عرض المحادثة */
export function messageContent(m: { content?: unknown }): string {
  return typeof m.content === "string" ? m.content : "";
}

export function normalizeChatRecord(chat: Chat): Chat {
  const members = Array.isArray(chat.members)
    ? chat.members.filter((id): id is ID => typeof id === "string" && !!id)
    : [];

  const messages = (Array.isArray(chat.messages) ? chat.messages : [])
    .map(normalizeChatMessage)
    .filter((m): m is Message => m != null);

  return {
    ...chat,
    members,
    admins: Array.isArray(chat.admins) ? chat.admins : [],
    hosts: Array.isArray(chat.hosts) ? chat.hosts : undefined,
    messages,
    lastOpenAtByUser: chat.lastOpenAtByUser || {},
    lastReadMessageIdByUser: chat.lastReadMessageIdByUser || {},
    pinnedMessageIds: Array.isArray(chat.pinnedMessageIds) ? chat.pinnedMessageIds : [],
    hiddenMessageIdsByUser:
      chat.hiddenMessageIdsByUser && typeof chat.hiddenMessageIdsByUser === "object"
        ? chat.hiddenMessageIdsByUser
        : undefined,
  };
}
