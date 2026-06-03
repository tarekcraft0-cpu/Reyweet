/**
 * إرسال إشعارات الدفع من VPS — APNs (iOS) + FCM (Android اختياري).
 */
import type { Notification } from "../../../src/lib/types.js";
import { getUserById } from "../db/engine.js";
import {
  listPushTokensForUser,
  removePushTokens,
  type PushTokenRow,
} from "../db/pushTokens.js";
import { buildPushFromNotification } from "./pushPresentation.js";
import { isApnsConfigured, sendApnsToDevice } from "./apnsSend.js";
import { isFcmAndroidConfigured, sendFcmToDevice } from "./fcmAndroid.js";
import type { PushDataPayload } from "./pushPayload.js";

export { isApnsConfigured };

export function isPushConfigured(): boolean {
  return isApnsConfigured() || isFcmAndroidConfigured();
}

/** @deprecated */
export function isFcmConfigured(): boolean {
  return isPushConfigured();
}

export type FcmDataPayload = PushDataPayload;

async function sendToToken(
  row: PushTokenRow,
  title: string,
  body: string,
  data: PushDataPayload,
): Promise<boolean> {
  const dataStr: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v != null) dataStr[k] = String(v);
  }

  if (row.platform === "ios") {
    const r = await sendApnsToDevice(row.token, title, body, data);
    if (r.unregistered) await removePushTokens([row.token]);
    return r.ok;
  }

  if (row.platform === "android") {
    const r = await sendFcmToDevice(row.token, title, body, dataStr);
    if (r.unregistered) await removePushTokens([row.token]);
    return r.ok;
  }

  return false;
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: PushDataPayload = {},
): Promise<{ sent: number; failed: number; noTokens: boolean }> {
  if (!isPushConfigured()) return { sent: 0, failed: 0, noTokens: false };

  const { getNotificationPrefsForUser, shouldSendPushType } = await import(
    "../push/notificationPrefs.js"
  );
  const prefs = await getNotificationPrefsForUser(userId);
  const pushType = data.type || "CUSTOM";
  if (!shouldSendPushType(prefs, pushType)) {
    return { sent: 0, failed: 0, noTokens: false };
  }

  const rows = await listPushTokensForUser(userId);
  const pushRows = rows.filter(r => r.platform === "ios" || r.platform === "android");
  if (!pushRows.length) return { sent: 0, failed: 0, noTokens: true };

  let sent = 0;
  let failed = 0;
  for (const row of pushRows) {
    const ok = await sendToToken(row, title, body, data);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed, noTokens: false };
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
    type: "MESSAGE",
    chatId: opts.chatId,
    senderId: opts.senderUserId,
  }).catch(e => console.warn("[push] message push failed", e));
}

export async function sendIncomingCallPush(opts: {
  recipientUserId: string;
  callerUserId: string;
  chatId: string;
  video?: boolean;
}): Promise<void> {
  if (!opts.recipientUserId || opts.recipientUserId === opts.callerUserId) return;
  const caller = await getUserById(opts.callerUserId);
  const name = caller?.displayName?.trim() || caller?.username?.trim() || "مكالمة";
  void sendPushToUser(
    opts.recipientUserId,
    opts.video ? "مكالمة فيديو" : "مكالمة صوتية",
    name,
    {
      type: "CALL",
      chatId: opts.chatId,
      senderId: opts.callerUserId,
    },
  ).catch(e => console.warn("[push] call push failed", e));
}

export async function sendInAppNotificationPush(
  notif: Pick<
    Notification,
    | "type"
    | "fromId"
    | "userId"
    | "text"
    | "postId"
    | "chatId"
    | "storyId"
    | "followRequestStatus"
  >,
): Promise<void> {
  if (!notif.userId || notif.userId === notif.fromId) return;
  const { title, body, data } = await buildPushFromNotification(notif);
  void sendPushToUser(notif.userId, title, body, data).catch(e =>
    console.warn("[push] social push failed", e),
  );
}
