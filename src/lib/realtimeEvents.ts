import { ACCOUNT_SWITCHED_EVENT } from "./accountSessions";
import { apiBackendEnabled, ensureApiRuntimeConfig, getApiBaseUrl, getApiToken } from "./apiBackend";
import { connectRealtimeSocket, disconnectRealtimeSocketHard } from "./realtimeSocket";

const RECENT_EVENT_TTL_MS = 4_000;
const recentEvents = new Map<string, number>();

function dedupeEvent(eventName: string, data: unknown): boolean {
  if (eventName !== "message_new" && eventName !== "post_update" && eventName !== "sync_hint") {
    return false;
  }
  let key = eventName;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.id === "string") key += `:${d.id}`;
    else if (typeof d.chatId === "string" && d.message && typeof d.message === "object") {
      const m = d.message as { id?: string };
      key += `:${d.chatId}:${m.id ?? ""}`;
    } else if (typeof d.postId === "string") key += `:${d.postId}`;
    else key += `:${JSON.stringify(d).slice(0, 120)}`;
  }
  const now = Date.now();
  for (const [k, t] of recentEvents) {
    if (now - t > RECENT_EVENT_TTL_MS) recentEvents.delete(k);
  }
  const prev = recentEvents.get(key);
  if (prev != null && now - prev < RECENT_EVENT_TTL_MS) return true;
  recentEvents.set(key, now);
  return false;
}

export type UserRegisteredEvent = {
  user: {
    id: string;
    username: string;
    avatar: string;
    bio?: string;
    verified?: boolean;
    founderVerified?: boolean;
    founderOfficialLabel?: string;
  };
};

export type MessageNewEvent = {
  chatId: string;
  message: {
    id: string;
    senderId: string;
    type: string;
    content: string;
    createdAt: number;
  };
  request?: boolean;
  members?: string[];
  senderId?: string;
};

const RECONNECT_MS = 5000;
const SSE_FALLBACK_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** SSE احتياطي عند فشل WebSocket */
function subscribeSseFallback(onEvent: (eventName: string, data: unknown) => void): () => void {
  const ac = new AbortController();
  let aborted = false;

  void (async () => {
    while (!aborted) {
      try {
        await ensureApiRuntimeConfig();
        const base = getApiBaseUrl().replace(/\/$/, "");
        const path = `/v1/events?_=${Date.now()}`;
        const url = base ? `${base}${path}` : path;
        const token = getApiToken();
        if (!token) break;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          cache: "no-store",
          mode: "cors",
          credentials: "omit",
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          await sleep(RECONNECT_MS);
          continue;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() || "";
          for (const block of chunks) {
            if (!block.trim() || block.trimStart().startsWith(":")) continue;
            let eventName = "message";
            let dataLine = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
            }
            if (!dataLine) continue;
            try {
              onEvent(eventName, JSON.parse(dataLine));
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* reconnect */
      }
      if (!aborted) await sleep(RECONNECT_MS);
    }
  })();

  return () => {
    aborted = true;
    ac.abort();
  };
}

function connectRealtimeTransport(
  onEvent: (eventName: string, data: unknown) => void,
): () => void {
  if (typeof window === "undefined" || !apiBackendEnabled()) return () => {};
  if (!getApiToken()) return () => {};

  const dispatch = (eventName: string, data: unknown) => {
    if (dedupeEvent(eventName, data)) return;
    onEvent(eventName, data);
  };

  let socketCleanup: (() => void) | null = null;
  let sseCleanup: (() => void) | null = null;
  let socketConnected = false;
  let stopped = false;

  const stopSse = () => {
    sseCleanup?.();
    sseCleanup = null;
  };

  const startSse = () => {
    if (stopped || sseCleanup || socketConnected) return;
    sseCleanup = subscribeSseFallback(dispatch);
  };

  const fallbackTimer = window.setTimeout(startSse, SSE_FALLBACK_MS);

  void connectRealtimeSocket(dispatch, {
    onConnect: () => {
      socketConnected = true;
      window.clearTimeout(fallbackTimer);
      stopSse();
    },
    onConnectError: () => {
      if (!socketConnected && !stopped) startSse();
    },
  }).then(cleanup => {
    if (stopped) {
      cleanup();
      return;
    }
    socketCleanup = cleanup;
  });

  return () => {
    stopped = true;
    window.clearTimeout(fallbackTimer);
    socketCleanup?.();
    stopSse();
  };
}

/** WebSocket أولاً؛ SSE فقط إذا لم يتصل الـ Socket — يُعاد الربط عند تبديل الحساب */
export function subscribeRealtimeEvents(
  onEvent: (eventName: string, data: unknown) => void,
): () => void {
  if (typeof window === "undefined" || !apiBackendEnabled()) return () => {};

  let activeCleanup = connectRealtimeTransport(onEvent);
  const onSwitch = () => {
    disconnectRealtimeSocketHard();
    activeCleanup();
    activeCleanup = connectRealtimeTransport(onEvent);
  };
  window.addEventListener(ACCOUNT_SWITCHED_EVENT, onSwitch);

  return () => {
    window.removeEventListener(ACCOUNT_SWITCHED_EVENT, onSwitch);
    activeCleanup();
  };
}

export const USER_REGISTERED_WINDOW_EVENT = "retweet-user-registered";
