import type { Message } from "firebase-admin/messaging";
import type { PushPlatform } from "../push/types.js";

export type FcmDataPayload = Record<string, string>;

function env(key: string): string {
  return (process.env[key] || "").trim();
}

export function fcmNotificationSound(): string {
  return env("FCM_NOTIFICATION_SOUND") || "default";
}

function apnsSoundValue(sound: string): string {
  if (!sound || sound === "default") return "default";
  return sound.endsWith(".caf") ? sound : `${sound}.caf`;
}

function androidSoundValue(sound: string): string {
  if (!sound || sound === "default") return "default";
  return sound.replace(/\.(mp3|caf)$/i, "");
}

export function stringifyFcmData(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

export function buildProductionFcmMessage(opts: {
  token: string;
  title: string;
  body: string;
  data?: FcmDataPayload;
  platform?: PushPlatform;
}): Message {
  const sound = fcmNotificationSound();
  const androidSound = androidSoundValue(sound);
  const data = stringifyFcmData({
    title: opts.title,
    body: opts.body,
    ...(opts.data ?? {}),
  });

  return {
    token: opts.token,
    notification: { title: opts.title, body: opts.body },
    data,
    android: {
      priority: "high",
      ttl: 86_400_000,
      notification: {
        channelId: "retweet_high",
        sound: androidSound,
        priority: "high",
        visibility: "public",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
      },
      payload: {
        aps: {
          alert: { title: opts.title, body: opts.body },
          sound: apnsSoundValue(sound),
          badge: 1,
          "content-available": 1,
          "mutable-content": 1,
        },
      },
    },
  };
}
