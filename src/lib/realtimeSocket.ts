import { io, type Socket } from "socket.io-client";
import type { ID, Message } from "./types";
import { ensureApiTokenMatchesUser } from "./accountSessions";
import { apiBackendEnabled, ensureApiRuntimeConfig, getApiBaseUrl, getApiToken } from "./apiBackend";
import { bindCallSocket } from "./webrtcCall";
import { resolveIceServers } from "./iceServers";
import { CLIENT_REALTIME_SOCKET_PATH } from "./realtimeSocketPath";
import { clearAllTypingPulses } from "./chatRealtimeExtras";

let socket: Socket | null = null;
let connectGen = 0;
/** توكن الاتصال الحالي — يُرفض الإرسال إن اختلف عن getApiToken() */
let socketAuthToken: string | null = null;

/** قطع فوري عند تبديل الحساب — قبل تغيير JWT (يمنع إرسال برسالة الحساب السابق) */
export function disconnectRealtimeSocketHard(): void {
  connectGen += 1;
  socketAuthToken = null;
  clearAllTypingPulses();
  bindCallSocket(null);
  const s = socket;
  socket = null;
  if (!s) return;
  try {
    s.io.opts.reconnection = false;
  } catch {
    /* ignore */
  }
  s.removeAllListeners();
  s.disconnect();
}

function resolveSocketUrl(base: string): string {
  if (base) return base;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function isRealtimeSocketConnected(): boolean {
  return Boolean(socket?.connected);
}

/** انتظر اتصال Socket — ينتظر إنشاء الاتصال إن لم يُنشأ بعد (مثلاً قبل اكتمال subscribeRealtimeEvents) */
export function waitForRealtimeSocket(maxMs = 8000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (socket?.connected) return Promise.resolve(true);

  const deadline = Date.now() + maxMs;
  let connectListener: (() => void) | null = null;

  const cleanup = () => {
    if (connectListener && socket) socket.off("connect", connectListener);
    connectListener = null;
  };

  return new Promise(resolve => {
    const tick = () => {
      if (socket?.connected) {
        cleanup();
        resolve(true);
        return;
      }
      const s = socket;
      if (s && !connectListener) {
        connectListener = () => {
          cleanup();
          resolve(true);
        };
        s.on("connect", connectListener);
      }
      if (Date.now() >= deadline) {
        cleanup();
        resolve(false);
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  });
}

/** WebSocket فقط — بدون polling البطيء */
export async function connectRealtimeSocket(
  onEvent: (event: string, data: unknown) => void,
  hooks?: { onConnect?: () => void; onConnectError?: () => void },
): Promise<() => void> {
  if (typeof window === "undefined" || !apiBackendEnabled()) return () => {};
  const token = getApiToken();
  if (!token) return () => {};

  await ensureApiRuntimeConfig();
  const url = resolveSocketUrl(getApiBaseUrl().replace(/\/$/, ""));
  if (!url) return () => {};

  const gen = ++connectGen;

  disconnectRealtimeSocketHard();

  const tokenAtConnect = token;
  const s = io(url, {
    path: CLIENT_REALTIME_SOCKET_PATH,
    addTrailingSlash: false,
    transports: ["polling", "websocket"],
    upgrade: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 12,
    reconnectionDelay: 400,
    reconnectionDelayMax: 2500,
    timeout: 8_000,
  });
  socket = s;
  socketAuthToken = tokenAtConnect;

  const forward =
    (event: string) =>
    (data: unknown) => {
      onEvent(event, data);
    };

  s.on("message_new", forward("message_new"));
  s.on("social_update", forward("social_update"));
  s.on("social_graph_update", forward("social_graph_update"));
  s.on("sync_hint", forward("sync_hint"));
  s.on("post_update", forward("post_update"));
  s.on("user_registered", forward("user_registered"));
  s.on("user_profile_updated", forward("user_profile_updated"));
  s.on("group_invite", forward("group_invite"));
  s.on("call:signal", forward("call:signal"));
  s.on("call:ring", forward("call:ring"));
  s.on("call:accept", forward("call:accept"));
  s.on("typing", forward("typing"));
  s.on("message_status", forward("message_status"));
  s.on("pool:state_update", forward("pool:state_update"));
  s.on("pool:room_created", forward("pool:room_created"));

  s.on("connect", () => {
    if (gen !== connectGen) return;
    bindCallSocket(s);
    void resolveIceServers().catch(() => {});
    hooks?.onConnect?.();
  });
  s.on("connect_error", () => {
    if (gen !== connectGen) return;
    hooks?.onConnectError?.();
  });

  return () => {
    if (gen !== connectGen) return;
    s.removeAllListeners();
    s.disconnect();
    if (socket === s) {
      socket = null;
      socketAuthToken = null;
    }
    bindCallSocket(null);
  };
}

export type DirectMessageEmitBody = {
  id: string;
  chatId: ID;
  receiverId: ID | null;
  type: string;
  content: string;
  createdAt: number;
  durationSec?: number;
  shareText?: string;
  viewOnce?: boolean;
  viewOnceOpenedByUserIds?: string[];
  replyTo?: { id: string; content: string; type: string };
  parentMessageId?: string;
  status?: "sent" | "delivered" | "read";
  reactions?: { emoji: string; userId: string }[];
  forwardedFrom?: { sourceChatLabel: string };
};

/** إرسال عبر Socket — يبث السيرفر فوراً قبل حفظ JSON */
export function getRealtimeSocket(): Socket | null {
  return socket;
}

export async function emitDirectMessage(body: DirectMessageEmitBody, senderId: ID): Promise<boolean> {
  const activeToken = ensureApiTokenMatchesUser(senderId);
  if (!activeToken || activeToken !== socketAuthToken) return false;
  if (!socket?.connected) {
    const ready = await waitForRealtimeSocket(1800);
    if (!ready || !socket?.connected) return false;
  }
  return new Promise(resolve => {
    const s = socket;
    if (!s?.connected) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => resolve(false), 2800);
    s.emit("message:send", body, (ack?: { ok?: boolean }) => {
      window.clearTimeout(timer);
      resolve(Boolean(ack?.ok));
    });
  });
}
