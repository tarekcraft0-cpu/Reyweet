import type { MessageRow } from "../db/engine.js";
import { listMessagesByChatId, upsertMessage } from "../db/engine.js";
import { messageRowToClient } from "./chatMessages.js";
import { emitToUser } from "./realtimeSocket.js";

export type DeliveryStatus = "sent" | "delivered" | "read";

const STATUS_ORDER: Record<DeliveryStatus, number> = {
  sent: 0,
  delivered: 1,
  read: 2,
};

function readStatus(row: MessageRow): DeliveryStatus {
  const s = row.extrasJson?.status;
  if (s === "delivered" || s === "read") return s;
  return "sent";
}

function canPromote(current: DeliveryStatus, next: DeliveryStatus): boolean {
  return STATUS_ORDER[next] > STATUS_ORDER[current];
}

async function promoteMessageStatus(
  messageId: string,
  chatId: string,
  next: DeliveryStatus,
): Promise<MessageRow | null> {
  const rows = await listMessagesByChatId(chatId);
  const row = rows.find(r => r.id === messageId);
  if (!row) return null;
  const current = readStatus(row);
  if (!canPromote(current, next)) return row;
  const updated: MessageRow = {
    ...row,
    extrasJson: { ...(row.extrasJson ?? {}), status: next },
  };
  await upsertMessage(updated);
  return updated;
}

export function clientMessageWithStatus(row: MessageRow) {
  const msg = messageRowToClient(row);
  const status = readStatus(row);
  return { ...msg, status, parentMessageId: row.extrasJson?.parentMessageId as string | undefined };
}

export async function markMessagesDelivered(
  recipientId: string,
  chatId: string,
  messageIds: string[],
): Promise<void> {
  const unique = [...new Set(messageIds.filter(Boolean))];
  if (unique.length === 0) return;
  const bySender = new Map<string, string[]>();
  for (const id of unique) {
    const row = await promoteMessageStatus(id, chatId, "delivered");
    if (!row?.senderId || row.senderId === recipientId) continue;
    const list = bySender.get(row.senderId) ?? [];
    list.push(id);
    bySender.set(row.senderId, list);
  }
  for (const [senderId, ids] of bySender) {
    emitToUser(senderId, "message_status", {
      chatId,
      messageIds: ids,
      status: "delivered" as const,
    });
  }
}

export async function markMessagesRead(
  readerId: string,
  chatId: string,
  messageIds: string[],
): Promise<void> {
  const unique = [...new Set(messageIds.filter(Boolean))];
  if (unique.length === 0) return;
  const bySender = new Map<string, string[]>();
  for (const id of unique) {
    const row = await promoteMessageStatus(id, chatId, "read");
    if (!row?.senderId || row.senderId === readerId) continue;
    const list = bySender.get(row.senderId) ?? [];
    list.push(id);
    bySender.set(row.senderId, list);
  }
  for (const [senderId, ids] of bySender) {
    emitToUser(senderId, "message_status", {
      chatId,
      messageIds: ids,
      status: "read" as const,
    });
  }
}

export function defaultSentExtras(
  extras?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...extras, status: "sent" satisfies DeliveryStatus };
}
