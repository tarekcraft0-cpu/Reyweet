/** توجيه النقر على إشعار الدفع داخل التطبيق */

export type PushDeepLinkPayload = {
  type?: string;
  chatId?: string;
  chat_id?: string;
  fromId?: string;
  postId?: string;
  storyId?: string;
  userId?: string;
};

function normType(raw?: string): string {
  return (raw || "").trim().toUpperCase();
}

export function routePushNotificationTap(data?: PushDeepLinkPayload | null): void {
  if (!data || typeof window === "undefined") return;

  const type = normType(data.type);
  const chatId =
    typeof data.chatId === "string"
      ? data.chatId
      : typeof data.chat_id === "string"
        ? data.chat_id
        : "";

  if (type === "CALL" && chatId) {
    window.dispatchEvent(new CustomEvent("retweet-open-chat", { detail: { chatId } }));
    return;
  }

  if (type === "MESSAGE" || chatId) {
    if (chatId) {
      window.dispatchEvent(new CustomEvent("retweet-open-chat", { detail: { chatId } }));
    }
    return;
  }

  if (type === "FOLLOW" || type === "FOLLOW_REQUEST" || type === "MENTION") {
    const profileId = typeof data.fromId === "string" ? data.fromId : "";
    if (profileId) {
      window.dispatchEvent(new CustomEvent("retweet-open-profile", { detail: { userId: profileId } }));
      return;
    }
  }

  if ((type === "LIKE" || type === "COMMENT" || type === "REPOST") && data.postId) {
    window.dispatchEvent(
      new CustomEvent("retweet-open-post-id", { detail: { postId: data.postId, fromUserId: data.fromId } }),
    );
    return;
  }

  window.dispatchEvent(new CustomEvent("retweet-open-notifications"));
}
