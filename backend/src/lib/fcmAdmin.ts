import { getUserById } from "../db/engine.js";
import { listPushTokensForUser, removePushTokens, type PushTokenRow } from "../db/pushTokens.js";

export type FcmDataPayload = Record<string, string>;

function env(key: string): string {
  return (process.env[key] || "").trim();
}

export function isFcmConfigured(): boolean {
  if (env("FIREBASE_SERVICE_ACCOUNT_JSON")) return true;
  return !!(env("FIREBASE_PROJECT_ID") && env("FIREBASE_CLIENT_EMAIL") && env("FIREBASE_PRIVATE_KEY"));
}

function serviceAccountFromEnv(): Record<string, string> | null {
  const json = env("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, string>;
      return parsed;
    } catch {
      return null;
    }
  }
  const projectId = env("FIREBASE_PROJECT_ID");
  const clientEmail = env("FIREBASE_CLIENT_EMAIL");
  let privateKey = env("FIREBASE_PRIVATE_KEY");
  if (!projectId || !clientEmail || !privateKey) return null;
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}

type Messaging = import("firebase-admin/messaging").Messaging;

let messagingPromise: Promise<Messaging | null> | null = null;

async function getMessaging(): Promise<Messaging | null> {
  if (!isFcmConfigured()) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const sa = serviceAccountFromEnv();
      if (!sa) return null;
      const { cert, getApps, initializeApp } = await import("firebase-admin/app");
      const { getMessaging } = await import("firebase-admin/messaging");
      const existing = getApps()[0];
      const app =
        existing ??
        initializeApp({
          credential: cert(sa as Parameters<typeof cert>[0]),
        });
      return getMessaging(app);
    })().catch(e => {
      console.warn("[fcm] init failed", e);
      return null;
    });
  }
  return messagingPromise;
}

async function sendToToken(
  messaging: Messaging,
  row: PushTokenRow,
  title: string,
  body: string,
  data: FcmDataPayload,
): Promise<boolean> {
  try {
    await messaging.send({
      token: row.token,
      notification: { title, body },
      data,
      android: {
        priority: "high",
        notification: { channelId: "retweet_messages", sound: "default" },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });
    return true;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      await removePushTokens([row.token]);
    }
    console.warn("[fcm] send failed", code || e);
    return false;
  }
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: FcmDataPayload = {},
): Promise<{ sent: number; failed: number }> {
  const messaging = await getMessaging();
  if (!messaging) return { sent: 0, failed: 0 };

  const rows = await listPushTokensForUser(userId);
  if (!rows.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const ok = await sendToToken(messaging, row, title, body, data);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

export async function sendNewChatMessagePush(opts: {
  recipientUserId: string;
  senderUserId: string;
  chatId: string;
  preview: string;
  isGroup?: boolean;
  groupName?: string;
}): Promise<void> {
  if (!opts.recipientUserId || opts.recipientUserId === opts.senderUserId) return;
  const sender = await getUserById(opts.senderUserId);
  const senderLabel =
    sender?.displayName?.trim() || sender?.username?.trim() || "مستخدم";
  const title =
    opts.isGroup && opts.groupName?.trim()
      ? `${opts.groupName.trim()}`
      : senderLabel;
  const body = opts.preview.trim() || "رسالة جديدة";
  void sendPushToUser(opts.recipientUserId, title, body, {
    type: "message",
    chatId: opts.chatId,
    senderId: opts.senderUserId,
  }).catch(e => console.warn("[fcm] message push failed", e));
}
