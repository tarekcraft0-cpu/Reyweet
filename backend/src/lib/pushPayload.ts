import type { PushPlatform } from "../push/types.js";

export type PushDataPayload = Record<string, string>;

function env(key: string): string {
  return (process.env[key] || "").trim();
}

export function pushNotificationSound(): string {
  return env("APNS_NOTIFICATION_SOUND") || "default";
}

function apnsSoundValue(sound: string): string {
  if (!sound || sound === "default") return "default";
  return sound.endsWith(".caf") ? sound : `${sound}.caf`;
}

export function stringifyPushData(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

/** حمولة APNs مباشرة من VPS → Apple (بدون Firebase) */
export function buildApnsPayload(opts: {
  title: string;
  body: string;
  data?: PushDataPayload;
  platform?: PushPlatform;
}): Record<string, unknown> {
  const sound = apnsSoundValue(pushNotificationSound());
  const data = stringifyPushData({
    title: opts.title,
    body: opts.body,
    ...(opts.data ?? {}),
  });

  const messageType = data.type || "CUSTOM";
  const threadId =
    messageType === "MESSAGE" && data.chatId
      ? `msg_${data.chatId}`.slice(0, 64)
      : messageType;

  return {
    aps: {
      alert: { title: opts.title, body: opts.body },
      sound,
      badge: 1,
      "content-available": 1,
      "mutable-content": 1,
      "thread-id": threadId,
    },
    ...data,
  };
}
