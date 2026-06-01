import type { Notification } from "../../../src/lib/types.js";
import { getUserById } from "../db/engine.js";

export type PushPresentation = {
  title: string;
  body: string;
  data: Record<string, string>;
};

function actorLabel(username: string | undefined, displayName?: string): string {
  const dn = displayName?.trim();
  if (dn) return dn;
  const u = username?.trim();
  return u ? `@${u}` : "مستخدم";
}

/** عنوان + نص إشعار FCM بأسلوب Instagram من صف الإشعار الداخلي */
export async function buildPushFromNotification(
  notif: Pick<
    Notification,
    "type" | "fromId" | "userId" | "text" | "postId" | "chatId" | "storyId" | "followRequestStatus"
  >,
): Promise<PushPresentation> {
  const actor = await getUserById(notif.fromId);
  const name = actorLabel(actor?.username, actor?.displayName);

  const data: Record<string, string> = {
    type: notif.type.toUpperCase(),
    fromId: notif.fromId,
    userId: notif.userId,
  };
  if (notif.postId) data.postId = notif.postId;
  if (notif.chatId) data.chatId = notif.chatId;
  if (notif.storyId) data.storyId = notif.storyId;

  switch (notif.type) {
    case "like":
      return {
        title: name,
        body: notif.text?.trim() || "أعجب بمنشورك",
        data: { ...data, type: "LIKE" },
      };
    case "comment":
      return {
        title: name,
        body: notif.text?.trim() || "علّق على منشورك",
        data: { ...data, type: "COMMENT" },
      };
    case "repost":
      return {
        title: name,
        body: notif.text?.trim() || "أعاد نشر منشورك",
        data: { ...data, type: "REPOST" },
      };
    case "follow":
      return {
        title: name,
        body: notif.text?.trim() || "بدأ بمتابعتك",
        data: { ...data, type: "FOLLOW" },
      };
    case "friend_request":
      return {
        title: name,
        body:
          notif.followRequestStatus === "accepted"
            ? notif.text?.trim() || "قبل طلب المتابعة"
            : notif.text?.trim() || "أرسل لك طلب متابعة",
        data: { ...data, type: "FOLLOW_REQUEST" },
      };
    case "mention":
      return {
        title: name,
        body: notif.text?.trim() || "أشار إليك",
        data: { ...data, type: "MENTION" },
      };
    case "message":
      return {
        title: name,
        body: notif.text?.trim() || "رسالة جديدة",
        data: { ...data, type: "MESSAGE" },
      };
    case "report_update":
      return {
        title: "Retweet",
        body: notif.text?.trim() || "تحديث على بلاغك",
        data: { ...data, type: "REPORT_UPDATE" },
      };
    default:
      return {
        title: "Retweet",
        body: notif.text?.trim() || "إشعار جديد",
        data: { ...data, type: "GENERIC" },
      };
  }
}
