import { routePushNotificationTap, type PushDeepLinkPayload } from "./pushDeepLink";

const STORAGE_KEY = "retweet_pending_push_tap_v1";

let memory: PushDeepLinkPayload | null = null;

function readStored(): PushDeepLinkPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PushDeepLinkPayload;
  } catch {
    return null;
  }
}

function writeStored(data: PushDeepLinkPayload | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!data) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

/** يحفظ نقرة إشعار حتى يكتمل تسجيل الدخول / تحميل التطبيق (فتح من الخلفية أو مغلق) */
export function stashPendingPushTap(data?: PushDeepLinkPayload | null): void {
  if (!data || typeof window === "undefined") return;
  const payload: PushDeepLinkPayload = {
    type: data.type,
    chatId: data.chatId || data.chat_id,
    chat_id: data.chat_id || data.chatId,
    fromId: data.fromId,
    postId: data.postId,
    storyId: data.storyId,
    userId: data.userId,
  };
  memory = payload;
  writeStored(payload);
}

export function consumePendingPushTap(): boolean {
  const payload = memory ?? readStored();
  if (!payload) return false;
  memory = null;
  writeStored(null);
  routePushNotificationTap(payload);
  return true;
}
