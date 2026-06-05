import type { AppState, Chat, Message } from "../../../src/lib/types.js";
import { getBannedUserIdSet } from "./bannedUserCache.js";

export const BANNED_ACCOUNT_NOTICE_PREFIX = "ban-notice-";

export function isBannedAccountNoticeMessage(m: Pick<Message, "id">): boolean {
  return typeof m.id === "string" && m.id.startsWith(BANNED_ACCOUNT_NOTICE_PREFIX);
}

export function buildBannedAccountNoticeMessage(peerId: string, at?: number): Message {
  return {
    id: `${BANNED_ACCOUNT_NOTICE_PREFIX}${peerId}`,
    senderId: peerId,
    type: "text",
    content: "تم حظر هذا الحساب. الرسائل السابقة مخفية حتى يُرفع الحظر.",
    createdAt: at ?? Date.now(),
  };
}

/** DM: يخفي رسائل المحظور ويضع تنبيهاً واحداً */
export function maskChatForBannedPeer(
  chat: Chat,
  ownerId: string,
  bannedIds: Set<string>,
): Chat {
  if (chat.isGroup || chat.isChannel) {
    const messages = (chat.messages || []).filter(m => !bannedIds.has(m.senderId));
    return { ...chat, messages };
  }
  const peer = (chat.members || []).find(id => id !== ownerId);
  if (!peer || !bannedIds.has(peer)) return chat;

  const all = chat.messages || [];
  const peerMsgs = all.filter(m => m.senderId === peer);
  const own = all.filter(
    m => m.senderId === ownerId && !isBannedAccountNoticeMessage(m),
  );
  const lastPeerAt = peerMsgs.length
    ? Math.max(...peerMsgs.map(m => m.createdAt ?? 0))
    : Date.now();
  const notice = buildBannedAccountNoticeMessage(peer, lastPeerAt);
  const merged = [...own, notice].sort((a, b) => a.createdAt - b.createdAt);
  return { ...chat, messages: merged };
}

export async function filterBannedContentFromAppState(
  state: AppState,
  ownerId: string,
): Promise<AppState> {
  const bannedIds = await getBannedUserIdSet();
  if (!bannedIds.size) return state;

  const posts = (state.posts || []).filter(p => !bannedIds.has(p.userId));
  const stories = (state.stories || []).filter(s => !bannedIds.has(s.userId));
  const chats = (state.chats || []).map(c => maskChatForBannedPeer(c, ownerId, bannedIds));

  return { ...state, posts, stories, chats };
}

export async function listBannedUserIds(): Promise<string[]> {
  const set = await getBannedUserIdSet();
  return [...set];
}
