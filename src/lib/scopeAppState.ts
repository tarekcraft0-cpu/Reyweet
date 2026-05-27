import type { AppState, Chat, ID, Message, User } from "./types";
import { canonicalizeDmChatId } from "./dmChatId";
import { isGuestUserId } from "./guestUser";
import { storiesVisibleToViewer } from "./storyVisibility";

function dmPeerIds(chat: Chat, ownerId: ID): ID[] {
  return (chat.members || []).filter(id => id !== ownerId);
}

/** رسالة تظهر لحساب معيّن داخل غرفة محددة */
export function messageBelongsToChatForOwner(m: Message, chat: Chat, ownerId: ID): boolean {
  if (!Array.isArray(chat.members) || !chat.members.includes(ownerId)) return false;
  if (chat.isGroup || chat.isChannel) return true;
  const peers = dmPeerIds(chat, ownerId);
  if (peers.length === 1) {
    const peer = peers[0]!;
    return m.senderId === ownerId || m.senderId === peer;
  }
  if (peers.length === 0) return m.senderId === ownerId;
  return peers.includes(m.senderId) || m.senderId === ownerId;
}

/** إصلاح DM ملوّثة بأكثر من طرف (تسرّب بين حسابات الجهاز) */
function repairDmChatForOwner(chat: Chat, ownerId: ID): Chat | null {
  if (chat.isGroup || chat.isChannel) return chat;
  const peers = dmPeerIds(chat, ownerId);
  if (peers.length === 0) return null;
  if (peers.length === 1) {
    return {
      ...chat,
      isGroup: false,
      isChannel: false,
      members: [ownerId, peers[0]!],
    };
  }
  let bestPeer = peers[0]!;
  let bestCount = -1;
  for (const peer of peers) {
    const n = (chat.messages || []).filter(
      m => m.senderId === ownerId || m.senderId === peer,
    ).length;
    if (n > bestCount) {
      bestCount = n;
      bestPeer = peer;
    }
  }
  return {
    ...chat,
    isGroup: false,
    isChannel: false,
    members: [ownerId, bestPeer],
  };
}

/** محادثة تخص الحساب النشط — DM = عضوين فقط */
export function chatBelongsToAccount(chat: Chat, ownerId: ID): boolean {
  const members = Array.isArray(chat.members) ? chat.members : [];
  if (!members.includes(ownerId)) return false;
  if (chat.isGroup || chat.isChannel) return true;
  const peers = dmPeerIds(chat, ownerId);
  if (peers.length === 1) return true;
  if (peers.length === 0) return false;
  return repairDmChatForOwner(chat, ownerId) != null;
}

/** DM بين الحساب النشط وطرف محدد (يتجاهل غرف ملوّثة بأكثر من طرف) */
export function findDmChatForPeer(chats: Chat[], ownerId: ID, peerId: ID): Chat | null {
  for (const c of chats) {
    if (c.isGroup || c.isChannel) continue;
    const scoped = scopeChatForAccount(c, ownerId);
    if (!scoped) continue;
    const peer = scoped.members.find(id => id !== ownerId);
    if (peer === peerId) return scoped;
  }
  return null;
}

export function scopeChatForAccount(chat: Chat, ownerId: ID): Chat | null {
  let scoped = chat;
  if (!chatBelongsToAccount(chat, ownerId)) return null;
  if (!chat.isGroup && !chat.isChannel && dmPeerIds(chat, ownerId).length !== 1) {
    const repaired = repairDmChatForOwner(chat, ownerId);
    if (!repaired) return null;
    scoped = repaired;
  }

  const messages = (scoped.messages || []).filter(m =>
    messageBelongsToChatForOwner(m, scoped, ownerId),
  );

  const lastOpenAtByUser =
    scoped.lastOpenAtByUser && scoped.lastOpenAtByUser[ownerId] != null
      ? { [ownerId]: scoped.lastOpenAtByUser[ownerId]! }
      : {};
  const lastReadMessageIdByUser =
    scoped.lastReadMessageIdByUser && scoped.lastReadMessageIdByUser[ownerId] != null
      ? { [ownerId]: scoped.lastReadMessageIdByUser[ownerId]! }
      : {};
  const hiddenMessageIdsByUser =
    scoped.hiddenMessageIdsByUser && scoped.hiddenMessageIdsByUser[ownerId]
      ? { [ownerId]: [...scoped.hiddenMessageIdsByUser[ownerId]!] }
      : undefined;

  const normalized = {
    ...scoped,
    members:
      !scoped.isGroup && !scoped.isChannel
        ? [ownerId, dmPeerIds(scoped, ownerId)[0]!]
        : scoped.members,
    lastOpenAtByUser,
    lastReadMessageIdByUser,
    hiddenMessageIdsByUser,
    messages,
  };
  return canonicalizeDmChatId(normalized, ownerId);
}

export type ScopeAppStateOptions = {
  accountIds?: ID[];
  isolateOwnedUsers?: (ownerId: ID, state: AppState) => AppState["users"];
};

/** مستخدمون يجب إبقاؤهم لعرض المنشورات/المحادثات (حتى لو عُزّلوا من كاش الحساب) */
function collectDisplayUserIds(state: AppState, ownerId: ID): Set<ID> {
  const ids = new Set<ID>([ownerId]);
  for (const p of state.posts ?? []) {
    if (p?.userId) ids.add(p.userId);
    for (const uid of p.likes ?? []) ids.add(uid);
    for (const uid of p.reposts ?? []) ids.add(uid);
    for (const c of p.comments ?? []) ids.add(c.userId);
  }
  for (const c of state.chats ?? []) {
    for (const mid of c.members ?? []) ids.add(mid);
    for (const m of c.messages ?? []) ids.add(m.senderId);
  }
  for (const st of state.stories ?? []) ids.add(st.userId);
  for (const n of state.notifications ?? []) {
    if (n.fromId) ids.add(n.fromId);
  }
  return ids;
}

/**
 * عزل لقطة التطبيق لحساب واحد — يمنع تسرّب محادثات/إشعارات/ستوريات حساب آخر.
 */
export function scopeAppStateToAccount(
  ownerId: ID,
  state: AppState,
  options?: ScopeAppStateOptions,
): AppState {
  if (!ownerId || isGuestUserId(ownerId)) return state;

  const chats = (state.chats || [])
    .map(c => scopeChatForAccount(c, ownerId))
    .filter((c): c is Chat => c != null);

  const notifications = (state.notifications || []).filter(n => n.userId === ownerId);

  const stories = storiesVisibleToViewer(state, ownerId);

  const accountIds = options?.accountIds?.length ? options.accountIds : [ownerId];

  const directory = state.users || [];
  const baseUsers = options?.isolateOwnedUsers
    ? options.isolateOwnedUsers(ownerId, { ...state, users: directory })
    : directory;
  const usersById = new Map<ID, User>(baseUsers.map(u => [u.id, u]));
  for (const id of collectDisplayUserIds(state, ownerId)) {
    if (usersById.has(id)) continue;
    const u = directory.find(x => x.id === id);
    if (u) usersById.set(id, u);
  }
  const users = [...usersById.values()];

  const me = users.find(u => u.id === ownerId);

  return {
    ...state,
    currentUserId: ownerId,
    accountIds: [...accountIds],
    users,
    chats,
    notifications,
    stories,
    theme: me ? state.theme : state.theme,
    language: me ? state.language : state.language,
  };
}
