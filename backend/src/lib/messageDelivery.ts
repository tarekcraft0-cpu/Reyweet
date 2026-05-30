import { randomUUID } from "node:crypto";
import type { AppState, Chat, Message, Notification, User } from "../../../src/lib/types.js";
import {
  getSnapshot,
  getUserById,
  setSnapshot,
  type MessageRow,
  type UserRow,
} from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { messageRowToClient, mergeMessageLists } from "./chatMessages.js";
import { canonicalizeDmChatId, dmChatId } from "./dmChatId.js";
import { scopeAppStateToOwner } from "./scopeAppState.js";

function stripPasswords(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

function rowToChatUser(row: UserRow): User {
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
    appOfficialVerified: row.appOfficialVerified === true,
    supportOfficialVerified: row.supportOfficialVerified === true,
    supportOfficialLabel: row.supportOfficialLabel,
    appOfficialLabel: row.appOfficialLabel,
    note: row.note || undefined,
    phone: row.phone || undefined,
    profileLink: row.profileLink || row.officialSiteUrl || undefined,
  };
}

function ensureUserInState(state: AppState, row: UserRow): AppState {
  if (state.users.some(u => u.id === row.id)) {
    return {
      ...state,
      users: state.users.map(u => (u.id === row.id ? { ...u, ...rowToChatUser(row), password: "" } : u)),
    };
  }
  return { ...state, users: [...state.users, rowToChatUser(row)] };
}

function findDmChat(state: AppState, a: string, b: string): Chat | undefined {
  const canonical = dmChatId(a, b);
  return state.chats.find(
    c =>
      c.id === canonical ||
      (!c.isGroup &&
        !c.isChannel &&
        c.members.length === 2 &&
        c.members.includes(a) &&
        c.members.includes(b)),
  );
}

function isMessageRequest(state: AppState, recipientId: string, senderId: string): boolean {
  const me = state.users.find(u => u.id === recipientId);
  const sender = state.users.find(u => u.id === senderId);
  if (!me || !sender) return false;
  /** أتلقيت من شخص أتابعه → ليست طلبًا */
  if (me.following?.includes(senderId)) return false;
  /** المُرسِل يتابعني → لا نخبي المحادثة في «طلبات المراسلة» (يتوافق مع mergeSocialGraph بعد التأكد من صف المرسل) */
  if (sender.following?.includes(recipientId)) return false;
  /** غريبان: حساب المرسل الخاص يبقى «طلب» مثل الغالبية؛ الحساب العام يظهر في القائمة العادية */
  return sender.isPrivate === true;
}

function messagePreview(msg: Message): string {
  if (msg.type === "text") {
    return msg.content.length > 160 ? `${msg.content.slice(0, 160)}…` : msg.content;
  }
  if (msg.type === "sticker") return "ملصق";
  if (msg.type === "image") return msg.viewOnce ? "صورة (مرة واحدة)" : "صورة";
  if (msg.type === "drawing") return msg.viewOnce ? "رسم (مرة واحدة)" : "رسم";
  if (msg.type === "video") return msg.viewOnce ? "فيديو (مرة واحدة)" : "فيديو";
  if (msg.type === "voice") return "رسالة صوتية";
  if (msg.type === "shared_post") return "منشور";
  if (msg.type === "shared_story") return "ستوري";
  return "رسالة";
}

/**
 * يضمن وجود المحادثة في لقطة المُرسِل حتى يتمكن من الإرسال مجدداً حتى لو لم
 * تكن المحادثة موجودة أصلاً في لقطته (أول رسالة، أو معرّفات قديمة).
 */
export async function ensureDmChatInSenderSnapshot(
  senderId: string,
  receiverId: string,
): Promise<void> {
  const canonicalId = dmChatId(senderId, receiverId);

  const raw = await getSnapshot(senderId);
  const state = (raw as AppState | null) ?? (await buildMinimalAppState(senderId));

  const alreadyHasChat =
    Array.isArray((state as AppState).chats) &&
    (state as AppState).chats.some(
      c =>
        c.id === canonicalId ||
        (!c.isGroup && !c.isChannel && c.members.includes(senderId) && c.members.includes(receiverId)),
    );
  if (alreadyHasChat) return;

  const receiverRow = await getUserById(receiverId);
  let nextState = state as AppState;
  nextState = await mergeDbUsersIntoAppState(nextState);
  nextState = await mergeSocialGraphIntoAppState(nextState);
  if (receiverRow) nextState = ensureUserInState(nextState, receiverRow);
  nextState.currentUserId = senderId;

  const chat: Chat = {
    id: canonicalId,
    isGroup: false,
    members: [senderId, receiverId],
    admins: [],
    messages: [],
    lastOpenAtByUser: {},
    lastReadMessageIdByUser: {},
  };

  const chatsWithout = (nextState.chats || []).filter(
    c =>
      !(
        !c.isGroup &&
        !c.isChannel &&
        c.members.includes(senderId) &&
        c.members.includes(receiverId)
      ),
  );

  nextState = scopeAppStateToOwner(senderId, {
    ...nextState,
    chats: [...chatsWithout, chat],
  });

  await setSnapshot(senderId, stripPasswords(nextState));
}

/** يحدّث لقطة المستلم على D: (يُستدعى بعد البث الفوري) */
export async function deliverIncomingDirectMessage(row: MessageRow): Promise<void> {
  const receiverId = row.receiverId;
  if (!receiverId) return;

  const senderId = row.senderId;
  const clientMsg = messageRowToClient(row);

  void persistDirectMessageSnapshot(row, receiverId, senderId, clientMsg).catch(e => {
    // eslint-disable-next-line no-console
    console.warn("[messages] snapshot persist failed", e);
  });
}

async function persistDirectMessageSnapshot(
  row: MessageRow,
  receiverId: string,
  senderId: string,
  clientMsg: Message,
): Promise<void> {
  const senderRow = await getUserById(senderId);

  let raw = await getSnapshot(receiverId);
  let state = (raw as AppState | null) ?? (await buildMinimalAppState(receiverId));
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  if (senderRow) state = ensureUserInState(state, senderRow);
  state.currentUserId = receiverId;

  const canonicalId = dmChatId(receiverId, senderId);
  let chat = findDmChat(state, receiverId, senderId);
  if (!chat) {
    chat = {
      id: canonicalId,
      isGroup: false,
      members: [receiverId, senderId],
      admins: [],
      messages: [],
      request: isMessageRequest(state, receiverId, senderId),
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
    };
  } else {
    const needsRequest = isMessageRequest(state, receiverId, senderId);
    chat = canonicalizeDmChatId(
      {
        ...chat,
        request: chat.request === true || needsRequest,
      },
      receiverId,
    );
  }

  if (!chat.messages.some(m => m.id === clientMsg.id)) {
    chat = { ...chat, messages: mergeMessageLists(chat.messages, [clientMsg]) };
  }

  const chats = state.chats.filter(
    c =>
      !(
        !c.isGroup &&
        !c.isChannel &&
        c.members.length === 2 &&
        c.members.includes(receiverId) &&
        c.members.includes(senderId)
      ),
  );
  chats.push(chat);

  const notif: Notification = {
    id: randomUUID(),
    userId: receiverId,
    fromId: senderId,
    type: "message",
    chatId: chat.id,
    text: messagePreview(clientMsg),
    createdAt: clientMsg.createdAt,
    read: false,
  };

  state = scopeAppStateToOwner(receiverId, {
    ...state,
    chats,
    notifications: [notif, ...(state.notifications || [])].slice(0, 200),
  });

  await setSnapshot(receiverId, stripPasswords(state));
}
