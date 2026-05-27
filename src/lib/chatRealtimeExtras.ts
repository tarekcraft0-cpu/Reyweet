import type { ID } from "./types";
import { apiBackendEnabled, getApiToken } from "./apiBackend";
import { apiPostChatTyping } from "./apiBackend";
import { getRealtimeSocket } from "./realtimeSocket";

const TYPING_STOP_MS = 2_000;
const REST_TYPING_MIN_MS = 1_200;
const typingStopTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastRestTypingPulseAt = new Map<string, number>();

function typingSessionKey(chatId: ID, peerId: ID | null): string {
  return `${chatId}\0${peerId ?? ""}`;
}

function emitChatTypingRest(chatId: ID, peerId: ID | null, active: boolean): void {
  if (!apiBackendEnabled()) return;
  const token = getApiToken();
  if (!token) return;
  const key = typingSessionKey(chatId, peerId);
  if (active) {
    const now = Date.now();
    const prev = lastRestTypingPulseAt.get(key) ?? 0;
    if (now - prev < REST_TYPING_MIN_MS) return;
    lastRestTypingPulseAt.set(key, now);
  } else {
    lastRestTypingPulseAt.delete(key);
  }
  void apiPostChatTyping(token, chatId, peerId, active);
}

export function emitChatTyping(chatId: ID, peerId: ID | null, active: boolean): void {
  const socket = getRealtimeSocket();
  if (socket?.connected) {
    socket.emit("typing", { chatId, peerId: peerId ?? undefined, active });
    return;
  }
  emitChatTypingRest(chatId, peerId, active);
}

/** إيقاف فوري — عند مسح النص أو مغادرة المحادثة */
export function flushTypingStop(chatId: ID, peerId: ID | null): void {
  const key = typingSessionKey(chatId, peerId);
  const t = typingStopTimers.get(key);
  if (t) {
    clearTimeout(t);
    typingStopTimers.delete(key);
  }
  emitChatTyping(chatId, peerId, false);
}

export function scheduleTypingPulse(chatId: ID, peerId: ID | null): void {
  const key = typingSessionKey(chatId, peerId);
  emitChatTyping(chatId, peerId, true);
  const prev = typingStopTimers.get(key);
  if (prev) clearTimeout(prev);
  typingStopTimers.set(
    key,
    setTimeout(() => {
      typingStopTimers.delete(key);
      emitChatTyping(chatId, peerId, false);
    }, TYPING_STOP_MS),
  );
}

export function clearAllTypingPulses(): void {
  for (const t of typingStopTimers.values()) clearTimeout(t);
  typingStopTimers.clear();
}

export function emitMessagesDelivered(chatId: ID, messageIds: ID[]): void {
  const socket = getRealtimeSocket();
  if (!socket?.connected || messageIds.length === 0) return;
  socket.emit("message:ack_delivered", { chatId, messageIds });
}

export function emitMessagesRead(chatId: ID, messageIds: ID[]): void {
  const socket = getRealtimeSocket();
  if (!socket?.connected || messageIds.length === 0) return;
  socket.emit("message:ack_read", { chatId, messageIds });
}
