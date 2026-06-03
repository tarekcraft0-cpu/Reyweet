import type { Message } from "../../../src/lib/types.js";
import { getMessageById, upsertMessage } from "../db/engine.js";
import { assertChatReadAccess, ChatAccessError } from "./chatAccess.js";
import { messageRowToClient } from "./chatMessages.js";
import { emitToUsers } from "./realtimeSocket.js";
import { broadcastSseToUser } from "./realtimeHub.js";

export async function setMessageReaction(opts: {
  userId: string;
  chatId: string;
  messageId: string;
  emoji: string;
}): Promise<{ ok: true; message: Message } | { ok: false; error: string; status: number }> {
  const emoji = opts.emoji.trim().slice(0, 16);
  if (!emoji) return { ok: false, error: "تفاعل غير صالح", status: 400 };

  try {
    await assertChatReadAccess(opts.userId, opts.chatId);
  } catch (e) {
    if (e instanceof ChatAccessError) return { ok: false, error: e.message, status: 403 };
    throw e;
  }

  const row = await getMessageById(opts.messageId);
  if (!row || row.chatId !== opts.chatId) {
    return { ok: false, error: "الرسالة غير موجودة", status: 404 };
  }

  const extras = { ...(row.extrasJson ?? {}) };
  const prev = Array.isArray(extras.reactions)
    ? (extras.reactions as { emoji: string; userId: string }[])
    : [];
  const mine = prev.find(r => r.userId === opts.userId);
  let next: typeof prev;
  if (mine && mine.emoji === emoji) {
    next = prev.filter(r => r.userId !== opts.userId);
  } else {
    next = [...prev.filter(r => r.userId !== opts.userId), { emoji, userId: opts.userId }];
  }
  if (next.length) extras.reactions = next;
  else delete extras.reactions;

  const updated = await upsertMessage({
    ...row,
    extrasJson: Object.keys(extras).length ? extras : undefined,
  });

  const client = messageRowToClient(updated);
  const targets = new Set<string>();
  if (row.receiverId) {
    targets.add(row.senderId);
    targets.add(row.receiverId);
  }
  const payload = {
    chatId: opts.chatId,
    messageId: opts.messageId,
    reactions: client.reactions,
  };
  for (const uid of targets) {
    broadcastSseToUser(uid, "message_reaction", payload);
  }
  emitToUsers([...targets], "message_reaction", payload);

  return { ok: true, message: client };
}
