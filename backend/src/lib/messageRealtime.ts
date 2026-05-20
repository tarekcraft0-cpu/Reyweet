import type { MessageRow } from "../db/engine.js";
import { messageRowToClient } from "./chatMessages.js";
import { broadcastSseToUser } from "./realtimeHub.js";
import { emitToUsers } from "./realtimeSocket.js";

export type DirectMessageBroadcast = {
  chatId: string;
  message: ReturnType<typeof messageRowToClient>;
  request?: boolean;
  members?: string[];
  senderId: string;
};

export function buildDirectMessagePayload(
  row: MessageRow,
  extras?: { request?: boolean; members?: string[] },
): DirectMessageBroadcast {
  return {
    chatId: row.chatId,
    message: messageRowToClient(row),
    request: extras?.request,
    members: extras?.members ?? (row.receiverId ? [row.senderId, row.receiverId] : undefined),
    senderId: row.senderId,
  };
}

/** بث فوري — WebSocket + SSE — قبل أي كتابة ثقيلة على القرص */
export function broadcastDirectMessageInstant(
  row: MessageRow,
  extras?: { request?: boolean; members?: string[] },
): DirectMessageBroadcast {
  const payload = buildDirectMessagePayload(row, extras);
  const targets = new Set<string>([row.senderId]);
  if (row.receiverId) targets.add(row.receiverId);
  for (const uid of targets) {
    broadcastSseToUser(uid, "message_new", payload);
  }
  emitToUsers([...targets], "message_new", payload);
  return payload;
}

export function broadcastGroupMessageInstant(
  row: MessageRow,
  members: string[],
  senderId: string,
): void {
  const payload = {
    ...buildDirectMessagePayload(row, { members }),
    isGroup: true,
    senderId,
  };
  for (const uid of members) {
    broadcastSseToUser(uid, "message_new", payload);
  }
  emitToUsers(members, "message_new", payload);
}
