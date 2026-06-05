import type { AppState } from "../../../src/lib/types.js";

/** حدّ الرسائل في كل محادثة عند إرسال app-state للعميل — الرسائل الأقدم تُجلب لاحقاً عبر pagination */
const CHAT_MESSAGE_CAP = 80;
/** حدّ المنشورات في اللقطة الأولى — الخلاصة تُكمّل عبر /v1/feed/posts */
const POST_CAP = 200;

export function trimAppStateForDelivery(state: AppState): AppState {
  const posts = [...(state.posts ?? [])]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, POST_CAP);

  const chats = (state.chats ?? []).map(chat => {
    const messages = [...(chat.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt);
    if (messages.length <= CHAT_MESSAGE_CAP) return chat;
    return { ...chat, messages: messages.slice(-CHAT_MESSAGE_CAP) };
  });

  return { ...state, posts, chats };
}
