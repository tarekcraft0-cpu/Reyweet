import type { AppState } from "../../../src/lib/types.js";

/** حدّ الرسائل في كل محادثة عند إرسال app-state للعميل — الرسائل الأقدم تُجلب لاحقاً عبر pagination */
const CHAT_MESSAGE_CAP = 80;

export function trimAppStateForDelivery(state: AppState): AppState {
  const chats = (state.chats ?? []).map(chat => {
    const messages = [...(chat.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
    if (messages.length <= CHAT_MESSAGE_CAP) return chat;
    return { ...chat, messages: messages.slice(-CHAT_MESSAGE_CAP) };
  });

  /** المنشورات تُجلب عبر /v1/feed/posts — مصدر واحد يمنع الازدواجية */
  return { ...state, posts: [], chats };
}
