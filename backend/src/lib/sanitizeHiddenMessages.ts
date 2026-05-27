import type { AppState, Chat } from "../../../src/lib/types.js";

/** يزيل «حذف عندك فقط» الفاسد الذي يخفي casi كل رسائل المحادثة (كاش قديم) */
export function sanitizeCorruptHiddenMessages(state: AppState, ownerId: string): AppState {
  if (!ownerId) return state;
  return {
    ...state,
    chats: (state.chats || []).map(c => sanitizeChatHidden(c, ownerId)),
  };
}

function sanitizeChatHidden(chat: Chat, ownerId: string): Chat {
  const msgs = chat.messages || [];
  const hidden = chat.hiddenMessageIdsByUser?.[ownerId];
  if (!hidden?.length || msgs.length === 0) return chat;

  const msgIds = new Set(msgs.map(m => m.id));
  const validHidden = hidden.filter(id => msgIds.has(id));

  // إخفاء ≥90% من الرسائل مع 5+ رسائل = كاش تالف
  if (validHidden.length >= Math.max(5, Math.ceil(msgs.length * 0.9))) {
    const rest = { ...(chat.hiddenMessageIdsByUser || {}) };
    delete rest[ownerId];
    return {
      ...chat,
      hiddenMessageIdsByUser: Object.keys(rest).length ? rest : undefined,
    };
  }

  if (validHidden.length === hidden.length) return chat;
  const rest = { ...(chat.hiddenMessageIdsByUser || {}) };
  if (validHidden.length) rest[ownerId] = validHidden;
  else delete rest[ownerId];
  return {
    ...chat,
    hiddenMessageIdsByUser: Object.keys(rest).length ? rest : undefined,
  };
}
