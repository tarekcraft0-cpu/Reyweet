import crypto from "node:crypto";
import { z } from "zod";
import { upsertMessage, type MessageRow } from "../db/engine.js";
import { messageRowToClient, messageToRow } from "./chatMessages.js";
import { deliverIncomingDirectMessage } from "./messageDelivery.js";
import { deliverGroupMessageToMembers, notifyGroupMentions } from "./groupChatDelivery.js";
import { broadcastDirectMessageInstant, broadcastGroupMessageInstant } from "./messageRealtime.js";
import type { AppState } from "../../../src/lib/types.js";
import { getSnapshot } from "../db/engine.js";
import { assertMessageSendAccess, ChatAccessError } from "./chatAccess.js";
import { dmChatId } from "./dmChatId.js";

export const postMessageSchema = z.object({
  id: z.string().min(1).optional(),
  chatId: z.string().min(1),
  receiverId: z.string().nullable().optional(),
  type: z.string().min(1),
  content: z.string(),
  createdAt: z.number().optional(),
  durationSec: z.number().optional(),
  shareText: z.string().optional(),
  viewOnce: z.boolean().optional(),
  viewOnceOpenedByUserIds: z.array(z.string()).optional(),
  replyTo: z
    .object({
      id: z.string(),
      content: z.string(),
      type: z.string(),
    })
    .optional(),
  reactions: z.array(z.object({ emoji: z.string(), userId: z.string() })).optional(),
  forwardedFrom: z.object({ sourceChatLabel: z.string() }).optional(),
});

export type PostMessageInput = z.infer<typeof postMessageSchema>;

/** بث فوري ثم حفظ JSON في الخلفية — لا ينتظر القرص */
export async function ingestDirectMessage(senderId: string, d: PostMessageInput): Promise<MessageRow> {
  const { receiverId: enforcedReceiver } = await assertMessageSendAccess(senderId, d);
  if (d.reactions?.some(r => r.userId && r.userId !== senderId)) {
    throw new ChatAccessError("تفاعل غير مصرح");
  }
  const createdAtMs = d.createdAt ?? Date.now();
  const clientMsg = {
    id: d.id ?? crypto.randomUUID(),
    senderId,
    type: d.type,
    content: d.content,
    createdAt: createdAtMs,
    durationSec: d.durationSec,
    shareText: d.shareText,
    viewOnce: d.viewOnce,
    viewOnceOpenedByUserIds: d.viewOnceOpenedByUserIds,
    replyTo: d.replyTo,
    reactions: d.reactions,
    forwardedFrom: d.forwardedFrom,
  };
  const receiverId = enforcedReceiver ?? d.receiverId ?? null;
  const storageChatId =
    receiverId != null ? dmChatId(senderId, receiverId) : d.chatId;
  const row = messageToRow(
    storageChatId,
    clientMsg as import("../../../src/lib/types.js").Message,
    receiverId,
  );

  if (row.receiverId) {
    broadcastDirectMessageInstant(row, {
      members: [senderId, row.receiverId],
    });
  } else {
    void (async () => {
      const snap = (await getSnapshot(senderId)) as AppState | null;
      const chat = snap?.chats?.find(c => c.id === row.chatId && (c.isGroup || c.isChannel));
      if (!chat?.members?.length) return;
      broadcastGroupMessageInstant(row, chat.members, senderId);
      await deliverGroupMessageToMembers(row, chat.members, senderId).catch(e => {
        // eslint-disable-next-line no-console
        console.warn("[messages] group snapshot persist failed", e);
      });
      if (row.type === "text" && row.content) {
        void notifyGroupMentions(row, chat.members, senderId, row.content).catch(() => undefined);
      }
    })();
  }

  void upsertMessage(row).catch(e => {
    // eslint-disable-next-line no-console
    console.warn("[messages] disk upsert failed", e);
  });

  if (row.receiverId) {
    void deliverIncomingDirectMessage(row).catch(e => {
      // eslint-disable-next-line no-console
      console.warn("[messages] snapshot persist failed", e);
    });
  }

  return row;
}

export function clientMessageFromRow(row: MessageRow) {
  return messageRowToClient(row);
}
