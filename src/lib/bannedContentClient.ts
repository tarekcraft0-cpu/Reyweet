import type { AppState, Chat, Message, Post } from "./types";

export const BANNED_ACCOUNT_NOTICE_PREFIX = "ban-notice-";
const BANNED_IDS_STORAGE_KEY = "retweet_banned_user_ids_v1";

let bannedUserIdsCache = new Set<string>();
let bannedIdsRevision = 0;

export function hydrateBannedUserIdsFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(BANNED_IDS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return;
    syncBannedUserIds(parsed.filter((x): x is string => typeof x === "string"), {
      persist: false,
    });
  } catch {
    /* ignore */
  }
}

export function syncBannedUserIds(
  ids: string[],
  opts?: { persist?: boolean },
): void {
  bannedUserIdsCache = new Set(ids.filter(Boolean));
  bannedIdsRevision += 1;
  if (opts?.persist === false || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      BANNED_IDS_STORAGE_KEY,
      JSON.stringify([...bannedUserIdsCache]),
    );
  } catch {
    /* ignore */
  }
}

hydrateBannedUserIdsFromStorage();

export function getBannedUserIds(): ReadonlySet<string> {
  return bannedUserIdsCache;
}

export function getBannedIdsRevision(): number {
  return bannedIdsRevision;
}

/** يجلب قائمة المحظورين إن كانت فارغة */
export async function ensureBannedUserIds(
  token: string,
  fetcher: (t: string) => Promise<string[]>,
): Promise<ReadonlySet<string>> {
  if (bannedUserIdsCache.size) return bannedUserIdsCache;
  const ids = await fetcher(token);
  if (ids.length) syncBannedUserIds(ids);
  return bannedUserIdsCache;
}

export function applyBannedFilterToState(state: AppState, ownerId: string): AppState {
  const banned = getBannedUserIds();
  if (!banned.size) return state;
  return {
    ...state,
    posts: filterPostsByBannedAuthors(state.posts || [], banned),
    stories: (state.stories || []).filter(s => !banned.has(s.userId)),
    chats: applyBannedMaskToAppChats(state.chats || [], ownerId, banned),
  };
}

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

export function maskChatForBannedPeer(
  chat: Chat,
  ownerId: string,
  bannedIds: ReadonlySet<string>,
): Chat {
  if (chat.isGroup || chat.isChannel) {
    return {
      ...chat,
      messages: (chat.messages || []).filter(m => !bannedIds.has(m.senderId)),
    };
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
  return {
    ...chat,
    messages: [...own, notice].sort((a, b) => a.createdAt - b.createdAt),
  };
}

export function filterPostsByBannedAuthors(
  posts: Post[],
  bannedIds: ReadonlySet<string>,
): Post[] {
  if (!bannedIds.size) return posts;
  return posts.filter(p => !p?.userId || !bannedIds.has(p.userId));
}

export function applyBannedMaskToAppChats(
  chats: Chat[],
  ownerId: string,
  bannedIds: ReadonlySet<string>,
): Chat[] {
  if (!bannedIds.size) return chats;
  return chats.map(c => maskChatForBannedPeer(c, ownerId, bannedIds));
}
