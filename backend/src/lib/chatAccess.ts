import type { Chat } from "../../../src/lib/types.js";
import { getSnapshot, listMessagesByChatId } from "../db/engine.js";
import { dmChatId } from "./dmChatId.js";
import { resolveReceiverId } from "./chatMessages.js";

export class ChatAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatAccessError";
  }
}

function isMember(chat: Chat, userId: string): boolean {
  return Array.isArray(chat.members) && chat.members.includes(userId);
}

/** محادثة من لقطة المستخدم أو استنتاجها من سجل الرسائل */
export async function resolveChatForUser(userId: string, chatId: string): Promise<Chat | null> {
  const snap = (await getSnapshot(userId)) as { chats?: Chat[] } | null;
  const fromSnap = snap?.chats?.find(c => c.id === chatId);
  if (fromSnap && isMember(fromSnap, userId)) return fromSnap;

  const rows = await listMessagesByChatId(chatId);
  if (rows.length === 0) return null;

  const members = new Set<string>();
  let userInvolved = false;
  let hasGroupRow = false;
  for (const row of rows) {
    if (row.senderId === userId || row.receiverId === userId) {
      userInvolved = true;
      members.add(row.senderId);
      if (row.receiverId) members.add(row.receiverId);
      else hasGroupRow = true;
    }
  }
  if (!userInvolved) return null;

  const memberList = [...members];
  if (!memberList.includes(userId)) return null;

  const isGroup = hasGroupRow || memberList.length > 2;
  return {
    id: chatId,
    isGroup,
    isChannel: false,
    members: memberList,
    admins: isGroup ? [] : [],
    messages: [],
    lastOpenAtByUser: {},
    lastReadMessageIdByUser: {},
  };
}

export async function assertChatReadAccess(userId: string, chatId: string): Promise<Chat> {
  let chat = await resolveChatForUser(userId, chatId);
  if (!chat && chatId.startsWith("dm:")) {
    const parts = chatId.slice(3).split(":");
    if (parts.length === 2) {
      const peer = parts[0] === userId ? parts[1] : parts[1] === userId ? parts[0] : null;
      if (peer) chat = await resolveChatForUser(userId, dmChatId(userId, peer));
    }
  }
  if (!chat) throw new ChatAccessError("غير مصرح بهذه المحادثة");
  return chat;
}

export async function assertMessageSendAccess(
  userId: string,
  input: { chatId: string; receiverId?: string | null },
): Promise<{ chat: Chat; receiverId: string | null }> {
  let chat =
    (await resolveChatForUser(userId, input.chatId)) ??
    (input.receiverId ? await resolveChatForUser(userId, dmChatId(userId, input.receiverId)) : null);
  if (!chat) throw new ChatAccessError("غير مصرح بهذه المحادثة");

  if (chat.isChannel && !(chat.hosts || []).includes(userId)) {
    throw new ChatAccessError("لا يمكنك الإرسال في هذه القناة");
  }

  if (!isMember(chat, userId)) {
    throw new ChatAccessError("أنت لست عضواً في هذه المحادثة");
  }

  const expectedReceiver =
    resolveReceiverId(chat, userId) ??
    (input.receiverId && !chat.isGroup && !chat.isChannel ? input.receiverId : null);
  if (
    input.receiverId != null &&
    expectedReceiver != null &&
    input.receiverId !== expectedReceiver
  ) {
    throw new ChatAccessError("مستقبل الرسالة لا يطابق المحادثة");
  }

  return { chat, receiverId: expectedReceiver };
}

/** فلترة رسائل الغرفة بحيث لا يرى المستخدم إلا ما يخص مشاركته */
export function filterMessagesForParticipant(
  userId: string,
  chat: Chat,
  rows: Awaited<ReturnType<typeof listMessagesByChatId>>,
) {
  const isGroup = chat.isGroup || chat.isChannel;
  return rows.filter(row => {
    if (isGroup) {
      return row.receiverId === null && isMember(chat, userId);
    }
    return row.senderId === userId || row.receiverId === userId;
  });
}
