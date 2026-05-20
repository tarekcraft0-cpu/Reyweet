import { randomUUID } from "node:crypto";
import type { AppState, Chat, Message, Notification } from "../../../src/lib/types.js";
import {
  getSnapshot,
  getUserById,
  setSnapshot,
  type UserRow,
} from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { mergeMessageLists, messageRowToClient, messageToRow, type MessageRow } from "./chatMessages.js";
import { emitToUsers } from "./realtimeSocket.js";
import { broadcastSseToUser } from "./realtimeHub.js";

function stripPasswords(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

function rowToChatUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: "",
    bio: row.bio ?? "",
    avatar: row.avatar,
    followers: [],
    following: [],
    highlights: [],
    followRequestIn: [],
    followRequestOut: [],
    publicChannelIds: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    profileViews: [],
    favoriteStickerContents: [],
    createdStickerContents: [],
    pinnedChatIds: [],
    mutedChatIds: [],
    isPrivate: row.isPrivate === true,
    verified: row.verified === true,
    founderVerified: row.founderVerified === true,
    founderOfficialLabel: row.founderOfficialLabel,
    note: row.note || undefined,
    phone: row.phone || undefined,
    profileLink: row.profileLink || row.officialSiteUrl || undefined,
  };
}

async function loadMemberState(userId: string): Promise<AppState> {
  let raw = await getSnapshot(userId);
  let state = (raw as AppState | null) ?? (await buildMinimalAppState(userId));
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state.currentUserId = userId;
  return state;
}

async function ensureUsersInState(state: AppState, userIds: string[]): Promise<AppState> {
  let next = state;
  for (const id of userIds) {
    const row = await getUserById(id);
    if (!row) continue;
    const u = rowToChatUser(row);
    if (next.users.some(x => x.id === id)) {
      next = {
        ...next,
        users: next.users.map(x => (x.id === id ? { ...x, ...u, password: "" } : x)),
      };
    } else {
      next = { ...next, users: [...next.users, u] };
    }
  }
  return next;
}

function mergeChatIntoState(state: AppState, chat: Chat): AppState {
  const existing = state.chats.find(c => c.id === chat.id);
  const merged: Chat = existing
    ? {
        ...existing,
        ...chat,
        members: Array.from(new Set([...existing.members, ...chat.members])),
        admins: Array.from(new Set([...(existing.admins || []), ...(chat.admins || [])])),
        messages: mergeMessageLists(existing.messages, chat.messages),
      }
    : chat;
  const chats = state.chats.filter(c => c.id !== chat.id);
  chats.push(merged);
  return { ...state, chats };
}

/** دمج مجموعة بقائمة أعضاء موحّدة من الخادم (لا إبقاء أعضاء قدامى زائدين) */
function applyCanonicalGroupChat(state: AppState, chat: Chat): AppState {
  const existing = state.chats.find(c => c.id === chat.id);
  const merged: Chat = existing
    ? {
        ...existing,
        ...chat,
        members: [...chat.members],
        admins: chat.admins ?? existing.admins,
        messages: mergeMessageLists(existing.messages, chat.messages || []),
      }
    : chat;
  const chats = state.chats.filter(c => c.id !== chat.id);
  chats.push(merged);
  return { ...state, chats };
}

export async function deliverGroupChatToMember(
  memberId: string,
  chat: Chat,
  creatorId: string,
  welcomeMessage?: Message,
): Promise<void> {
  let state = await loadMemberState(memberId);
  state = await ensureUsersInState(state, [creatorId, ...chat.members]);
  const localChat: Chat = {
    ...chat,
    messages: welcomeMessage
      ? mergeMessageLists(chat.messages || [], [welcomeMessage])
      : chat.messages || [],
    lastOpenAtByUser: chat.lastOpenAtByUser ?? {},
    lastReadMessageIdByUser: chat.lastReadMessageIdByUser ?? {},
  };
  if (!localChat.members.includes(memberId)) {
    localChat.members = [...localChat.members, memberId];
  }
  state = mergeChatIntoState(state, localChat);

  if (memberId !== creatorId) {
    const creator = await getUserById(creatorId);
    const notif: Notification = {
      id: randomUUID(),
      userId: memberId,
      fromId: creatorId,
      type: "message",
      chatId: chat.id,
      text: `أضافك إلى مجموعة «${chat.name || "مجموعة"}»`,
      createdAt: Date.now(),
      read: false,
    };
    state = {
      ...state,
      notifications: [notif, ...(state.notifications || [])].slice(0, 200),
    };
  }

  await setSnapshot(memberId, stripPasswords(state));
}

export async function shareGroupChatWithMembers(
  creatorId: string,
  chat: Chat,
  welcomeText?: string,
): Promise<void> {
  const welcomeMessage: Message | undefined = welcomeText
    ? {
        id: randomUUID(),
        senderId: creatorId,
        type: "text",
        content: welcomeText,
        createdAt: Date.now(),
      }
    : undefined;

  const targets = chat.members.filter(id => id && id !== creatorId);
  await syncGroupChatCanonical(chat, creatorId, {
    welcomeMessage,
    inviteMemberIds: targets,
  });
}

export async function deliverGroupMessageToMembers(
  row: MessageRow,
  members: string[],
  senderId: string,
): Promise<void> {
  const clientMsg = messageRowToClient(row);
  const payload = {
    chatId: row.chatId,
    message: clientMsg,
    members,
    senderId,
    isGroup: true,
  };

  for (const uid of members) {
    if (uid === senderId) continue;
    let state = await loadMemberState(uid);
    state = await ensureUsersInState(state, [senderId]);
    let chat = state.chats.find(c => c.id === row.chatId);
    if (!chat) continue;
    if (!chat.messages.some(m => m.id === clientMsg.id)) {
      chat = { ...chat, messages: mergeMessageLists(chat.messages, [clientMsg]) };
    }
    state = mergeChatIntoState(state, chat);
    const notif: Notification = {
      id: randomUUID(),
      userId: uid,
      fromId: senderId,
      type: "message",
      chatId: row.chatId,
      text: clientMsg.type === "text" ? clientMsg.content.slice(0, 160) : "رسالة في المجموعة",
      createdAt: clientMsg.createdAt,
      read: false,
    };
    state = {
      ...state,
      notifications: [notif, ...(state.notifications || [])].slice(0, 200),
    };
    await setSnapshot(uid, stripPasswords(state));
    broadcastSseToUser(uid, "message_new", payload);
    emitToUsers([uid], "message_new", payload);
  }
}

/** مزامنة نسخة موحّدة من المجموعة لكل الأعضاء (قائمة أعضاء كاملة — لا دمج جزئي) */
export async function syncGroupChatCanonical(
  canonical: Chat,
  actorId: string,
  options?: { inviteMemberIds?: string[]; welcomeMessage?: Message },
): Promise<void> {
  const members = Array.from(new Set((canonical.members || []).filter(Boolean)));
  if (!members.length) return;

  const chatBase: Chat = { ...canonical, members };
  const inviteSet = new Set(options?.inviteMemberIds || []);

  for (const memberId of members) {
    let state = await loadMemberState(memberId);
    state = await ensureUsersInState(state, [actorId, ...members]);
    const existing = state.chats.find(c => c.id === chatBase.id);
    let localChat: Chat = {
      ...chatBase,
      members,
      messages: existing?.messages?.length
        ? mergeMessageLists(existing.messages, chatBase.messages || [])
        : chatBase.messages || [],
      lastOpenAtByUser: {
        ...(existing?.lastOpenAtByUser || {}),
        ...(chatBase.lastOpenAtByUser || {}),
      },
      lastReadMessageIdByUser: {
        ...(existing?.lastReadMessageIdByUser || {}),
        ...(chatBase.lastReadMessageIdByUser || {}),
      },
    };
    if (options?.welcomeMessage) {
      localChat = {
        ...localChat,
        messages: mergeMessageLists(localChat.messages, [options.welcomeMessage]),
      };
    }
    state = applyCanonicalGroupChat(state, localChat);

    if (inviteSet.has(memberId) && memberId !== actorId) {
      const notif: Notification = {
        id: randomUUID(),
        userId: memberId,
        fromId: actorId,
        type: "message",
        chatId: chatBase.id,
        text: `أضافك إلى مجموعة «${chatBase.name || "مجموعة"}»`,
        createdAt: Date.now(),
        read: false,
      };
      state = {
        ...state,
        notifications: [notif, ...(state.notifications || [])].slice(0, 200),
      };
    }
    await setSnapshot(memberId, stripPasswords(state));
  }

  const payload = {
    chat: {
      ...chatBase,
      messages: options?.welcomeMessage ? [options.welcomeMessage] : chatBase.messages || [],
    },
    fromUserId: actorId,
  };
  for (const memberId of members) {
    broadcastSseToUser(memberId, "group_invite", payload);
    emitToUsers([memberId], "group_invite", payload);
    emitToUsers([memberId], "sync_hint", { kind: "chats" });
  }
}

export async function patchGroupChatForMembers(
  chatId: string,
  members: string[],
  patch: {
    name?: string;
    avatar?: string;
    memberIds?: string[];
    removeMemberIds?: string[];
    isPublicGroup?: boolean;
    inviteCode?: string;
    joinRequests?: Chat["joinRequests"];
  },
): Promise<void> {
  const base =
    (await loadGroupChatForAdmin(chatId, members[0] || "")) ||
    (await loadGroupChatForAdmin(chatId, patch.memberIds?.[0] || ""));
  if (!base) return;

  let nextMembers = [...base.members];
  if (patch.memberIds?.length) {
    nextMembers = Array.from(new Set([...nextMembers, ...patch.memberIds]));
  }
  if (patch.removeMemberIds?.length) {
    nextMembers = nextMembers.filter(id => !patch.removeMemberIds!.includes(id));
  }

  const canonical: Chat = {
    ...base,
    name: patch.name ?? base.name,
    avatar: patch.avatar ?? base.avatar,
    members: nextMembers,
    isPublicGroup: patch.isPublicGroup ?? base.isPublicGroup,
    inviteCode: patch.inviteCode ?? base.inviteCode,
    joinRequests: patch.joinRequests ?? base.joinRequests,
    admins: patch.removeMemberIds?.length
      ? (base.admins || []).filter(id => !patch.removeMemberIds!.includes(id))
      : base.admins,
  };
  await syncGroupChatCanonical(canonical, members[0] || nextMembers[0] || "");
}

export async function loadGroupChatForAdmin(
  chatId: string,
  hintUserId: string,
): Promise<Chat | null> {
  const queue: string[] = hintUserId ? [hintUserId] : [];
  const tried = new Set<string>();
  let best: Chat | null = null;

  while (queue.length > 0) {
    const userId = queue.shift()!;
    if (!userId || tried.has(userId)) continue;
    tried.add(userId);
    const snap = (await getSnapshot(userId)) as { chats?: Chat[] } | null;
    const found = snap?.chats?.find(c => c.id === chatId && c.isGroup && !c.isChannel);
    if (!found) continue;
    if (!best || found.members.length > best.members.length) best = found;
    for (const id of [...found.members, ...(found.admins || [])]) {
      if (!tried.has(id)) queue.push(id);
    }
  }
  return best;
}

export async function memberHasGroupChat(memberId: string, chatId: string): Promise<boolean> {
  const snap = (await getSnapshot(memberId)) as { chats?: Chat[] } | null;
  return Boolean(snap?.chats?.some(c => c.id === chatId && c.isGroup && !c.isChannel));
}

export async function notifyGroupMentions(
  row: MessageRow,
  members: string[],
  senderId: string,
  content: string,
): Promise<void> {
  const lower = content.toLowerCase();
  const mentionAll = /@all\b|@الجميع|منشن عام/.test(lower);
  const mentionedNames = Array.from(
    new Set((content.match(/@([a-z0-9_]{1,30})/gi) || []).map(x => x.slice(1).toLowerCase())),
  ).filter(n => n !== "all" && n !== "الجميع");

  for (const uid of members) {
    if (uid === senderId) continue;
    let state = await loadMemberState(uid);
    const chat = state.chats.find(c => c.id === row.chatId);
    if (!chat) continue;
    const me = state.users.find(u => u.id === uid);
    let shouldNotify = mentionAll;
    if (!shouldNotify && me) {
      shouldNotify = mentionedNames.includes(me.username.toLowerCase());
    }
    if (!shouldNotify) continue;
    const sender = state.users.find(u => u.id === senderId);
    const notif: Notification = {
      id: randomUUID(),
      userId: uid,
      fromId: senderId,
      type: "mention",
      chatId: row.chatId,
      text: mentionAll
        ? `${sender?.username || "عضو"} منشن الجميع في «${chat.name || "مجموعة"}»`
        : `${sender?.username || "عضو"} منشنك في «${chat.name || "مجموعة"}»`,
      createdAt: Date.now(),
      read: false,
    };
    state = {
      ...state,
      notifications: [notif, ...(state.notifications || [])].slice(0, 200),
    };
    await setSnapshot(uid, stripPasswords(state));
    broadcastSseToUser(uid, "social_update", { notification: notif });
  }
}

export function welcomeMessageRow(chatId: string, creatorId: string, text: string): MessageRow {
  const msg: Message = {
    id: randomUUID(),
    senderId: creatorId,
    type: "text",
    content: text,
    createdAt: Date.now(),
  };
  return messageToRow(chatId, msg, null);
}
