import {
  mergeDevSeedIfNeeded,
  repairDevLocalStorageOnce,
  type DevSeedBundle,
} from "./devSeedRestore";
import { getUserEntitlements, isStoryStillActive } from "./verificationEntitlements";
import { AppLanguageCtx } from "./languageContext";
import { TypingCtx } from "./typingContext";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Chat,
  Comment,
  HighlightEntry,
  HighlightSlide,
  ID,
  MediaNote,
  Message,
  Notification,
  Post,
  StoryItem,
  StorySticker,
  User,
} from "./types";

/** منشورات حُذفت محلياً — تُستبعد من سحب الخادم حتى تكتمل المزامنة */
const locallyRemovedPostIds = new Map<ID, number>();
const locallyRemovedCommentKeys = new Map<string, number>();
const LOCAL_REMOVE_TTL_MS = 300_000;

function markPostLocallyRemoved(postId: ID) {
  locallyRemovedPostIds.set(postId, Date.now());
}

function markCommentLocallyRemoved(postId: ID, commentId: ID) {
  locallyRemovedCommentKeys.set(`${postId}:${commentId}`, Date.now());
}

function pruneLocalRemoveMaps(now = Date.now()) {
  for (const [id, at] of [...locallyRemovedPostIds.entries()]) {
    if (now - at > LOCAL_REMOVE_TTL_MS) locallyRemovedPostIds.delete(id);
  }
  for (const [key, at] of [...locallyRemovedCommentKeys.entries()]) {
    if (now - at > LOCAL_REMOVE_TTL_MS) locallyRemovedCommentKeys.delete(key);
  }
}

function mergeHiddenMessageIdsByUser(
  a: Chat["hiddenMessageIdsByUser"] | undefined,
  b: Chat["hiddenMessageIdsByUser"] | undefined,
  ownerId: ID,
): Chat["hiddenMessageIdsByUser"] | undefined {
  const fromA = a?.[ownerId] ?? [];
  const fromB = b?.[ownerId] ?? [];
  const merged = [...new Set([...fromB, ...fromA])];
  if (!merged.length) {
    const keys = new Set([...(a ? Object.keys(a) : []), ...(b ? Object.keys(b) : [])]);
    keys.delete(ownerId);
    if (!keys.size) return undefined;
    return { ...(b || {}), ...(a || {}) };
  }
  return { ...(b || {}), ...(a || {}), [ownerId]: merged };
}

/** سحب الفيد من الخادم مباشرة — يتجاوز لقطة localStorage القديمة */
function mergePostsServerAuthoritative(localPosts: Post[], remotePosts: Post[]): Post[] {
  pruneLocalRemoveMaps();
  const remoteById = new Map(remotePosts.map(p => [p.id, p]));
  const merged: Post[] = [];
  for (const p of remotePosts) {
    if (locallyRemovedPostIds.has(p.id)) continue;
    merged.push(p);
  }
  for (const p of localPosts) {
    if (remoteById.has(p.id) || locallyRemovedPostIds.has(p.id)) continue;
    merged.push(p);
  }
  return merged.sort((a, b) => b.createdAt - a.createdAt);
}

function mergeHomeFeedIntoState(
  state: AppState,
  feed: { posts: Post[]; users: User[] },
): AppState {
  const posts = mergePostsServerAuthoritative(state.posts || [], feed.posts || []);
  const usersById = new Map(state.users.map(u => [u.id, u]));
  for (const u of feed.users || []) {
    const prev = usersById.get(u.id);
    usersById.set(u.id, prev ? mergeUserFromServer(prev, u) : { ...u, password: "" });
  }
  return { ...state, posts, users: [...usersById.values()] };
}

function mergePostsPreservingLocalDeletes(localPosts: Post[], remotePosts: Post[]): Post[] {
  const now = Date.now();
  pruneLocalRemoveMaps(now);
  const localIds = new Set(localPosts.map(p => p.id));
  const remoteById = new Map(remotePosts.map(p => [p.id, p]));
  const merged: Post[] = [];
  for (const p of localPosts) {
    if (locallyRemovedPostIds.has(p.id)) continue;
    const remote = remoteById.get(p.id);
    const base = remote ?? p;
    const localCommentIds = new Set(p.comments.map(c => c.id));
    const filteredRemoteComments = (remote?.comments ?? []).filter(c => {
      const key = `${p.id}:${c.id}`;
      if (locallyRemovedCommentKeys.has(key)) return false;
      return true;
    });
    const comments = [
      ...p.comments,
      ...filteredRemoteComments.filter(c => !localCommentIds.has(c.id)),
    ].filter(c => !locallyRemovedCommentKeys.has(`${p.id}:${c.id}`));
    merged.push({
      ...base,
      likes: remote?.likes ?? p.likes,
      reposts: remote?.reposts ?? p.reposts,
      comments,
    });
  }
  for (const p of remotePosts) {
    if (localIds.has(p.id)) continue;
    if (locallyRemovedPostIds.has(p.id)) continue;
    merged.push({
      ...p,
      comments: p.comments.filter(c => !locallyRemovedCommentKeys.has(`${p.id}:${c.id}`)),
    });
  }
  return merged.sort((a, b) => b.createdAt - a.createdAt);
}
import type { ApiAuthUser, SocialRelation, SocialToggleMode } from "./apiBackend";
import {
  apiBackendEnabled,
  apiLogin,
  apiVerifyLogin,
  apiRegister,
  apiChangePassword,
  apiCompletePasswordReset,
  apiCompletePasswordResetLink,
  getApiToken,
  apiAcceptFollowRequest,
  apiDeclineFollowRequest,
  apiGetSocialRelation,
  apiToggleFollow,
  apiSeverSocialOnBlock,
  ensureApiRuntimeConfig,
  pullRemoteAppState,
  apiFetchHomeFeed,
  apiFetchUserPosts,
  pushRemoteAppState,
  apiCreateStory,
  apiRequestPasswordReset,
  setApiToken,
  apiPostMessage,
  apiFetchChatMessages,
  mergeChatMessages,
  mergeChatRecord,
  userFromSearchResult,
  apiFetchUserDirectory,
  apiFetchUserById,
  apiCreateGroup,
  apiAddGroupMembers,
  apiPatchGroup,
  apiKickGroupMember,
  apiLeaveGroup,
  apiFetchGroupInvitePreview,
  apiJoinGroupByInvite,
  apiRespondGroupJoinRequest,
  apiRecordProfileVisit,
  apiTogglePostLike,
  apiTogglePostRepost,
  apiUpsertPost,
  apiAddPostComment,
  apiRecordStoryView,
} from "./apiBackend";
import { apiMuteGroupMember } from "./groupApi";
import { subscribeRealtimeEvents, USER_REGISTERED_WINDOW_EVENT } from "./realtimeEvents";
import {
  disconnectRealtimeSocketHard,
  emitDirectMessage,
} from "./realtimeSocket";
import {
  emitMessagesDelivered,
  emitMessagesRead,
} from "./chatRealtimeExtras";
import {
  readCachedChatMessages,
  writeCachedChatMessages,
} from "./chatMessageCache";
import { handleRemoteCallSignal, type CallSignalPayload, type IncomingCallRing } from "./webrtcCall";

export const INCOMING_CALL_WINDOW_EVENT = "retweet-call-ring";
import { logAuthRoute } from "./authRouteDebug";
import {
  activateAccountSession,
  applyAccountSessionToken,
  emitAccountSwitchedEvent,
  getAccountSession,
  getLastActiveUserId,
  isValidAccountSwitchTarget,
  listAccountSessions,
  loadAccountStateCache,
  isolateUsersForAccountCache,
  mergeUsersForAccounts,
  migrateLegacyApiToken,
  pruneStaleAccountSessions,
  reconcileOwnedAccountProfiles,
  removeAccountSession,
  ensureApiTokenMatchesUser,
  restoreActiveSessionOnLaunch,
  saveAccountStateCache,
  setLastActiveUserId,
  setProfileTogglePeer,
  snapshotAccountIdsForOwner,
  stripOtherOwnedAccountsFromUsers,
  ACCOUNT_SWITCH_FAILED_EVENT,
  syncActiveApiToken,
  upsertAccountSession,
} from "./accountSessions";
import {
  applyAuthoritativeProfile,
  mergeDirectoryUser,
  mergeUserFromServer,
  mergeUserProfilePatch,
} from "./mergeUserSocial";
import {
  cachePublicProfileFromApi,
  cachePublicProfileFromUser,
  getPublicProfileOverlay,
  patchPublicProfileSocial,
} from "./publicProfileCache";
import { FOUNDER_ACCOUNT_ID, withFounderProfileFields } from "./founderAccount";
import {
  OFFICIAL_APP_ACCOUNT_ID,
  createOfficialAppSeedUser,
  withOfficialAppProfileFields,
} from "./officialAppAccount";
import {
  createSupportOfficialSeedUser,
  withSupportOfficialProfileFields,
} from "./supportOfficialAccount";
import { toStoredMediaRef } from "./mediaUrl";
import { DEFAULT_AVATAR_DATA_URI } from "./defaultAvatar";
import { isUsernameTaken, normalizeUsername, validateUsernameFormat } from "./usernameRules";
import {
  hashPassword,
  verifyStoredPassword,
  normalizeEmail,
  validateEmailFormat,
  validateNewPasswordPlain,
} from "./passwordAuth";
import { normalizePhone, validateOptionalPhone } from "./phoneUtils";
import {
  GUEST_LOCAL_USER_ID,
  isGuestUserId,
  mkGuestUser,
  stripGuestFromPersistedState,
} from "./guestUser";
import { applyDeviceThemeToDom, readDeviceTheme } from "./deviceTheme";
import { runChatIsolationMigration } from "./chatIsolationMigration";
import { normalizeChatMessage, normalizeChatRecord } from "./chatNormalize";
import { chatMergeKey, dmChatId, findChatByOpenId, parseDmChatId } from "./dmChatId";
import {
  findDmChatForPeer,
  messageBelongsToChatForOwner,
  scopeAppStateToAccount,
} from "./scopeAppState";
import {
  purgeStateForAccountSwitch,
  refreshOwnedUsersInState,
  resolveUserProfile,
} from "./resolveUserProfile";
import {
  storiesVisibleToViewer,
  viewerCanSeePrivateAuthorContent,
} from "./storyVisibility";

const STORAGE_KEY = "retweet_state_v2";
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
/** مدة نوت البروفايل في شريط المحادثات */
export const PROFILE_NOTE_TTL_MS = 24 * 60 * 60 * 1000;

export function isProfileNoteActive(u: Pick<User, "note" | "noteAt">): boolean {
  const text = u.note?.trim();
  if (!text) return false;
  if (!u.noteAt) return true;
  return Date.now() - u.noteAt < PROFILE_NOTE_TTL_MS;
}
const uid = () => Math.random().toString(36).slice(2, 10);
export const QURAN_CHANNEL_ID = "channel_quran_official";
/** قناة أدعية بوت طارق رمدي (الاسم يُفرض عند تحميل الحالة) */
export const TARIQ_BOT_CHANNEL_NAME = "بوت طارق رمدي";

/** حُذف حساب المؤسس المدمج — يُزال من الحالة المحفوظة إن وُجد */
const LEGACY_FOUNDER_USER_ID = "u_t_account";
const LEGACY_FOUNDER_CHANNEL_ID = "channel_t_auto_join_everyone";
/** حسابات العينة المحذوفة — تُزال من الحالة المحفوظة إن وُجدت */
const LEGACY_REMOVED_USER_IDS = new Set<string>([
  LEGACY_FOUNDER_USER_ID,
  "u_omar",
  "u_sara",
  "u_lina",
]);

function cleanStoryStickersForLegacyUser(stickers: StorySticker[] | undefined, L: string): StorySticker[] | undefined {
  if (!stickers?.length) return stickers;
  return stickers.map(sk => {
    if (sk.kind === "quiz" && sk.answers && typeof sk.answers === "object") {
      const answers = { ...sk.answers } as Record<string, number>;
      delete answers[L];
      return { ...sk, answers };
    }
    if (sk.kind === "slider" && sk.ratings && typeof sk.ratings === "object") {
      const ratings = { ...sk.ratings } as Record<string, number>;
      delete ratings[L];
      return { ...sk, ratings };
    }
    return sk;
  });
}

function stripLegacyFounderFromState(s: AppState): AppState {
  const CH = LEGACY_FOUNDER_CHANNEL_ID;
  const stripUser = (id: string) => !LEGACY_REMOVED_USER_IDS.has(id);

  const users = (s.users || [])
    .filter(u => !LEGACY_REMOVED_USER_IDS.has(u.id))
    .map(u => ({
      ...u,
      followers: (u.followers || []).filter(stripUser),
      following: (u.following || []).filter(stripUser),
      followRequestIn: (u.followRequestIn || []).filter(stripUser),
      followRequestOut: (u.followRequestOut || []).filter(stripUser),
      blocked: (u.blocked || []).filter(stripUser),
      closeFriends: (u.closeFriends || []).filter(stripUser),
      profileViews: (u.profileViews || []).filter(pv => stripUser(pv.userId)),
      pinnedChatIds: (u.pinnedChatIds || []).filter(cid => cid !== CH),
      mutedChatIds: (u.mutedChatIds || []).filter(cid => cid !== CH),
      publicChannelIds: (u.publicChannelIds || []).filter(cid => cid !== CH),
    }));

  const chats = (s.chats || [])
    .filter(c => c.id !== CH)
    .map(c => {
      const members = (c.members || []).filter(stripUser);
      const admins = (c.admins || []).filter(stripUser);
      const hosts = (c.hosts || []).filter(stripUser);
      let createdByUserId =
        c.createdByUserId && LEGACY_REMOVED_USER_IDS.has(c.createdByUserId)
          ? undefined
          : c.createdByUserId;
      if (c.isChannel && !createdByUserId && admins[0]) createdByUserId = admins[0];
      const lastOpenAtByUser = { ...(c.lastOpenAtByUser || {}) };
      const lastReadMessageIdByUser = { ...(c.lastReadMessageIdByUser || {}) };
      for (const rid of LEGACY_REMOVED_USER_IDS) {
        delete lastOpenAtByUser[rid];
        delete lastReadMessageIdByUser[rid];
      }
      const messages = (c.messages || [])
        .filter(msg => stripUser(msg.senderId))
        .map(msg => ({
          ...msg,
          viewOnceOpenedByUserIds: (msg.viewOnceOpenedByUserIds || []).filter(stripUser),
          reactions: (msg.reactions || []).filter(r => stripUser(r.userId)),
        }));
      return {
        ...c,
        members,
        admins,
        hosts,
        createdByUserId,
        lastOpenAtByUser,
        lastReadMessageIdByUser,
        messages,
      };
    });

  const posts = (s.posts || [])
    .map(p => ({
      ...p,
      userId: p.userId === LEGACY_FOUNDER_USER_ID ? FOUNDER_ACCOUNT_ID : p.userId,
      likes: (p.likes || []).filter(stripUser),
      reposts: (p.reposts || []).filter(stripUser),
      comments: (p.comments || [])
        .filter(c => stripUser(c.userId))
        .map(c => ({
          ...c,
          userId: c.userId === LEGACY_FOUNDER_USER_ID ? FOUNDER_ACCOUNT_ID : c.userId,
        })),
    }))
    .filter(p => stripUser(p.userId));

  const stories = (s.stories || [])
    .filter(st => stripUser(st.userId))
    .map(st => {
      let stickers = st.stickers;
      for (const rid of LEGACY_REMOVED_USER_IDS) {
        stickers = cleanStoryStickersForLegacyUser(stickers, rid);
      }
      return {
        ...st,
        likes: (st.likes || []).filter(stripUser),
        viewedByUserIds: (st.viewedByUserIds || []).filter(stripUser),
        stickers,
      };
    });

  const stickers = (s.stickers || []).filter(st => stripUser(st.userId));
  const notifications = (s.notifications || []).filter(
    n => stripUser(n.userId) && stripUser(n.fromId),
  );
  const mediaNotes = (s.mediaNotes || []).filter(mn => stripUser(mn.authorId));
  const currentUserId =
    s.currentUserId && LEGACY_REMOVED_USER_IDS.has(s.currentUserId) ? null : s.currentUserId;
  const accountIds = (s.accountIds || []).filter(stripUser);

  return {
    ...s,
    users,
    chats,
    posts,
    stories,
    stickers,
    notifications,
    mediaNotes,
    currentUserId,
    accountIds,
  };
}

function pushNotif(s: AppState, n: Omit<Notification, "id" | "createdAt" | "read">): AppState {
  if (!s.currentUserId || n.userId !== s.currentUserId) return s;
  if (n.userId === n.fromId) return s;
  /** رسائل الدردشة تظهر في تبويب المحادثات فقط — لا في قائمة القلب */
  if (n.type === "message") return s;
  const notif: Notification = { id: uid(), createdAt: Date.now(), read: false, ...n };
  return { ...s, notifications: [notif, ...s.notifications].slice(0, 200) };
}

const mkUser = (
  p: Partial<User> & Pick<User, "id" | "username" | "email" | "password" | "avatar">,
): User => ({
  bio: "",
  profileLink: "",
  allowStoryReplies: true,
  isPrivate: false,
  followers: [],
  following: [],
  highlights: [],
  followRequestIn: [],
  followRequestOut: [],
  publicChannelIds: [],
  note: "",
  noteAt: 0,
  blocked: [],
  closeFriends: [],
  favorites: [],
  favoriteStickerContents: [],
  createdStickerContents: [],
  profileViews: [],
  shareProfileVisitActivity: true,
  showLikesAndFavoritesOnProfile: true,
  verified: false,
  ...p,
});

const seedUsers: User[] = [
  mkUser({
    id: "u_tariq_bot",
    username: "tareq_bot",
    email: "tareq.bot@retweet.app",
    password: "bot",
    avatar: "RT",
    bio: "بوت طارق رمدي — أدعية وتذكير",
  }),
  createOfficialAppSeedUser(mkUser),
  createSupportOfficialSeedUser(mkUser),
];

const seedPosts: Post[] = [
  {
    id: "post_official_welcome",
    userId: OFFICIAL_APP_ACCOUNT_ID,
    type: "post",
    text: "مرحباً بك في Retweet ✦\n\nهذا الحساب الرسمي للتطبيق — تابعنا هنا للتحديثات، الإعلانات، نصائح الأمان، وقنوات الدعم.\n\n#Retweet #رسمي",
    image: "✦",
    likes: [],
    reposts: [],
    comments: [],
    createdAt: Date.now() - 1800_000,
  },
];

const seedStories: StoryItem[] = [];

const BOT_USER_ID = "u_tariq_bot";

const BOT_SPAM_PATTERNS = [/انا بوت طارق/i, /انشر ادع/i, /انشر ادعيه/i];

function isBotSpamContent(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return BOT_SPAM_PATTERNS.some(re => re.test(t));
}

function pickBotDuaContent(): string {
  return BOT_MESSAGES[Math.floor(Math.random() * BOT_MESSAGES.length)];
}

const BOT_MESSAGES = [
  "اللهم أصلح لي ديني الذي هو عصمة أمري، وأصلح لي دنياي التي فيها معاشي.",
  "اللهم اجعل هذا اليوم سكينة في القلب وبركة في الوقت.",
  "اللهم ارزقنا الثبات وحسن الظن بك.",
  "اللهم إني أسألك العفو والعافية في الدنيا والآخرة.",
  "ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار.",
  "اللهم اغفر لي ولوالدي وللمؤمنين يوم يقوم الحساب.",
  "اللهم بارك لنا في يومنا واجعله خيراً على أهلنا وأحبابنا.",
  "يا حي يا قيوم برحمتك أستغيث، أصلح لي شأني كله ولا تكلني إلى نفسي طرفة عين.",
];

const initial: AppState = {
  users: seedUsers,
  posts: seedPosts,
  stories: seedStories,
  storyArchive: [],
  chats: [
    {
      id: QURAN_CHANNEL_ID,
      isGroup: true,
      isChannel: true,
      name: TARIQ_BOT_CHANNEL_NAME,
      avatar: "RT",
      members: [BOT_USER_ID],
      admins: [BOT_USER_ID],
      hosts: [BOT_USER_ID],
      messages: [
        {
          id: uid(),
          senderId: BOT_USER_ID,
          type: "text",
          content: "🤍 أهلاً بك — ستصلك أدعية وتذكيرات من وقت لآخر.",
          createdAt: Date.now() - 5 * 60_000,
        },
      ],
      theme: "quran-black",
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
    },
  ],
  stickers: [],
  notifications: [],
  mediaNotes: [],
  currentUserId: null,
  accountIds: [],
  theme: "light",
  language: "ar",
};

const devSeedBundle: DevSeedBundle = {
  users: seedUsers,
  posts: seedPosts,
  stories: seedStories,
  stickers: initial.stickers,
  quranChat: initial.chats[0]!,
};

/** يزيل المتابعة وطلبات المتابعة بين محظور ومحظور */
function applyBlockedSocialFiltersToUsers(users: User[]): User[] {
  const byId = new Map(users.map(u => [u.id, { ...u }]));
  for (const u of users) {
    for (const bid of u.blocked || []) {
      const me = byId.get(u.id);
      const other = byId.get(bid);
      if (!me) continue;
      me.following = (me.following || []).filter(id => id !== bid);
      me.followers = (me.followers || []).filter(id => id !== bid);
      me.followRequestOut = (me.followRequestOut || []).filter(id => id !== bid);
      me.followRequestIn = (me.followRequestIn || []).filter(id => id !== bid);
      if (other) {
        other.following = (other.following || []).filter(id => id !== u.id);
        other.followers = (other.followers || []).filter(id => id !== u.id);
        other.followRequestOut = (other.followRequestOut || []).filter(id => id !== u.id);
        other.followRequestIn = (other.followRequestIn || []).filter(id => id !== u.id);
      }
    }
  }
  return [...byId.values()];
}

/**
 * يضمن وجود الحسابات والقنوات المدمجة (بوت القرآن وقناة القرآن)
 * ويزيل أي أثر للحساب المدمج القديم `u_t_account` (@t) من الحالة المحفوظة.
 */
export function normalizePersistedAppState(merged: AppState): AppState {
  let m = stripLegacyFounderFromState({
    ...merged,
    users: Array.isArray(merged.users) ? [...merged.users] : [...seedUsers],
    chats: Array.isArray(merged.chats) ? [...merged.chats] : [...initial.chats],
    mediaNotes: merged.mediaNotes || [],
  });

  if (!m.users.some((u) => u.id === BOT_USER_ID)) {
    m.users = [...m.users, seedUsers.find((u) => u.id === BOT_USER_ID)!];
  }
  if (!m.users.some((u) => u.id === OFFICIAL_APP_ACCOUNT_ID)) {
    m.users = [...m.users, seedUsers.find((u) => u.id === OFFICIAL_APP_ACCOUNT_ID)!];
  }
  if (!m.chats.some((c) => c.id === QURAN_CHANNEL_ID)) {
    m.chats = [...initial.chats.filter((c) => c.id === QURAN_CHANNEL_ID), ...m.chats];
  }

  m.chats = m.chats.map((c) => {
    let cc = normalizeChatRecord(c);
    if (cc.id === QURAN_CHANNEL_ID) {
      const seenBotText = new Set<string>();
      cc = {
        ...cc,
        name: TARIQ_BOT_CHANNEL_NAME,
        messages: cc.messages.filter((m) => {
          if (m.senderId !== BOT_USER_ID) return true;
          if (isBotSpamContent(m.content)) return false;
          const key = m.content.trim().slice(0, 120);
          if (seenBotText.has(key)) return false;
          seenBotText.add(key);
          return true;
        }),
      };
    }
    if (cc.isChannel && !cc.createdByUserId && cc.admins?.length && cc.id !== QURAN_CHANNEL_ID) {
      cc = { ...cc, createdByUserId: cc.admins[0] };
    }
    return cc;
  });
  m.users = m.users.map((u) =>
    u.id === BOT_USER_ID
      ? { ...u, bio: "بوت طارق رمدي — أدعية وتذكير" }
      : u,
  );
  const channelIdsByCreator = new Map<ID, ID[]>();
  for (const c of m.chats) {
    if (c.isChannel && c.createdByUserId && c.id !== QURAN_CHANNEL_ID) {
      const list = channelIdsByCreator.get(c.createdByUserId) || [];
      list.push(c.id);
      channelIdsByCreator.set(c.createdByUserId, list);
    }
  }
  m.posts = (Array.isArray(m.posts) ? m.posts : []).map((p) => ({
    ...p,
    likes: Array.isArray(p.likes) ? p.likes : [],
    reposts: Array.isArray(p.reposts) ? p.reposts : [],
    comments: Array.isArray(p.comments) ? p.comments : [],
    text: typeof p.text === "string" ? p.text : "",
    createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
  }));
  m.notifications = (Array.isArray(m.notifications) ? m.notifications : []).filter(n => n.type !== "message");
  m.chats = Array.isArray(m.chats) ? m.chats : [];
  m.stories = Array.isArray(m.stories) ? m.stories : [];
  const now72h = Date.now() - 72 * 60 * 60 * 1000;
  const normalizeStoryRow = (st: StoryItem): StoryItem => {
    const createdAt =
      typeof st.createdAt === "number" ? st.createdAt : Date.parse(String(st.createdAt ?? "")) || Date.now();
    return {
      ...st,
      createdAt,
      likes: Array.isArray(st.likes) ? st.likes : [],
      viewedByUserIds: Array.isArray(st.viewedByUserIds) ? st.viewedByUserIds : [],
      stickers: cleanStoryStickersForLegacyUser(st.stickers, m.language === "en" ? "en" : "ar"),
    };
  };
  const storyIsExpired = (st: StoryItem): boolean => {
    const hours = typeof st.expiryHours === "number" && [24, 48, 72].includes(st.expiryHours)
      ? st.expiryHours
      : 24;
    return st.createdAt <= Date.now() - hours * 60 * 60 * 1000;
  };
  const activeStories: StoryItem[] = [];
  const migrateToArchive: StoryItem[] = [];
  for (const st of m.stories) {
    const row = normalizeStoryRow(st);
    if (row.createdAt <= now72h) {
      if (m.currentUserId && row.userId === m.currentUserId) migrateToArchive.push(row);
    } else if (!storyIsExpired(row)) {
      activeStories.push(row);
    } else if (m.currentUserId && row.userId === m.currentUserId) {
      migrateToArchive.push(row);
    }
  }
  const archiveById = new Map<string, StoryItem>();
  for (const st of [...(m.storyArchive || []), ...migrateToArchive]) {
    if (!st?.id) continue;
    archiveById.set(st.id, normalizeStoryRow(st));
  }
  m.stories = activeStories;
  m.storyArchive = [...archiveById.values()].sort((a, b) => b.createdAt - a.createdAt);

  m.users = m.users.map((u) => {
    const noteActive = isProfileNoteActive(u);
    return {
    ...u,
    username: typeof u.username === "string" ? u.username : "user",
    email: typeof u.email === "string" ? u.email : "",
    bio: typeof u.bio === "string" ? u.bio : "",
    note: noteActive ? u.note : "",
    noteAt: noteActive ? u.noteAt : undefined,
    avatar: typeof u.avatar === "string" && u.avatar ? u.avatar : DEFAULT_AVATAR_DATA_URI,
    password: typeof u.password === "string" ? u.password : "",
    followers: Array.isArray(u.followers) ? u.followers : [],
    following: Array.isArray(u.following) ? u.following : [],
    blocked: Array.isArray(u.blocked) ? u.blocked : [],
    closeFriends: Array.isArray(u.closeFriends) ? u.closeFriends : [],
    favorites: u.favorites || [],
    favoriteStickerContents: u.favoriteStickerContents || [],
    createdStickerContents: u.createdStickerContents || [],
    profileViews: u.profileViews || [],
    shareProfileVisitActivity: u.shareProfileVisitActivity !== false,
    showLikesAndFavoritesOnProfile: u.showLikesAndFavoritesOnProfile !== false,
    hideFollowListsFromOthers: u.hideFollowListsFromOthers === true,
    isPrivate: u.isPrivate === true,
    followRequestIn: u.followRequestIn || [],
    followRequestOut: u.followRequestOut || [],
    pinnedChatIds: u.pinnedChatIds || [],
    mutedChatIds: u.mutedChatIds || [],
    publicChannelIds: Array.from(
      new Set([...(u.publicChannelIds || []), ...(channelIdsByCreator.get(u.id) || [])]),
    ),
    highlights: (u.highlights || []).map((h: any) => ({
      ...h,
      slides: Array.isArray(h.slides) ? h.slides : [],
      coverImage: h.coverImage,
    })),
    profileLink: u.profileLink ?? "",
    phone: typeof u.phone === "string" && u.phone.trim() ? u.phone.trim() : undefined,
    allowStoryReplies: u.allowStoryReplies !== false,
    verified: u.verified === true,
    isSubscribed: u.isSubscribed === true,
    subscriptionPlan: typeof u.subscriptionPlan === "string" ? u.subscriptionPlan : "",
    subscriptionExpiresAt: typeof u.subscriptionExpiresAt === "string" ? u.subscriptionExpiresAt : undefined,
    verificationStatus: (u.verificationStatus === "none" || u.verificationStatus === "pending" || u.verificationStatus === "approved" || u.verificationStatus === "rejected") ? u.verificationStatus : "none",
    verificationBadgeColor: u.verificationBadgeColor === "pink" ? "pink" : "blue",
    canUseAnimatedAvatar: u.canUseAnimatedAvatar === true,
    storyMaxDuration: typeof u.storyMaxDuration === "number" ? u.storyMaxDuration : 30,
    storyExpiryOptions: Array.isArray(u.storyExpiryOptions) && u.storyExpiryOptions.length > 0 ? u.storyExpiryOptions : [24],
    postCharacterLimit: typeof u.postCharacterLimit === "number" && u.postCharacterLimit > 0 ? u.postCharacterLimit : 300,
    founderVerified: u.founderVerified === true,
    founderOfficialLabel:
      typeof u.founderOfficialLabel === "string" ? u.founderOfficialLabel : undefined,
    appOfficialVerified: u.appOfficialVerified === true,
    appOfficialLabel:
      typeof u.appOfficialLabel === "string" ? u.appOfficialLabel : undefined,
    supportOfficialVerified: u.supportOfficialVerified === true,
    supportOfficialLabel:
      typeof u.supportOfficialLabel === "string" ? u.supportOfficialLabel : undefined,
    };
  }).map((u: User) =>
    withSupportOfficialProfileFields(withOfficialAppProfileFields(withFounderProfileFields(u))),
  );
  m.stories = (m.stories || []).map((st: StoryItem) => {
    const createdAt =
      typeof st.createdAt === "number"
        ? st.createdAt
        : Date.parse(String(st.createdAt ?? "")) || Date.now();
    return {
    ...st,
    createdAt,
    likes: Array.isArray(st.likes) ? st.likes : [],
    viewedByUserIds: Array.isArray(st.viewedByUserIds) ? st.viewedByUserIds : [],
    stickers: Array.isArray(st.stickers)
      ? st.stickers.map((sk: StorySticker) => {
          if (sk.kind === "poll")
            return { ...sk, votesLeft: sk.votesLeft || [], votesRight: sk.votesRight || [] };
          if (sk.kind === "quiz") return { ...sk, answers: sk.answers || {} };
          if (sk.kind === "slider") return { ...sk, ratings: sk.ratings || {} };
          return sk;
        })
      : undefined,
  };
  });
  m.storyArchive = (m.storyArchive || []).map((st: StoryItem) => {
    const createdAt =
      typeof st.createdAt === "number"
        ? st.createdAt
        : Date.parse(String(st.createdAt ?? "")) || Date.now();
    return {
      ...st,
      createdAt,
      likes: Array.isArray(st.likes) ? st.likes : [],
      viewedByUserIds: Array.isArray(st.viewedByUserIds) ? st.viewedByUserIds : [],
      stickers: Array.isArray(st.stickers)
        ? st.stickers.map((sk: StorySticker) => {
            if (sk.kind === "poll")
              return { ...sk, votesLeft: sk.votesLeft || [], votesRight: sk.votesRight || [] };
            if (sk.kind === "quiz") return { ...sk, answers: sk.answers || {} };
            if (sk.kind === "slider") return { ...sk, ratings: sk.ratings || {} };
            return sk;
          })
        : undefined,
    };
  });
  m.theme = readDeviceTheme();
  if (m.currentUserId && !isGuestUserId(m.currentUserId)) {
    m = {
      ...m,
      accountIds: snapshotAccountIdsForOwner(m.currentUserId),
      users: stripOtherOwnedAccountsFromUsers(m.currentUserId, m.users),
    };
  }

  m = { ...m, users: applyBlockedSocialFiltersToUsers(m.users) };

  return m;
}

export function readPersistedAppState(): AppState {
  return loadState();
}

function userFromApiAuth(user: ApiAuthUser): User {
  return mkUser({
    id: user.id,
    username: user.username,
    email: user.email,
    password: "",
    avatar: user.avatar || DEFAULT_AVATAR_DATA_URI,
  });
}

function ensureAuthUserInState(state: AppState, userId: ID, apiUser?: ApiAuthUser): AppState {
  let users = Array.isArray(state.users) ? [...state.users] : [];
  if (apiUser && !users.some(u => u.id === userId)) {
    users.push(userFromApiAuth(apiUser));
  }
  return normalizePersistedAppState({
    ...state,
    users,
    currentUserId: state.currentUserId || userId,
    accountIds: snapshotAccountIdsForOwner(userId),
  });
}

function notifyAccountSwitchFailed(message: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_SWITCH_FAILED_EVENT, { detail: { message } }),
    );
  } catch {
    /* ignore */
  }
}

function hydrateSwitchedAccountState(
  userId: ID,
  base: AppState,
  remote?: AppState | null,
): AppState {
  const meta = getAccountSession(userId);
  const apiUser = meta
    ? {
        id: userId,
        username: meta.username,
        email: meta.email,
        avatar: meta.avatar,
      }
    : undefined;
  try {
    let next = remote
      ? refreshOwnedUsersInState(
          buildMultiAccountState(userId, remote, base, undefined, { serverAuthoritative: true }),
        )
      : refreshOwnedUsersInState(
          reconcileOwnedAccountProfiles(
            ensureAuthUserInState(
              scopeAppStateToAccount(userId, { ...base, currentUserId: userId }),
              userId,
              apiUser,
            ),
          ),
        );
    next = scopeAppStateToAccount(userId, next, {
      accountIds: snapshotAccountIdsForOwner(userId),
      isolateOwnedUsers: (ownerId, st) => isolateUsersForAccountCache(ownerId, st),
    });
    saveAccountStateCache(userId, next);
    return next;
  } catch (e) {
    console.warn("[Retweet] hydrateSwitchedAccountState failed", e);
    const fallback = refreshOwnedUsersInState(
      reconcileOwnedAccountProfiles(
        ensureAuthUserInState(
          scopeAppStateToAccount(userId, { ...base, currentUserId: userId }),
          userId,
          apiUser,
        ),
      ),
    );
    saveAccountStateCache(userId, fallback);
    return fallback;
  }
}

function safeNormalizeState(raw: AppState): AppState {
  try {
    return normalizePersistedAppState(raw);
  } catch (e) {
    console.warn("[Retweet] normalizePersistedAppState failed, using initial:", e);
    return normalizePersistedAppState(initial);
  }
}

function loadState(): AppState {
  if (typeof window === "undefined") return initial;
  try {
    pruneStaleAccountSessions();
  } catch { /* ignore */ }
  try {
    runChatIsolationMigration();
  } catch { /* ignore */ }
  try {
    repairDevLocalStorageOnce(STORAGE_KEY, devSeedBundle, normalizePersistedAppState, initial);
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return safeNormalizeState(initial);
    const parsed = JSON.parse(raw);
    const merged = { ...initial, ...parsed } as AppState;
    let lastActive: string | null = null;
    try {
      lastActive = getLastActiveUserId();
      if (lastActive && getAccountSession(lastActive)?.token) {
        activateAccountSession(lastActive);
      }
    } catch { /* ignore */ }
    const scopeUid =
      lastActive && getAccountSession(lastActive)?.token
        ? lastActive
        : merged.currentUserId && !isGuestUserId(merged.currentUserId)
          ? merged.currentUserId
          : null;
    if (scopeUid) {
      try {
        const scoped = scopeAppStateToAccount(scopeUid, merged, {
          accountIds: snapshotAccountIdsForOwner(scopeUid),
          isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
        });
        return safeNormalizeState(scoped);
      } catch {
        return safeNormalizeState(merged);
      }
    }
    return safeNormalizeState(merged);
  } catch (e) {
    console.warn("[Retweet] loadState failed, using initial:", e);
    return safeNormalizeState(initial);
  }
}

const MAX_CHAT_MESSAGES_PERSIST = 120;

function trimChatForLocalPersist(chat: Chat): Chat {
  const msgs = chat.messages || [];
  if (msgs.length <= MAX_CHAT_MESSAGES_PERSIST) return chat;
  return { ...chat, messages: msgs.slice(-MAX_CHAT_MESSAGES_PERSIST) };
}

function scopeStateForAccountPersist(state: AppState, ownerId: ID): AppState {
  const scoped = scopeAppStateToAccount(ownerId, state, {
    accountIds: snapshotAccountIdsForOwner(ownerId),
    isolateOwnedUsers: (oid, s) => isolateUsersForAccountCache(oid, s),
  });
  return {
    ...scoped,
    chats: (scoped.chats || []).map(trimChatForLocalPersist),
  };
}

function resolveChatForSend(state: AppState, chatId: ID, userId: ID): Chat | null {
  for (const c of state.chats) {
    if (!c.members.includes(userId)) continue;
    if (c.id === chatId) return c;
    if (chatMergeKey(c, userId) === chatId) return c;
  }
  const parsed = parseDmChatId(chatId);
  if (parsed) {
    const peer = parsed[0] === userId ? parsed[1] : parsed[1] === userId ? parsed[0] : null;
    if (peer) {
      const dm = findDmChatForPeer(state.chats, userId, peer);
      if (dm) return dm;
    }
  }
  return null;
}

async function flushAccountSnapshotToServer(
  ownerId: ID,
  state: AppState,
  token: string,
): Promise<void> {
  if (!ownerId || isGuestUserId(ownerId) || !token) return;
  const scoped = scopeStateForAccountPersist(state, ownerId);
  saveAccountStateCache(ownerId, stripGuestFromPersistedState(scoped));
  await pushRemoteAppState(token, scoped);
}

async function flushCurrentAccountToServer(state: AppState): Promise<void> {
  const cur = state.currentUserId;
  if (!cur || isGuestUserId(cur)) return;
  const token = getApiToken();
  if (!token) return;
  syncActiveApiToken(cur, token);
  await flushAccountSnapshotToServer(cur, state, token);
}

function mergeStoryLists(...lists: StoryItem[][]): StoryItem[] {
  const byId = new Map<string, StoryItem>();
  const cutoff = Date.now() - STORY_TTL_MS;
  for (const list of lists) {
    for (const st of list) {
      if (!st?.id || !st.userId) continue;
      const createdAt =
        typeof st.createdAt === "number"
          ? st.createdAt
          : Date.parse(String(st.createdAt ?? "")) || 0;
      if (createdAt <= cutoff) continue;
      const norm = { ...st, createdAt };
      const prev = byId.get(norm.id);
      if (!prev || norm.createdAt >= prev.createdAt) byId.set(norm.id, norm);
    }
  }
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function buildMultiAccountState(
  activeUserId: ID,
  primary: AppState,
  previous: AppState,
  apiUser?: ApiAuthUser,
  opts?: { serverAuthoritative?: boolean },
): AppState {
  const resolvedId = activeUserId || primary.currentUserId || previous.currentUserId || "";
  if (!resolvedId) {
    logAuthRoute("build-state-no-user-id", { activeUserId, primaryId: primary.currentUserId });
    return normalizePersistedAppState({ ...primary, users: primary.users ?? [] });
  }
  const ownedOnDevice = new Set(listAccountSessions().map(s => s.userId));
  let primaryNorm = ensureAuthUserInState(
    { ...primary, currentUserId: primary.currentUserId || resolvedId },
    resolvedId,
    apiUser,
  );
  const sources: AppState[] = [];
  const activeCache = loadAccountStateCache(resolvedId);
  if (activeCache) sources.push(activeCache);
  if (previous.currentUserId === resolvedId) {
    sources.push(previous);
  }
  sources.push(primaryNorm);
  const accountUsers = mergeUsersForAccounts([resolvedId], sources);
  const serverMe = primaryNorm.users.find(u => u.id === resolvedId);
  const directoryById = new Map<ID, User>();
  for (const src of sources) {
    for (const u of src.users || []) {
      if (ownedOnDevice.has(u.id)) continue;
      const prev = directoryById.get(u.id);
      directoryById.set(u.id, prev ? mergeUserFromServer(prev, u) : { ...u, password: "" });
    }
  }
  const usersById = new Map<ID, User>(directoryById);
  for (const u of accountUsers) {
    const prev = usersById.get(u.id);
    let merged = prev ? mergeUserFromServer(prev, u) : u;
    if (serverMe && u.id === resolvedId) {
      merged = applyAuthoritativeProfile(merged, serverMe);
    }
    usersById.set(u.id, merged);
  }
  if (serverMe && !usersById.has(resolvedId)) {
    usersById.set(resolvedId, { ...serverMe, password: "" });
  }
  const mergedStories = mergeStoryLists(
    primaryNorm.stories || [],
    ...(activeCache?.stories ? [activeCache.stories] : []),
  );

  const chatsById = new Map<ID, Chat>();
  const absorbChat = (raw: Chat, opts?: { serverAuthoritative?: boolean }) => {
    const scoped = scopeAppStateToAccount(resolvedId, {
      ...primaryNorm,
      chats: [normalizeChatRecord(raw)],
    }).chats[0];
    if (!scoped) return;
    const key = chatMergeKey(scoped, resolvedId);
    const prev = chatsById.get(key);
    chatsById.set(
      key,
      prev
        ? {
            ...prev,
            ...scoped,
            id: key,
            members:
              scoped.isGroup || scoped.isChannel
                ? scoped.members.length >= prev.members.length
                  ? scoped.members
                  : Array.from(new Set([...prev.members, ...scoped.members]))
                : scoped.members,
            messages: mergeChatMessages(prev.messages, scoped.messages || []),
            hiddenMessageIdsByUser: opts?.serverAuthoritative
              ? scoped.hiddenMessageIdsByUser
              : mergeHiddenMessageIdsByUser(
                  prev.hiddenMessageIdsByUser,
                  scoped.hiddenMessageIdsByUser,
                  resolvedId,
                ),
          }
        : { ...scoped, id: key },
    );
  };
  const seedChatForMerge = (raw: Chat) => {
    const scoped = scopeAppStateToAccount(resolvedId, {
      ...primaryNorm,
      chats: [normalizeChatRecord(raw)],
    }).chats[0];
    if (!scoped || !scoped.members.includes(resolvedId)) return;
    const key = chatMergeKey(scoped, resolvedId);
    const prev = chatsById.get(key);
    chatsById.set(
      key,
      prev
        ? {
            ...prev,
            ...scoped,
            id: key,
            messages: mergeChatMessages(prev.messages, scoped.messages || []),
          }
        : { ...scoped, id: key },
    );
  };
  if (opts?.serverAuthoritative) {
    if (activeCache) {
      for (const c of activeCache.chats || []) seedChatForMerge(c);
    }
    if (previous.currentUserId === resolvedId) {
      for (const c of previous.chats || []) seedChatForMerge(c);
    }
  } else {
    if (activeCache) {
      for (const c of activeCache.chats || []) absorbChat(c);
    }
    if (previous.currentUserId === resolvedId) {
      for (const c of previous.chats || []) absorbChat(c);
    }
  }
  for (const c of primaryNorm.chats || []) {
    if (c.members.includes(resolvedId)) absorbChat(c, { serverAuthoritative: true });
  }

  const scopedNotifications = (primaryNorm.notifications || []).filter(
    n => n.userId === resolvedId,
  );

  const localPostSources: Post[] = [];
  if (!opts?.serverAuthoritative) {
    if (previous.currentUserId === resolvedId) localPostSources.push(...(previous.posts || []));
    if (activeCache?.posts?.length) localPostSources.push(...activeCache.posts);
  }
  const localPostsById = new Map<ID, Post>();
  for (const p of localPostSources) localPostsById.set(p.id, p);
  const mergedPosts = opts?.serverAuthoritative
    ? mergePostsServerAuthoritative([...localPostsById.values()], primaryNorm.posts || [])
    : mergePostsPreservingLocalDeletes([...localPostsById.values()], primaryNorm.posts || []);

  return scopeAppStateToAccount(
    resolvedId,
    reconcileOwnedAccountProfiles(
      ensureAuthUserInState(
        normalizePersistedAppState({
          ...primaryNorm,
          currentUserId: resolvedId,
          accountIds: snapshotAccountIdsForOwner(resolvedId),
          users: stripOtherOwnedAccountsFromUsers(resolvedId, [...usersById.values()]),
          posts: mergedPosts,
          stories: mergedStories,
          chats: [...chatsById.values()],
          notifications: scopedNotifications,
        }),
        resolvedId,
        apiUser,
      ),
    ),
    {
      accountIds: snapshotAccountIdsForOwner(resolvedId),
      isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
    },
  );
}

async function applyApiAuthSuccess(
  token: string,
  user: ApiAuthUser,
  previous: AppState,
  addAccount: boolean,
): Promise<{ ok: true; state: AppState } | { ok: false; error: string }> {
  if (addAccount && previous.currentUserId && !isGuestUserId(previous.currentUserId)) {
    await flushCurrentAccountToServer(previous);
  }

  upsertAccountSession({
    userId: user.id,
    token,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
  });
  setLastActiveUserId(user.id);
  setApiToken(token);

  const remote = await pullRemoteAppState(token);
  if (!remote) {
    if (addAccount && previous.currentUserId) {
      const prev = getAccountSession(previous.currentUserId);
      setApiToken(prev?.token ?? null);
    } else {
      setApiToken(null);
    }
    return { ok: false, error: "تعذر تحميل الحساب من الخادم" };
  }

  let next = buildMultiAccountState(user.id, remote, previous, user, { serverAuthoritative: true });
  const directory = await apiFetchUserDirectory();
  if (directory.length) {
    const byId = new Map(next.users.map((u) => [u.id, u]));
    for (const row of directory) {
      if (isGuestUserId(row.id)) continue;
      const prev = byId.get(row.id);
      byId.set(row.id, mergeDirectoryUser(prev, row));
    }
    next = normalizePersistedAppState({ ...next, users: [...byId.values()] });
  }
  saveAccountStateCache(user.id, next);
  const { markServerHydrated } = await import("./remotePushGate");
  markServerHydrated(user.id, next);
  logAuthRoute("login-apply-success", {
    userId: user.id,
    currentUserId: next.currentUserId,
    usersCount: next.users.length,
    postsCount: next.posts?.length ?? 0,
  });
  return { ok: true, state: next };
}

interface Ctx {
  state: AppState;
  setState: (updater: (s: AppState) => AppState) => void;
  currentUser: User | null;
  signup: (data: {
    email: string;
    username: string;
    password: string;
    code?: string;
    phone?: string;
  }) => Promise<{ ok: boolean; error?: string; userId?: string }>;
  /** username = اليوزر أو الإيميل */
  login: (data: {
    username: string;
    password: string;
  }) => Promise<{
    ok: boolean;
    error?: string;
    requiresOtp?: boolean;
    emailHint?: string;
    otpReason?: string;
  }>;
  verifyLogin: (data: { username: string; code: string }) => Promise<{ ok: boolean; error?: string }>;
  resetPasswordForUser: (
    userId: ID,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  requestPasswordResetRemote: (
    identifier: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
    method?: "code";
    message?: string;
  }>;
  completePasswordResetRemote: (
    identifier: string,
    code: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  completePasswordResetLink: (
    token: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  changeOwnPassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  switchAccount: (userId: ID) => Promise<void>;
  /** شاشة عزل أثناء تبديل الحساب — تمنع التفاعل مع واجهة قديمة */
  accountSwitching: boolean;
  /** مفتاح إعادة mount للواجهة بعد التبديل */
  accountSessionKey: string;
  removeAccount: (userId: ID) => void;
  updateProfile: (
    patch: Partial<User>,
    opts?: { commitRemote?: boolean; skipRemotePush?: boolean },
  ) => void;
  toggleFollow: (userId: ID) => void;
  acceptFollowRequest: (fromId: ID) => void;
  declineFollowRequest: (fromId: ID) => void;
  joinChannel: (chatId: ID) => void;
  toggleBlock: (userId: ID) => void;
  toggleBlockWithSync: (userId: ID) => Promise<{ ok: true } | { ok: false; error: string }>;
  toggleCloseFriend: (userId: ID) => void;
  createPost: (p: { type: Post["type"]; text: string; image?: string; video?: string; audio?: string }) => void;
  toggleLike: (postId: ID) => void;
  toggleStoryLike: (storyId: ID) => void;
  /** تسجيل أن المستخدم الحالي شاهد ستوري شخص آخر (مرة واحدة لكل ستوري) */
  recordStoryView: (storyId: ID) => void;
  toggleFavorite: (postId: ID) => void;
  touchQuranBot: () => void;
  toggleRepost: (postId: ID) => void;
  addComment: (postId: ID, text: string) => void;
  deleteComment: (postId: ID, commentId: ID) => void;
  deletePost: (postId: ID) => void;
  deleteStory: (storyId: ID) => void;
  addStory: (
    image: string,
    audience?: "all" | "close",
    stickers?: StorySticker[],
    video?: string,
    expiryHours?: number,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  addGroupMembers: (chatId: ID, memberIds: ID[]) => void;
  setGroupNickname: (chatId: ID, nickname: string) => void;
  voteStoryPoll: (storyId: ID, stickerId: ID, side: "left" | "right") => void;
  answerStoryQuiz: (storyId: ID, stickerId: ID, optionIndex: number) => void;
  rateStorySlider: (storyId: ID, stickerId: ID, value: number) => void;
  addHighlight: (p: { title: string; cover: string; coverImage?: string; storyIds: ID[] }) => void;
  openOrCreateChat: (otherUserId: ID) => Chat | null;
  createGroup: (name: string, avatar: string, memberIds: ID[]) => Chat | null;
  createChannel: (name: string, avatar: string, memberIds: ID[]) => Chat | null;
  toggleHost: (chatId: ID, userId: ID) => void;
  leaveChat: (chatId: ID) => void;
  sendMessage: (
    chatId: ID,
    msg: Omit<Message, "id" | "senderId" | "createdAt">,
  ) => boolean;
  /** جلب رسائل محادثة من messages.json على الخادم ودمجها */
  loadChatMessages: (chatId: ID) => Promise<void>;
  /** بعد إغلاق معاينة «مرة واحدة» يُسجَّل أن هذا المستخدم استهلك الرسالة */
  markViewOnceOpened: (chatId: ID, messageId: ID) => void;
  /** إخفاء الرسالة عندك فقط (لا تُحذف من عند الآخرين) */
  hideMessageForMe: (chatId: ID, messageId: ID) => void;
  addMessageReaction: (chatId: ID, messageId: ID, emoji: string) => void;
  forwardMessage: (fromChatId: ID, targetChatId: ID, messageId: ID) => void;
  pinChatMessage: (chatId: ID, messageId: ID) => void;
  unpinChatMessage: (chatId: ID, messageId: ID) => void;
  addFavoriteStickerContent: (content: string) => void;
  addCreatedStickerContent: (content: string) => void;
  renameGroup: (chatId: ID, name: string) => void;
  updateGroupAvatar: (chatId: ID, avatar: string) => void;
  toggleGroupAdmin: (chatId: ID, userId: ID) => void;
  kickMember: (chatId: ID, userId: ID) => void;
  muteGroupMember: (chatId: ID, userId: ID, durationMinutes: number | null) => void;
  setGroupPublic: (chatId: ID, isPublic: boolean) => void;
  joinGroupByInviteCode: (
    code: string,
  ) => Promise<{ ok: true; chatId: ID; pending?: boolean } | { ok: false; error: string }>;
  respondGroupJoinRequest: (
    chatId: ID,
    userId: ID,
    action: "accept" | "reject",
  ) => void;
  acceptRequest: (chatId: ID) => void;
  deleteChat: (chatId: ID) => void;
  /** تثبيت/إلغاء تثبيت محادثة في أعلى قائمة الشات (لا يتأثر بترتيب آخر رسالة) */
  toggleChatListPin: (chatId: ID) => void;
  /** كتم/إلغاء كتم إشعارات رسائل محادثة معيّنة */
  toggleChatMute: (chatId: ID) => void;
  setNote: (text: string) => void;
  createSticker: (emoji: string, label: string) => void;
  markNotificationsRead: () => void;
  markNotificationRead: (id: ID) => void;
  addMediaNote: (kind: MediaNote["kind"], targetId: ID, text: string) => void;
  markChatOpened: (chatId: ID) => void;
  markChatRead: (chatId: ID) => void;
  /** معرّف الطرف الذي يكتب الآن في محادثة (DM) */
  typingUserByChatId: Record<ID, ID>;
  /** رد على نوت صديق: يفتح/يحدّث الخاص ويرسل رسالة فيها سياق النوت */
  replyToMediaNoteAsDm: (p: {
    noteAuthorId: ID;
    noteText: string;
    replyText: string;
    contentLabelAr: string;
  }) => { chatId: ID } | null;
  /** رد على نوت الصديق في شريط المحادثات (يظهر في الخاص) */
  replyToProfileNoteAsDm: (p: {
    friendId: ID;
    noteText: string;
    replyText: string;
  }) => { chatId: ID } | null;
  recordProfileVisit: (targetUserId: ID) => void;
  /** تصفّح بدون حساب — يظهر المحتوى للقراءة فقط */
  isGuest: boolean;
  enterGuestBrowseMode: () => void;
  exitGuestBrowseMode: () => void;
  /** إضافة حسابات وُجدت عبر البحث حتى يفتح ملفها الشخصي */
  mergeDiscoveredUsers: (users: Array<Pick<User, "id" | "username" | "avatar"> & Partial<User>>) => void;
  /** جلب كل الحسابات من users.json على الخادم ودمجها محلياً */
  refreshUserDirectory: () => Promise<void>;
  /** جلب الحالة من الخادم فوراً (متابعات، ستوريات، رسائل) */
  refreshFromServer: (opts?: { urgent?: boolean }) => void;
  refreshFeedFromServer: () => Promise<void>;
  /** منشورات بروفايل مستخدم آخر (أو ذاتك) من posts.json على الخادم */
  refreshProfilePostsFromServer: (profileUserId: ID) => Promise<void>;
  /** مسح الكاش المحلي للحساب ثم جلب أحدث نسخة من الخادم */
  hardResyncFromServer: () => Promise<{ ok: boolean; error?: string }>;
  refreshSocialRelation: (targetUserId: ID) => void;
}

const AppCtx = createContext<Ctx | null>(null);

// AppLanguageCtx re-exported from languageContext for backward compat
export { AppLanguageCtx } from "./languageContext";

function applySocialRelationToState(
  state: AppState,
  meId: ID,
  peerId: ID,
  rel: SocialRelation,
): AppState {
  const meRow = state.users.find(u => u.id === meId);
  if (meRow?.blocked.includes(peerId)) return state;

  const next: AppState = {
    ...state,
    users: state.users.map(u => {
      if (u.id === meId) {
        const following = rel.isFollowing
          ? [...new Set([...u.following.filter(x => x !== peerId), peerId])]
          : u.following.filter(x => x !== peerId);
        const followRequestOut = rel.pendingOut
          ? [...new Set([...(u.followRequestOut || []).filter(x => x !== peerId), peerId])]
          : (u.followRequestOut || []).filter(x => x !== peerId);
        const followRequestIn = rel.pendingIn
          ? [...new Set([...(u.followRequestIn || []).filter(x => x !== peerId), peerId])]
          : (u.followRequestIn || []).filter(x => x !== peerId);
        return { ...u, following, followRequestOut, followRequestIn };
      }
      if (u.id === peerId) {
        const hadMeInFollowers = u.followers.includes(meId);
        const listLooksIncomplete =
          typeof u.displayFollowerCount === "number" &&
          u.displayFollowerCount > u.followers.length;

        let followers: ID[];
        let displayFollowerCount = u.displayFollowerCount;

        if (listLooksIncomplete && typeof displayFollowerCount === "number") {
          followers = rel.isFollowing
            ? [...new Set([...u.followers.filter(x => x !== meId), meId])]
            : u.followers.filter(x => x !== meId);
          const hasMeInFollowersNow = followers.includes(meId);
          if (hasMeInFollowersNow && !hadMeInFollowers) displayFollowerCount += 1;
          else if (!hasMeInFollowersNow && hadMeInFollowers)
            displayFollowerCount = Math.max(0, displayFollowerCount - 1);
        } else {
          followers = rel.isFollowing
            ? [...new Set([...u.followers.filter(x => x !== meId), meId])]
            : u.followers.filter(x => x !== meId);
          const hasMeInFollowersNow = followers.includes(meId);
          if (typeof displayFollowerCount === "number") {
            if (hasMeInFollowersNow && !hadMeInFollowers) displayFollowerCount += 1;
            else if (!hasMeInFollowersNow && hadMeInFollowers)
              displayFollowerCount = Math.max(0, displayFollowerCount - 1);
          } else {
            displayFollowerCount = followers.length;
          }
        }

        const followRequestIn = rel.pendingOut
          ? [...new Set([...(u.followRequestIn || []).filter(x => x !== meId), meId])]
          : (u.followRequestIn || []).filter(x => x !== meId);
        const followRequestOut = rel.pendingIn
          ? [...new Set([...(u.followRequestOut || []).filter(x => x !== meId), meId])]
          : (u.followRequestOut || []).filter(x => x !== meId);
        const following = rel.isFollowedBy
          ? [...new Set([...u.following.filter(x => x !== meId), meId])]
          : u.following.filter(x => x !== meId);
        return { ...u, followers, followRequestIn, followRequestOut, following, displayFollowerCount };
      }
      return u;
    }),
  };
  const updatedPeer = next.users.find(u => u.id === peerId);
  if (updatedPeer) {
    patchPublicProfileSocial(peerId, {
      followers: updatedPeer.followers,
      following: updatedPeer.following,
      displayFollowerCount: updatedPeer.displayFollowerCount,
    });
  } else {
    const overlay = getPublicProfileOverlay(peerId);
    if (overlay && typeof overlay.displayFollowerCount === "number") {
      const hadMe = overlay.followers.includes(meId);
      let displayFollowerCount = overlay.displayFollowerCount;
      if (rel.isFollowing && !hadMe) displayFollowerCount += 1;
      else if (!rel.isFollowing && hadMe)
        displayFollowerCount = Math.max(0, displayFollowerCount - 1);
      patchPublicProfileSocial(peerId, { displayFollowerCount });
    }
  }
  return next;
}

function hasPendingFollowRequestFrom(state: AppState, meId: ID, fromId: ID): boolean {
  const inbox = state.users.find(u => u.id === meId)?.followRequestIn || [];
  if (inbox.includes(fromId)) return true;
  return state.notifications.some(
    n =>
      n.userId === meId &&
      n.fromId === fromId &&
      n.type === "friend_request" &&
      n.followRequestStatus !== "accepted" &&
      n.followRequestStatus !== "declined",
  );
}

function patchFollowRequestNotifications(
  state: AppState,
  meId: ID,
  fromId: ID,
  status: "accepted" | "declined",
): AppState {
  const text =
    status === "accepted"
      ? "لقد قبلت طلب المتابعة من هذا الحساب ✓"
      : "لقد رفضت طلب المتابعة من هذا الحساب";
  return {
    ...state,
    notifications: state.notifications.map(n =>
      n.userId === meId && n.fromId === fromId && n.type === "friend_request"
        ? { ...n, read: true, followRequestStatus: status, text }
        : n,
    ),
  };
}

function preserveResolvedFollowRequestNotifications(prev: AppState, next: AppState): AppState {
  const resolved = new Map(
    (prev.notifications || [])
      .filter(
        n =>
          n.type === "friend_request" &&
          (n.followRequestStatus === "accepted" || n.followRequestStatus === "declined"),
      )
      .map(n => [`${n.userId}:${n.fromId}`, n] as const),
  );
  if (resolved.size === 0) return next;
  return {
    ...next,
    notifications: (next.notifications || []).map(n => {
      if (n.type !== "friend_request") return n;
      const hit = resolved.get(`${n.userId}:${n.fromId}`);
      if (!hit) return n;
      return {
        ...n,
        followRequestStatus: hit.followRequestStatus,
        text: hit.text || n.text,
        read: hit.read || n.read,
      };
    }),
  };
}

function applyFollowToggleMode(
  state: AppState,
  meId: ID,
  targetId: ID,
  mode: SocialToggleMode,
): AppState {
  if (mode === "following") {
    return {
      ...state,
      users: state.users.map(u => {
        if (u.id === meId) {
          return {
            ...u,
            following: u.following.includes(targetId) ? u.following : [...u.following, targetId],
            followRequestOut: (u.followRequestOut || []).filter(x => x !== targetId),
          };
        }
        if (u.id === targetId) {
          return {
            ...u,
            followers: u.followers.includes(meId) ? u.followers : [...u.followers, meId],
            followRequestIn: (u.followRequestIn || []).filter(x => x !== meId),
          };
        }
        return u;
      }),
    };
  }
  if (mode === "unfollowed") {
    return {
      ...state,
      users: state.users.map(u => {
        if (u.id === meId) {
          return {
            ...u,
            following: u.following.filter(x => x !== targetId),
            followRequestOut: (u.followRequestOut || []).filter(x => x !== targetId),
          };
        }
        if (u.id === targetId) {
          return {
            ...u,
            followers: u.followers.filter(x => x !== meId),
            followRequestIn: (u.followRequestIn || []).filter(x => x !== meId),
          };
        }
        return u;
      }),
    };
  }
  if (mode === "requested") {
    return {
      ...state,
      users: state.users.map(u => {
        if (u.id === meId) {
          const out = u.followRequestOut || [];
          return {
            ...u,
            followRequestOut: out.includes(targetId) ? out : [...out, targetId],
          };
        }
        if (u.id === targetId) {
          const inn = u.followRequestIn || [];
          return {
            ...u,
            followRequestIn: inn.includes(meId) ? inn : [...inn, meId],
          };
        }
        return u;
      }),
    };
  }
  return {
    ...state,
    users: state.users.map(u => {
      if (u.id === meId) {
        return { ...u, followRequestOut: (u.followRequestOut || []).filter(x => x !== targetId) };
      }
      if (u.id === targetId) {
        return { ...u, followRequestIn: (u.followRequestIn || []).filter(x => x !== meId) };
      }
      return u;
    }),
  };
}

/** انتهاء مؤشر «يكتب» محلياً إذا ضاع حدث التوقف */
const typingIndicatorTimersRef = new Map<string, ReturnType<typeof setTimeout>>();

export function AppProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: AppState;
}) {
  const [state, setStateRaw] = useState<AppState>(() => {
    try {
      const loaded = initialState ?? loadState();
      const uid = loaded.currentUserId;
      const base =
        uid && !isGuestUserId(uid)
          ? scopeAppStateToAccount(uid, loaded, {
              accountIds: snapshotAccountIdsForOwner(uid),
              isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
            })
          : loaded;
      return reconcileOwnedAccountProfiles(base);
    } catch (e) {
      console.warn("[Retweet] AppProvider init failed, using empty state:", e);
      return safeNormalizeState(initial);
    }
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const [accountSwitching, setAccountSwitching] = useState(false);
  const [accountSessionKey, setAccountSessionKey] = useState(
    () => `sess-${state.currentUserId || "guest"}-0`,
  );
  const [typingUserByChatId, setTypingUserByChatId] = useState<Record<ID, ID>>({});

  const pushSnapshotNow = useCallback((next: AppState) => {
    if (!apiBackendEnabled()) return;
    if (hydrateRemoteBusy.current) return;
    const token = getApiToken();
    const uid = next.currentUserId;
    if (!token || !uid || isGuestUserId(uid)) return;
    void pushRemoteAppState(token, next);
  }, []);

  const socialSyncBusyRef = useRef(false);
  const groupSyncBusyRef = useRef(false);
  const messageSendBusyRef = useRef(false);
  const storyPublishBusyRef = useRef(false);
  const profileSaveBusyRef = useRef(false);
  const hydrateRemoteBusy = useRef(false);
  const skipNextAutoPushRef = useRef(false);
  const lastFullPullAtRef = useRef(0);
  const fullPullPendingRef = useRef(false);
  const fullPullTimerRef = useRef<number | null>(null);
  const remoteSyncTimerRef = useRef<number | null>(null);
  const MIN_FULL_PULL_MS = 8_000;
  const MIN_URGENT_PULL_MS = 600;
  const feedPullDebounceRef = useRef<number | null>(null);
  const urgentPullRef = useRef(false);

  const pullSocialState = useCallback(async () => {
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    const activeId = stateRef.current.currentUserId;
    if (!token || !activeId || isGuestUserId(activeId)) return;
    const remote = await pullRemoteAppState(token);
    if (!remote) return;
    setStateRaw(s =>
      preserveResolvedFollowRequestNotifications(
        s,
        buildMultiAccountState(activeId, remote, s, undefined, { serverAuthoritative: true }),
      ),
    );
  }, [setStateRaw]);

  const runFollowToggleApi = useCallback(
    (targetUserId: ID) => {
      void (async () => {
        await ensureApiRuntimeConfig();
        if (!apiBackendEnabled() || !getApiToken()) return;
        const meId = stateRef.current.currentUserId;
        if (!meId || isGuestUserId(meId)) return;
        activateAccountSession(meId);
        socialSyncBusyRef.current = true;
        try {
          const r = await apiToggleFollow(getApiToken()!, targetUserId);
          if (r.ok) {
            setStateRaw(s =>
              applyFollowToggleMode(
                applySocialRelationToState(s, meId, targetUserId, r.relation),
                meId,
                targetUserId,
                r.mode,
              ),
            );
          } else {
            console.warn("[Retweet] فشل المتابعة:", r.error);
            await pullSocialState();
          }
        } finally {
          window.setTimeout(() => {
            socialSyncBusyRef.current = false;
          }, 650);
        }
      })();
    },
    [pullSocialState, setStateRaw],
  );

  const runAcceptFollowApi = useCallback(
    (fromId: ID) => {
      void (async () => {
        await ensureApiRuntimeConfig();
        const token = getApiToken();
        const meId = stateRef.current.currentUserId;
        if (!apiBackendEnabled() || !token || !meId || isGuestUserId(meId)) return;
        activateAccountSession(meId);
        socialSyncBusyRef.current = true;
        try {
          const r = await apiAcceptFollowRequest(token, fromId);
          if (!r.ok) {
            console.warn("[Retweet] فشل قبول طلب المتابعة");
            await pullSocialState();
            return;
          }
          const rel = await apiGetSocialRelation(token, fromId);
          setStateRaw(s => {
            let next = s;
            if (rel.ok) next = applySocialRelationToState(next, meId, fromId, rel.relation);
            return patchFollowRequestNotifications(next, meId, fromId, "accepted");
          });
        } finally {
          window.setTimeout(() => {
            socialSyncBusyRef.current = false;
          }, 650);
        }
      })();
    },
    [pullSocialState, setStateRaw],
  );

  const runDeclineFollowApi = useCallback(
    (fromId: ID) => {
      void (async () => {
        await ensureApiRuntimeConfig();
        const token = getApiToken();
        const meId = stateRef.current.currentUserId;
        if (!apiBackendEnabled() || !token || !meId || isGuestUserId(meId)) return;
        activateAccountSession(meId);
        socialSyncBusyRef.current = true;
        try {
          const r = await apiDeclineFollowRequest(token, fromId);
          if (!r.ok) {
            console.warn("[Retweet] فشل رفض طلب المتابعة");
            await pullSocialState();
            return;
          }
          const rel = await apiGetSocialRelation(token, fromId);
          setStateRaw(s => {
            let next = rel.ok ? applySocialRelationToState(s, meId, fromId, rel.relation) : s;
            return patchFollowRequestNotifications(next, meId, fromId, "declined");
          });
        } finally {
          window.setTimeout(() => {
            socialSyncBusyRef.current = false;
          }, 650);
        }
      })();
    },
    [pullSocialState, setStateRaw],
  );

  useEffect(() => {
    const uid = state.currentUserId;
    if (uid && !isGuestUserId(uid)) {
      setLastActiveUserId(uid);
      ensureApiTokenMatchesUser(uid);
    }
  }, [state.currentUserId]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const write = () => {
        if (typeof document !== "undefined" && document.hidden) return;
        try {
          const uid = stateRef.current.currentUserId;
          const snap = stateRef.current;
          const toPersist =
            uid && !isGuestUserId(uid) ? scopeStateForAccountPersist(snap, uid) : snap;
          const stripped = stripGuestFromPersistedState(toPersist);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
          if (uid) saveAccountStateCache(uid, stripped);
        } catch (e) {
          if (e instanceof DOMException && e.name === "QuotaExceededError") {
            console.warn(
              "[Retweet] مساحة التخزين المحلي ممتلئة. صورة GIF كبيرة قد لا تُحفظ بعد التحديث — جرّب ملفاً أصغر أو صيغة أخف.",
            );
          }
        }
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(write, { timeout: 6000 });
      } else {
        write();
      }
    }, 4500);
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, [state]);

  /** عند وجود توكن خادم: جرّب جلب الحالة المحفوظة على الخادم بعد التحميل المحلي */
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    const restored = restoreActiveSessionOnLaunch();
    if (restored) {
      setStateRaw(s =>
        s.currentUserId === restored ? s : { ...s, currentUserId: restored },
      );
    }
    const token = getApiToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      hydrateRemoteBusy.current = true;
      try {
        const remote = await pullRemoteAppState(token);
        if (cancelled || !remote) return;
        const sessionIds = listAccountSessions().map((x) => x.userId);
        const sessionFallback = getLastActiveUserId() || sessionIds[0];
        setStateRaw((s) => {
          const activeId =
            getLastActiveUserId() ||
            s.currentUserId ||
            remote.currentUserId ||
            sessionFallback ||
            null;
          if (!activeId) {
            logAuthRoute("hydrate-skip-no-user", {
              localCurrentUserId: s.currentUserId,
              remoteCurrentUserId: remote.currentUserId,
            });
            return s;
          }
          const me = remote.users?.find((u) => u.id === activeId) ?? s.users.find((u) => u.id === activeId);
          if (me) {
            migrateLegacyApiToken(activeId, me.username, me.email);
            syncActiveApiToken(activeId, token);
          }
          const merged = buildMultiAccountState(activeId, remote, s, undefined, {
            serverAuthoritative: true,
          });
          const meRow = merged.users.find(u => u.id === activeId);
          const sess = meRow ? getAccountSession(activeId) : null;
          if (meRow && sess) {
            upsertAccountSession({
              ...sess,
              username: meRow.username,
              avatar: toStoredMediaRef(meRow.avatar),
            });
          }
          logAuthRoute("hydrate-remote", {
            activeId,
            usersCount: merged.users.length,
          });
          const normalized = normalizePersistedAppState({
            ...merged,
            accountIds: snapshotAccountIdsForOwner(activeId),
          });
          void import("./remotePushGate").then(({ markServerHydrated }) =>
            markServerHydrated(activeId, normalized),
          );
          return normalized;
        });
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) hydrateRemoteBusy.current = false;
      }
    })();
    return () => {
      cancelled = true;
      hydrateRemoteBusy.current = false;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (accountSwitching) return;
    if ((state.posts?.length ?? 0) >= 4) return;
    let cancelled = false;
    void (async () => {
      const { isDevApiDatabaseReachable } = await import("./devSeedRestore");
      if (cancelled) return;
      if (await isDevApiDatabaseReachable()) return;
      setStateRaw(s => {
        const next = mergeDevSeedIfNeeded(s, devSeedBundle);
        return next === s ? s : next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [state.posts?.length, state.currentUserId, accountSwitching, setStateRaw]);

  useEffect(() => {
    applyDeviceThemeToDom(state.theme === "dark" ? "dark" : "light");
    const root = document.documentElement;
    root.setAttribute("dir", state.language === "en" ? "ltr" : "rtl");
    root.setAttribute("lang", state.language);
  }, [state.theme, state.language]);

  /** توكن موجود لكن currentUser مفقود — إصلاح من الخادم دون إعادة توجيه لصفحة الدخول */
  const sessionRepairBusy = useRef(false);
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    if (!token) return;
    const uid = state.currentUserId;
    if (uid && state.users.some(u => u.id === uid)) return;
    if (sessionRepairBusy.current) return;

    let cancelled = false;
    sessionRepairBusy.current = true;
    logAuthRoute("session-repair-effect", { uid, usersCount: state.users.length });
    void (async () => {
      try {
        const remote = await pullRemoteAppState(token);
        if (cancelled || !remote) return;
        const sessions = listAccountSessions();
        const meta = sessions[0];
        setStateRaw(s => {
          const activeId = s.currentUserId || remote.currentUserId || meta?.userId || null;
          if (!activeId) return s;
          const apiUser: ApiAuthUser | undefined = meta
            ? {
                id: meta.userId,
                username: meta.username,
                email: meta.email,
                avatar: meta.avatar,
              }
            : undefined;
          return buildMultiAccountState(activeId, remote, s, apiUser, { serverAuthoritative: true });
        });
      } finally {
        if (!cancelled) sessionRepairBusy.current = false;
      }
    })();
    return () => {
      cancelled = true;
      sessionRepairBusy.current = false;
    };
  }, [state.currentUserId, state.users.length]);

  useEffect(() => {
    const storyExpiredForTick = (st: StoryItem): boolean => {
      const hours = typeof st.expiryHours === "number" && [24, 48, 72].includes(st.expiryHours)
        ? st.expiryHours
        : 24;
      return st.createdAt <= Date.now() - hours * 60 * 60 * 1000;
    };
    const tick = () => {
      setStateRaw((s) => {
        const ownerId = s.currentUserId;
        const toArchive: StoryItem[] = [];
        const nextStories = s.stories.filter((st) => {
          if (!storyExpiredForTick(st)) return true;
          if (ownerId && !isGuestUserId(ownerId) && st.userId === ownerId) {
            toArchive.push(st);
          }
          return false;
        });
        if (toArchive.length === 0 && nextStories.length === s.stories.length) return s;
        const archiveIds = new Set(toArchive.map((x) => x.id));
        const storyArchive = [
          ...toArchive,
          ...(s.storyArchive || []).filter((x) => !archiveIds.has(x.id)),
        ].sort((a, b) => b.createdAt - a.createdAt);
        const next = { ...s, stories: nextStories, storyArchive };
        const token = getApiToken();
        if (token && apiBackendEnabled()) void pushRemoteAppState(token, next);
        return next;
      });
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const setState = useCallback((updater: (s: AppState) => AppState) => setStateRaw(updater), []);

  const currentUser = useMemo(() => {
    const id = state.currentUserId;
    if (!id || isGuestUserId(id)) return null;
    const u = resolveUserProfile(state, id);
    return u ? withOfficialAppProfileFields(withFounderProfileFields(u)) : null;
  }, [state.users, state.currentUserId]);

  const isGuest = useMemo(
    () => !!(state.currentUserId && isGuestUserId(state.currentUserId)),
    [state.currentUserId],
  );

  const signup: Ctx["signup"] = async (data) => {
    const pwdErrFirst = validateNewPasswordPlain(data.password);
    if (pwdErrFirst) return { ok: false, error: pwdErrFirst };
    const phoneErr = validateOptionalPhone(data.phone ?? "");
    if (phoneErr) return { ok: false, error: phoneErr };
    const phoneNorm = normalizePhone(data.phone ?? "");
    if (apiBackendEnabled()) {
      const uNorm = normalizeUsername(data.username);
      const nameErr = validateUsernameFormat(uNorm);
      if (nameErr) return { ok: false, error: nameErr };
      const emailErr = validateEmailFormat(data.email);
      if (emailErr) return { ok: false, error: emailErr };
      const pwdErr = validateNewPasswordPlain(data.password);
      if (pwdErr) return { ok: false, error: pwdErr };
      const reg = await apiRegister(
        normalizeEmail(data.email),
        uNorm,
        data.password,
        data.code,
        phoneNorm || undefined,
      );
      if (!reg.ok) return { ok: false, error: reg.error };
      const adding =
        !!(stateRef.current.currentUserId && !isGuestUserId(stateRef.current.currentUserId));
      const applied = await applyApiAuthSuccess(reg.token, reg.user, stateRef.current, adding);
      if (!applied.ok) return { ok: false, error: applied.error };
      setStateRaw(applied.state);
      void import("./feedVisibility").then(({ requestAuthFeedRefresh }) => requestAuthFeedRefresh());
      return { ok: true, userId: reg.userId };
    }

    const u = normalizeUsername(data.username);
    const emailNorm = normalizeEmail(data.email);
    const emailErr = validateEmailFormat(data.email);
    if (emailErr) return { ok: false, error: emailErr };
    const pwdErr = validateNewPasswordPlain(data.password);
    if (pwdErr) return { ok: false, error: pwdErr };
    if (!u) return { ok: false, error: "بيانات ناقصة" };
    const nameErr = validateUsernameFormat(u);
    if (nameErr) return { ok: false, error: nameErr };
    if (isUsernameTaken(u, state.users)) return { ok: false, error: "اليوزر موجود" };
    if (state.users.some((x) => x.email.toLowerCase() === emailNorm))
      return { ok: false, error: "إيميل مسجل" };
    let hashed: string;
    try {
      hashed = await hashPassword(data.password);
    } catch {
      return { ok: false, error: "تعذر تأمين كلمة المرور في هذا الجهاز" };
    }
    const newUser: User = mkUser({
      id: "u_" + uid(),
      username: u,
      email: emailNorm,
      password: hashed,
      avatar: u.slice(0, 2).toUpperCase(),
      phone: phoneNorm || undefined,
    });
    setState((s) => ({
      ...s,
      users: [...s.users.filter((x) => !isGuestUserId(x.id)), newUser],
      currentUserId: newUser.id,
      accountIds: [newUser.id],
    }));
    return { ok: true, userId: newUser.id };
  };

  const login: Ctx["login"] = async ({ username, password }) => {
    const q = username.trim();
    if (apiBackendEnabled()) {
      const r = await apiLogin(q, password);
      if (!r.ok) return { ok: false, error: r.error };
      if ("requiresOtp" in r && r.requiresOtp) {
        return {
          ok: true,
          requiresOtp: true,
          emailHint: r.emailHint,
          otpReason: r.otpReason,
        };
      }
      const adding =
        !!(stateRef.current.currentUserId && !isGuestUserId(stateRef.current.currentUserId));
      const applied = await applyApiAuthSuccess(r.token, r.user, stateRef.current, adding);
      if (!applied.ok) return { ok: false, error: applied.error };
      setStateRaw(applied.state);
      void import("./feedVisibility").then(({ requestAuthFeedRefresh }) => requestAuthFeedRefresh());
      return { ok: true };
    }

    const u = state.users.find(
      (x) =>
        x.username.toLowerCase() === q.toLowerCase() || x.email.toLowerCase() === q.toLowerCase(),
    );
    if (!u) return { ok: false, error: "بيانات خاطئة" };
    let pv: Awaited<ReturnType<typeof verifyStoredPassword>>;
    try {
      pv = await verifyStoredPassword(u.password, password);
    } catch {
      return { ok: false, error: "بيانات خاطئة" };
    }
    if (!pv.ok) return { ok: false, error: "بيانات خاطئة" };
    if (pv.upgradeToHash) {
      setState((s) => ({
        ...s,
        users: s.users.map((x) => (x.id === u.id ? { ...x, password: pv.upgradeToHash! } : x)),
      }));
    }
    setState((s) => ({
      ...s,
      users: s.users.filter((x) => !isGuestUserId(x.id)),
      currentUserId: u.id,
      accountIds: [u.id],
    }));
    return { ok: true };
  };

  const verifyLogin: Ctx["verifyLogin"] = async ({ username, code }) => {
    const q = username.trim();
    if (!apiBackendEnabled()) return { ok: false, error: "الخادم غير مفعّل" };
    const r = await apiVerifyLogin(q, code);
    if (!r.ok) return { ok: false, error: r.error };
    const adding =
      !!(stateRef.current.currentUserId && !isGuestUserId(stateRef.current.currentUserId));
    const applied = await applyApiAuthSuccess(r.token, r.user, stateRef.current, adding);
    if (!applied.ok) return { ok: false, error: applied.error };
    setStateRaw(applied.state);
    void import("./feedVisibility").then(({ requestAuthFeedRefresh }) => requestAuthFeedRefresh());
    return { ok: true };
  };

  const resetPasswordForUser: Ctx["resetPasswordForUser"] = async (userId, newPassword) => {
    const pwdErr = validateNewPasswordPlain(newPassword);
    if (pwdErr) return { ok: false, error: pwdErr };
    const exists = state.users.some((x) => x.id === userId);
    if (!exists) return { ok: false, error: "تعذر إكمال الطلب" };
    let hashed: string;
    try {
      hashed = await hashPassword(newPassword);
    } catch {
      return { ok: false, error: "تعذر تأمين كلمة المرور" };
    }
    setState((s) => ({
      ...s,
      users: s.users.map((x) => (x.id === userId ? { ...x, password: hashed } : x)),
    }));
    return { ok: true };
  };

  const requestPasswordResetRemote: Ctx["requestPasswordResetRemote"] = async (identifier) => {
    if (!apiBackendEnabled()) return { ok: false, error: "الخادم غير مفعّل" };
    const r = await apiRequestPasswordReset(identifier);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      method: r.method,
      message: r.message,
    };
  };

  const completePasswordResetLink: Ctx["completePasswordResetLink"] = async (token, newPassword) => {
    if (!apiBackendEnabled()) return { ok: false, error: "الخادم غير مفعّل" };
    const pwdErr = validateNewPasswordPlain(newPassword);
    if (pwdErr) return { ok: false, error: pwdErr };
    const r = await apiCompletePasswordResetLink(token, newPassword);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  };

  const completePasswordResetRemote: Ctx["completePasswordResetRemote"] = async (
    identifier,
    code,
    newPassword,
  ) => {
    if (!apiBackendEnabled()) return { ok: false, error: "الخادم غير مفعّل" };
    const pwdErr = validateNewPasswordPlain(newPassword);
    if (pwdErr) return { ok: false, error: pwdErr };
    const r = await apiCompletePasswordReset(identifier, code, newPassword);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  };

  const changeOwnPassword: Ctx["changeOwnPassword"] = async (oldPassword, newPassword) => {
    if (apiBackendEnabled()) {
      const token = getApiToken();
      if (!token) return { ok: false, error: "غير متصل بالخادم" };
      if (!state.currentUserId || isGuestUserId(state.currentUserId))
        return { ok: false, error: "غير مسجّل" };
      const pwdErr = validateNewPasswordPlain(newPassword);
      if (pwdErr) return { ok: false, error: pwdErr };
      const r = await apiChangePassword(token, oldPassword, newPassword);
      if (!r.ok) return { ok: false, error: r.error };
      setState((s) => ({
        ...s,
        users: s.users.map((u) => (u.id === state.currentUserId ? { ...u, password: "" } : u)),
      }));
      return { ok: true };
    }

    if (!state.currentUserId || isGuestUserId(state.currentUserId))
      return { ok: false, error: "غير مسجّل" };
    const me = state.users.find((u) => u.id === state.currentUserId);
    if (!me) return { ok: false, error: "غير مسجّل" };
    const pwdErr = validateNewPasswordPlain(newPassword);
    if (pwdErr) return { ok: false, error: pwdErr };
    let v: Awaited<ReturnType<typeof verifyStoredPassword>>;
    try {
      v = await verifyStoredPassword(me.password, oldPassword);
    } catch {
      return { ok: false, error: "الباسورد الحالي خاطئ" };
    }
    if (!v.ok) return { ok: false, error: "الباسورد الحالي خاطئ" };
    let hashed: string;
    try {
      hashed = await hashPassword(newPassword);
    } catch {
      return { ok: false, error: "تعذر تأمين كلمة المرور" };
    }
    setState((s) => ({
      ...s,
      users: s.users.map((u) => (u.id === me.id ? { ...u, password: hashed } : u)),
    }));
    return { ok: true };
  };

  const switchAccount: Ctx["switchAccount"] = async (userId: ID) => {
    if (userId === stateRef.current.currentUserId) return;
    if (!isValidAccountSwitchTarget(userId)) {
      pruneStaleAccountSessions();
      notifyAccountSwitchFailed(
        "لا يمكن التبديل إلى هذا الحساب. سجّل الدخول إليه من الإعدادات أو أعد المحاولة.",
      );
      return;
    }

    const leavingId = stateRef.current.currentUserId;
    if (
      leavingId &&
      !isGuestUserId(leavingId) &&
      !isGuestUserId(userId) &&
      getAccountSession(userId)
    ) {
      setProfileTogglePeer(userId, leavingId);
    }
    const leavingSnapshot =
      leavingId && !isGuestUserId(leavingId)
        ? scopeStateForAccountPersist(stateRef.current, leavingId)
        : null;
    const leavingToken =
      leavingId && !isGuestUserId(leavingId) ? getAccountSession(leavingId)?.token : null;

    disconnectRealtimeSocketHard();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("retweet-reset-chat-ui"));
      window.dispatchEvent(
        new CustomEvent("retweet-account-switch-begin", { detail: { userId } }),
      );
    }
    setAccountSwitching(true);
    if (leavingSnapshot && leavingId) {
      saveAccountStateCache(leavingId, stripGuestFromPersistedState(leavingSnapshot));
    }
    if (leavingSnapshot && leavingToken && apiBackendEnabled()) {
      try {
        await flushAccountSnapshotToServer(leavingId!, leavingSnapshot, leavingToken);
      } catch {
        /* ignore */
      }
    }

    const prev = stateRef.current;
    setStateRaw(s => purgeStateForAccountSwitch(s, userId));

    const rollbackToLeaving = () => {
      if (!leavingId || !isValidAccountSwitchTarget(leavingId)) return;
      applyAccountSessionToken(leavingId);
      const leaveCache = loadAccountStateCache(leavingId);
      if (leaveCache) {
        setStateRaw(s =>
          hydrateSwitchedAccountState(
            leavingId,
            buildMultiAccountState(leavingId, leaveCache, { ...s, currentUserId: leavingId }),
            null,
          ),
        );
      } else {
        setStateRaw(s => scopeAppStateToAccount(leavingId, { ...s, currentUserId: leavingId }));
      }
    };

    let switchOk = false;
    try {
      if (apiBackendEnabled() && getAccountSession(userId)) {
        const token = applyAccountSessionToken(userId);
        if (!token) {
          rollbackToLeaving();
          notifyAccountSwitchFailed("جلسة الحساب غير صالحة — سجّل الدخول مرة أخرى.");
          return;
        }
        socialSyncBusyRef.current = false;
        if (remoteSyncTimerRef.current) {
          window.clearTimeout(remoteSyncTimerRef.current);
          remoteSyncTimerRef.current = null;
        }
        const cached = loadAccountStateCache(userId);
        const instantBase = cached
          ? buildMultiAccountState(userId, cached, {
              ...prev,
              currentUserId: userId,
              chats: [],
            })
          : prev;
        setStateRaw(s => hydrateSwitchedAccountState(userId, instantBase, null));

        const remote = await pullRemoteAppState(token);
        if (remote) {
          const remoteMe = remote.users?.find(u => u.id === userId);
          if (remoteMe) {
            const sess = getAccountSession(userId);
            if (sess) {
              upsertAccountSession({
                ...sess,
                username: remoteMe.username,
                email: remoteMe.email ?? sess.email,
                avatar: remoteMe.avatar ?? sess.avatar,
              });
            }
          }
          setStateRaw(s => hydrateSwitchedAccountState(userId, s, remote));
        }
        switchOk = true;
        return;
      }

      setState((s) => {
        let users = s.users;
        if (s.currentUserId && isGuestUserId(s.currentUserId) && !isGuestUserId(userId)) {
          users = users.filter((u) => !isGuestUserId(u.id));
        }
        return scopeAppStateToAccount(userId, { ...s, currentUserId: userId, users });
      });
      switchOk = true;
    } catch (e) {
      console.warn("[Retweet] switchAccount failed", e);
      rollbackToLeaving();
      notifyAccountSwitchFailed(
        "تعذّر تبديل الحساب. تحقق أن الخادم يعمل (npm run stack:reyweet) ثم أعد المحاولة.",
      );
    } finally {
      setAccountSessionKey(`sess-${userId}-${Date.now()}`);
      setAccountSwitching(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("retweet-account-switch-end", { detail: { userId } }),
        );
        if (switchOk && stateRef.current.currentUserId === userId) {
          emitAccountSwitchedEvent(userId);
        }
      }
    }
  };

  const logout = () => {
    disconnectRealtimeSocketHard();
    const leaving = stateRef.current.currentUserId;
    if (leaving && !isGuestUserId(leaving)) {
      removeAccountSession(leaving);
    }
    const remaining = listAccountSessions();
    if (remaining.length > 0 && apiBackendEnabled()) {
      void switchAccount(remaining[0]!.userId);
      return;
    }
    setApiToken(null);
    setState((s) => {
      const dropGuest = leaving && isGuestUserId(leaving);
      return {
        ...s,
        currentUserId: null,
        accountIds: [],
        users: dropGuest ? s.users.filter((u) => !isGuestUserId(u.id)) : s.users,
      };
    });
  };

  const removeAccount = (userId: ID) => {
    removeAccountSession(userId);
    setState((s) => {
      const remaining = listAccountSessions().map(x => x.userId);
      const switchTo = s.currentUserId === userId ? remaining[0] ?? null : s.currentUserId;
      return {
        ...s,
        accountIds: switchTo ? [switchTo] : [],
        currentUserId: switchTo,
        users: s.users.filter((u) => u.id !== userId),
      };
    });
    if (stateRef.current.currentUserId === userId) {
      const remaining = listAccountSessions();
      if (remaining[0]) void switchAccount(remaining[0].userId);
      else setApiToken(null);
    }
  };

  const updateProfile: Ctx["updateProfile"] = (patch, opts) => {
    let nextForRemote: AppState | null = null;
    const { password: _pw, ...patchNoPassword } = patch as Partial<User> & { password?: unknown };
    const avatarOnlyBusy =
      patchNoPassword.username == null &&
      patchNoPassword.avatar != null &&
      String(patchNoPassword.avatar).trim().length > 0;
    setStateRaw(s => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const { password: _ignoredPassword, ...safePatch } = patch as Partial<User> & {
        password?: unknown;
      };
      if (_ignoredPassword !== undefined && import.meta.env.DEV) {
        console.warn("[Retweet] تجاهل password في updateProfile — استخدم changeOwnPassword");
      }
      if (safePatch.username != null) {
        safePatch.username = normalizeUsername(String(safePatch.username));
        const curRow = s.users.find(u => u.id === s.currentUserId);
        const usernameUnchanged =
          !!curRow && safePatch.username === normalizeUsername(curRow.username);
        if (!usernameUnchanged) {
          const nameErr = validateUsernameFormat(safePatch.username, s.currentUserId);
          if (nameErr) {
            try {
              alert(nameErr);
            } catch {
              /* ignore */
            }
            return s;
          }
          if (isUsernameTaken(safePatch.username, s.users, s.currentUserId)) {
            try {
              alert("اسم المستخدم مستخدم من قبل — اختر اسماً آخر");
            } catch {
              /* ignore */
            }
            return s;
          }
        }
      }
      const meId = s.currentUserId;
      const patched: AppState = {
        ...s,
        users: s.users.map(u =>
          u.id === meId
            ? withOfficialAppProfileFields(
                withFounderProfileFields(mergeUserProfilePatch(u, { ...safePatch, id: u.id })),
              )
            : u,
        ),
      };
      if (
        meId &&
        (safePatch.username != null || safePatch.avatar != null || safePatch.email != null)
      ) {
        const sess = getAccountSession(meId);
        if (sess) {
          upsertAccountSession({
            ...sess,
            ...(safePatch.username != null
              ? { username: String(safePatch.username) }
              : {}),
            ...(safePatch.avatar != null ? { avatar: toStoredMediaRef(String(safePatch.avatar)) } : {}),
            ...(safePatch.email != null ? { email: String(safePatch.email).trim().toLowerCase() } : {}),
          });
        }
      }
      const next = scopeAppStateToAccount(meId!, patched, {
        accountIds: snapshotAccountIdsForOwner(meId!),
        isolateOwnedUsers: (ownerId, st) => isolateUsersForAccountCache(ownerId, st),
      });
      nextForRemote = reconcileOwnedAccountProfiles(next);
      return nextForRemote;
    });
    if (!nextForRemote) return;
    const meId = nextForRemote.currentUserId;
    const meRow = nextForRemote.users.find(u => u.id === meId);
    if (meId && meRow) {
      saveAccountStateCache(meId, nextForRemote);
      const sess = getAccountSession(meId);
      if (sess) {
        upsertAccountSession({
          ...sess,
          username: meRow.username,
          avatar: toStoredMediaRef(meRow.avatar),
        });
      }
    }
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    if (!token) return;
    if (opts?.skipRemotePush) {
      profileSaveBusyRef.current = true;
      window.setTimeout(() => {
        profileSaveBusyRef.current = false;
      }, avatarOnlyBusy ? 8000 : 5000);
      return;
    }
    if (opts?.commitRemote) {
      profileSaveBusyRef.current = true;
      void pushRemoteAppState(token, nextForRemote);
      window.setTimeout(() => {
        profileSaveBusyRef.current = false;
      }, avatarOnlyBusy ? 8000 : 5000);
      return;
    }
    void pushRemoteAppState(token, nextForRemote);
  };

  const toggleFollow = (userId: ID) => {
    const meId = stateRef.current.currentUserId;
    const useApi = !!(
      meId &&
      !isGuestUserId(meId) &&
      apiBackendEnabled() &&
      getApiToken()
    );
    if (useApi) socialSyncBusyRef.current = true;

    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId) || s.currentUserId === userId) {
        if (useApi) socialSyncBusyRef.current = false;
        return s;
      }
      const meId = s.currentUserId;
      const me = s.users.find((u) => u.id === meId)!;
      let target = s.users.find((u) => u.id === userId);
      if (!target && useApi) {
        queueMicrotask(() => {
          void (async () => {
            const rows = await apiFetchUserDirectory();
            const row = rows.find(r => r.id === userId);
            if (row) mergeDiscoveredUsers([userFromSearchResult(row)]);
            runFollowToggleApi(userId);
          })();
        });
        return s;
      }
      if (!target) return s;
      const wasFollowing = me.following.includes(userId);
      if (wasFollowing) {
        const next: AppState = {
          ...s,
          users: s.users.map((u) => {
            if (u.id === meId) {
              return {
                ...u,
                following: u.following.filter((x) => x !== userId),
                followRequestOut: (u.followRequestOut || []).filter((x) => x !== userId),
              };
            }
            if (u.id === userId) {
              return {
                ...u,
                followers: u.followers.filter((x) => x !== meId),
                followRequestIn: (u.followRequestIn || []).filter((x) => x !== meId),
              };
            }
            return u;
          }),
        };
        queueMicrotask(() => {
          if (getApiToken()) runFollowToggleApi(userId);
          else pushSnapshotNow(next);
        });
        return next;
      }
      const pendingOut = (me.followRequestOut || []).includes(userId);
      if (target.isPrivate) {
        if (pendingOut) {
          const next: AppState = {
            ...s,
            users: s.users.map((u) => {
              if (u.id === meId)
                return {
                  ...u,
                  followRequestOut: (u.followRequestOut || []).filter((x) => x !== userId),
                };
              if (u.id === userId)
                return {
                  ...u,
                  followRequestIn: (u.followRequestIn || []).filter((x) => x !== meId),
                };
              return u;
            }),
          };
          queueMicrotask(() => {
            if (getApiToken()) runFollowToggleApi(userId);
            else pushSnapshotNow(next);
          });
          return next;
        }
        const next: AppState = pushNotif(
          {
            ...s,
            users: s.users.map((u) => {
              if (u.id === meId)
                return { ...u, followRequestOut: [...(u.followRequestOut || []), userId] };
              if (u.id === userId)
                return { ...u, followRequestIn: [...(u.followRequestIn || []), meId] };
              return u;
            }),
          },
          {
            userId,
            fromId: meId,
            type: "friend_request",
            text: "أرسل لك طلب متابعة",
            followRequestStatus: "pending",
          },
        );
        queueMicrotask(() => {
          if (getApiToken()) runFollowToggleApi(userId);
          else pushSnapshotNow(next);
        });
        return next;
      }
      const next = pushNotif(
        {
          ...s,
          users: s.users.map((u) => {
            if (u.id === meId) return { ...u, following: [...u.following, userId] };
            if (u.id === userId) return { ...u, followers: [...u.followers, meId] };
            return u;
          }),
        },
        { userId, fromId: meId, type: "follow" },
      );
      queueMicrotask(() => {
        if (getApiToken()) runFollowToggleApi(userId);
        else pushSnapshotNow(next);
      });
      return next;
    });
  };

  const acceptFollowRequest = (fromId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      const pending = hasPendingFollowRequestFrom(s, meId, fromId);
      const useApi = apiBackendEnabled() && !!getApiToken();
      if (!pending && !useApi) return s;
      if (!pending && useApi) {
        queueMicrotask(() => runAcceptFollowApi(fromId));
        return s;
      }
      let next: AppState = {
        ...s,
        users: s.users.map((u) => {
          if (u.id === meId) {
            return {
              ...u,
              followRequestIn: (u.followRequestIn || []).filter((x) => x !== fromId),
              followers: u.followers.includes(fromId) ? u.followers : [...u.followers, fromId],
            };
          }
          if (u.id === fromId) {
            return {
              ...u,
              followRequestOut: (u.followRequestOut || []).filter((x) => x !== meId),
              following: u.following.includes(meId) ? u.following : [...u.following, meId],
            };
          }
          return u;
        }),
      };
      next = patchFollowRequestNotifications(next, meId, fromId, "accepted");
      queueMicrotask(() => {
        if (apiBackendEnabled() && getApiToken()) runAcceptFollowApi(fromId);
        else pushSnapshotNow(next);
      });
      return next;
    });

  const declineFollowRequest = (fromId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      if (!hasPendingFollowRequestFrom(s, meId, fromId)) return s;
      let next: AppState = {
        ...s,
        users: s.users.map((u) => {
          if (u.id === meId)
            return { ...u, followRequestIn: (u.followRequestIn || []).filter((x) => x !== fromId) };
          if (u.id === fromId)
            return { ...u, followRequestOut: (u.followRequestOut || []).filter((x) => x !== meId) };
          return u;
        }),
      };
      next = patchFollowRequestNotifications(next, meId, fromId, "declined");
      queueMicrotask(() => {
        if (apiBackendEnabled() && getApiToken()) runDeclineFollowApi(fromId);
        else pushSnapshotNow(next);
      });
      return next;
    });

  const joinChannel = (chatId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const chat = s.chats.find((c) => c.id === chatId && c.isChannel);
      if (!chat || chat.members.includes(s.currentUserId)) return s;
      return {
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId ? { ...c, members: [...c.members, s.currentUserId!] } : c,
        ),
      };
    });

  const applyBlockToggleToState = (s: AppState, userId: ID): AppState | null => {
    if (!s.currentUserId || isGuestUserId(s.currentUserId) || s.currentUserId === userId) return null;
    const meId = s.currentUserId;
    const meRow = s.users.find((u) => u.id === meId);
    const blocking = !!(meRow && !meRow.blocked.includes(userId));
    let next = {
      ...s,
      users: s.users.map((u) => {
        if (u.id === meId) {
          const b = blocking ? [...u.blocked, userId] : u.blocked.filter((x) => x !== userId);
          if (!blocking) {
            return { ...u, blocked: b };
          }
          return {
            ...u,
            blocked: b,
            following: u.following.filter((x) => x !== userId),
            followers: u.followers.filter((x) => x !== userId),
            followRequestOut: (u.followRequestOut || []).filter((x) => x !== userId),
            followRequestIn: (u.followRequestIn || []).filter((x) => x !== userId),
            closeFriends: (u.closeFriends || []).filter((x) => x !== userId),
          };
        }
        if (u.id === userId && blocking) {
          return {
            ...u,
            following: u.following.filter((x) => x !== meId),
            followers: u.followers.filter((x) => x !== meId),
            followRequestIn: (u.followRequestIn || []).filter((x) => x !== meId),
            followRequestOut: (u.followRequestOut || []).filter((x) => x !== meId),
          };
        }
        return u;
      }),
    };
    const byId = new Map(next.users.map(u => [u.id, u]));
    const me = byId.get(meId);
    if (me && blocking) {
      const other = byId.get(userId);
      if (other) {
        byId.set(userId, {
          ...other,
          following: other.following.filter((x) => x !== meId),
          followers: other.followers.filter((x) => x !== meId),
          followRequestIn: (other.followRequestIn || []).filter((x) => x !== meId),
          followRequestOut: (other.followRequestOut || []).filter((x) => x !== meId),
        });
      }
      next = { ...next, users: [...byId.values()] };
    }
    return next;
  };

  const toggleBlock = (userId: ID) => {
    let nextState: AppState | null = null;
    setStateRaw((s) => {
      const next = applyBlockToggleToState(s, userId);
      if (!next) return s;
      nextState = next;
      return next;
    });
    if (nextState?.currentUserId) {
      saveAccountStateCache(nextState.currentUserId, nextState);
      pushSnapshotNow(nextState);
    }
  };

  const toggleBlockWithSync: Ctx["toggleBlockWithSync"] = async (userId) => {
    const meId = stateRef.current.currentUserId;
    if (!meId || isGuestUserId(meId)) {
      return { ok: false, error: "لا يمكن تنفيذ الحظر" };
    }
    const meRow = stateRef.current.users.find(u => u.id === meId);
    const blocking = !!(meRow && !meRow.blocked.includes(userId));
    const prevState = stateRef.current;
    let nextState: AppState | null = null;
    setStateRaw((s) => {
      const next = applyBlockToggleToState(s, userId);
      if (!next) return s;
      nextState = next;
      return next;
    });
    if (!nextState?.currentUserId) {
      return { ok: false, error: "لا يمكن تنفيذ الحظر" };
    }
    saveAccountStateCache(nextState.currentUserId, nextState);
    pushSnapshotNow(nextState);

    const token = getApiToken();
    if (!apiBackendEnabled() || !token || isGuestUserId(meId)) {
      return { ok: true };
    }
    ensureApiTokenMatchesUser(meId);
    if (blocking) {
      const severed = await apiSeverSocialOnBlock(token, userId);
      if (!severed.ok) {
        setStateRaw(() => prevState);
        saveAccountStateCache(meId, prevState);
        pushSnapshotNow(prevState);
        return { ok: false, error: severed.error || "فشل فصل المتابعة" };
      }
    }
    const pushed = await pushRemoteAppState(token, nextState, { force: true });
    if (!pushed) {
      setStateRaw(() => prevState);
      saveAccountStateCache(meId, prevState);
      pushSnapshotNow(prevState);
      return { ok: false, error: "تعذر حفظ الحظر — تحقق من الاتصال وأعد المحاولة" };
    }
    return { ok: true };
  };

  const toggleCloseFriend = (userId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      return {
        ...s,
        users: s.users.map((u) =>
          u.id === s.currentUserId
            ? {
                ...u,
                closeFriends: u.closeFriends.includes(userId)
                  ? u.closeFriends.filter((x) => x !== userId)
                  : [...u.closeFriends, userId],
              }
            : u,
        ),
      };
    });

  const createPost: Ctx["createPost"] = (p) => {
    let nextState: AppState | null = null;
    setStateRaw(s => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const me = s.users.find(u => u.id === s.currentUserId);
      const limit = me ? getUserEntitlements(me).postCharacterLimit : 300;
      const text = (p.text || "").slice(0, limit);
      const post: Post = {
        id: uid(),
        userId: s.currentUserId,
        likes: [],
        reposts: [],
        comments: [],
        createdAt: Date.now(),
        ...p,
        text,
      };
      let next = { ...s, posts: [post, ...s.posts] };
      const mentions = Array.from(new Set((p.text.match(/@(\w+)/g) || []).map((m) => m.slice(1))));
      mentions.forEach((uname) => {
        const u = next.users.find((x) => x.username === uname);
        if (u)
          next = pushNotif(next, {
            userId: u.id,
            fromId: s.currentUserId!,
            type: "mention",
            postId: post.id,
            text: p.text,
          });
      });
      nextState = next;
      return next;
    });
    if (!nextState) return;
    const created = nextState.posts[0];
    socialSyncBusyRef.current = true;
    pushSnapshotNow(nextState);
    const token = getApiToken();
    if (token && apiBackendEnabled() && created?.userId === nextState.currentUserId) {
      void (async () => {
        const payload = {
          id: created.id,
          type: created.type,
          text: created.text,
          image: created.image,
          video: created.video,
          audio: created.audio,
          createdAt: created.createdAt,
        };
        let saved = await apiUpsertPost(token, payload);
        if (!saved.ok) {
          await new Promise(r => window.setTimeout(r, 400));
          saved = await apiUpsertPost(token, payload);
        }
        if (saved.ok) {
          void import("./feedVisibility").then(({ requestAuthFeedRefresh }) => requestAuthFeedRefresh());
        } else {
          console.warn("[Retweet] apiUpsertPost failed:", saved.error);
        }
      })();
    }
    window.setTimeout(() => {
      socialSyncBusyRef.current = false;
    }, 2500);
  };

  const toggleLike = (postId: ID) => {
    const token = getApiToken();
    const useApi = Boolean(token && apiBackendEnabled());
    let rollbackLikes: string[] | null = null;
    let postSnapshot: Post | null = null;
    let actorId: ID | null = null;
    setState((s) => {
      const post = s.posts.find((p) => p.id === postId);
      if (!post || !s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      actorId = s.currentUserId;
      const prevLikes = Array.isArray(post.likes) ? post.likes : [];
      rollbackLikes = [...prevLikes];
      postSnapshot = { ...post };
      const liked = prevLikes.includes(s.currentUserId);
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                likes: liked
                  ? (Array.isArray(p.likes) ? p.likes : []).filter((x) => x !== s.currentUserId)
                  : [...(Array.isArray(p.likes) ? p.likes : []), s.currentUserId!],
              }
            : p,
        ),
      };
    });
    if (useApi && token) {
      void (async () => {
        let res = await apiTogglePostLike(token, postId);
        if (!res.ok && /غير موجود|not found|missing/i.test(res.error || "") && postSnapshot) {
          // ارفع المنشور فقط إذا كان يخص نفس المستخدم الحالي؛ وإلا سيمنع الخادم العملية.
          if (actorId && postSnapshot.userId === actorId) {
            await apiUpsertPost(token, {
              id: postSnapshot.id,
              type: postSnapshot.type,
              text: postSnapshot.text || "",
              image: postSnapshot.image,
              video: postSnapshot.video,
            audio: postSnapshot.audio,
              createdAt: postSnapshot.createdAt || Date.now(),
            });
            res = await apiTogglePostLike(token, postId);
          } else {
            // منشور لشخص آخر: فقط أعد المحاولة، والخادم يتكفل باكتشافه من اللقطات إن كانت متاحة.
            await new Promise(r => window.setTimeout(r, 120));
            res = await apiTogglePostLike(token, postId);
          }
        }
        if (!res.ok) {
          if (rollbackLikes) {
            setState(s => ({
              ...s,
              posts: s.posts.map(p => (p.id === postId ? { ...p, likes: rollbackLikes! } : p)),
            }));
          }
          return;
        }
        setState(s => ({
          ...s,
          posts: s.posts.map(p =>
            p.id === postId ? { ...p, likes: res.likes } : p,
          ),
        }));
      })();
    }
  };
  const toggleStoryLike: Ctx["toggleStoryLike"] = (storyId) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const st = s.stories.find((x) => x.id === storyId);
      if (!st || st.userId === s.currentUserId) return s;
      const likes = st.likes || [];
      const liked = likes.includes(s.currentUserId);
      const nextLikes = liked
        ? likes.filter((id) => id !== s.currentUserId)
        : [...likes, s.currentUserId];
      const next = {
        ...s,
        stories: s.stories.map((x) => (x.id === storyId ? { ...x, likes: nextLikes } : x)),
      };
      if (liked) return next;
      return pushNotif(next, {
        userId: st.userId,
        fromId: s.currentUserId,
        type: "like",
        storyId,
        text: "وضع ❤️ على ستوريك",
      });
    });
  const recordStoryView: Ctx["recordStoryView"] = (storyId) => {
    const token = getApiToken();
    const useApi = Boolean(token && apiBackendEnabled());
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      const st = s.stories.find((x) => x.id === storyId);
      if (!st || st.userId === meId) return s;
      const v = st.viewedByUserIds || [];
      if (v.includes(meId)) return s;
      const at = Date.now();
      return {
        ...s,
        stories: s.stories.map((x) =>
          x.id === storyId
            ? {
                ...x,
                viewedByUserIds: [...v, meId],
                viewedAtByUserIds: { ...(x.viewedAtByUserIds || {}), [meId]: at },
              }
            : x,
        ),
      };
    });
    if (useApi && token) void apiRecordStoryView(token, storyId);
  };
  const toggleFavorite = (postId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      return {
        ...s,
        users: s.users.map((u) => {
          if (u.id !== s.currentUserId) return u;
          const favorites = u.favorites.includes(postId)
            ? u.favorites.filter((x) => x !== postId)
            : [...u.favorites, postId];
          return { ...u, favorites };
        }),
      };
    });
  const toggleRepost = (postId: ID) => {
    const token = getApiToken();
    const useApi = Boolean(token && apiBackendEnabled());
    setState((s) => {
      const post = s.posts.find((p) => p.id === postId);
      if (!post || !s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const r = post.reposts.includes(s.currentUserId);
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                reposts: r
                  ? p.reposts.filter((x) => x !== s.currentUserId)
                  : [...p.reposts, s.currentUserId!],
              }
            : p,
        ),
      };
    });
    if (useApi && token) {
      void apiTogglePostRepost(token, postId).then(res => {
        if (!res.ok) return;
        setState(s => ({
          ...s,
          posts: s.posts.map(p =>
            p.id === postId ? { ...p, reposts: res.reposts } : p,
          ),
        }));
      });
    }
  };
  const addComment = (postId: ID, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const token = getApiToken();
    const useApi = Boolean(token && apiBackendEnabled());
    const optimisticId = uid();
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const post = s.posts.find((p) => p.id === postId);
      if (!post) return s;
      const c: Comment = {
        id: optimisticId,
        userId: s.currentUserId,
        text: trimmed,
        createdAt: Date.now(),
      };
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, comments: [...p.comments, c] } : p,
        ),
      };
    });
    if (useApi && token) {
      void apiAddPostComment(token, postId, trimmed).then(res => {
        if (!res.ok) {
          setState(s => ({
            ...s,
            posts: s.posts.map(p =>
              p.id === postId
                ? { ...p, comments: p.comments.filter(c => c.id !== optimisticId) }
                : p,
            ),
          }));
          return;
        }
        setState(s => ({
          ...s,
          posts: s.posts.map(p => {
            if (p.id !== postId) return p;
            const withoutTemp = p.comments.filter(c => c.id !== optimisticId);
            if (withoutTemp.some(c => c.id === res.comment.id)) return p;
            return { ...p, comments: [...withoutTemp, res.comment] };
          }),
        }));
      });
    }
  };
  const deleteComment = (postId: ID, commentId: ID) => {
    markCommentLocallyRemoved(postId, commentId);
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const post = s.posts.find((p) => p.id === postId);
      if (!post) return s;
      const target = post.comments.find((c) => c.id === commentId);
      if (!target || target.userId !== s.currentUserId) return s;
      const next = {
        ...s,
        posts: s.posts.map((p) =>
          p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p,
        ),
      };
      const token = getApiToken();
      if (token && apiBackendEnabled()) {
        socialSyncBusyRef.current = true;
        void pushRemoteAppState(token, next).finally(() => {
          window.setTimeout(() => {
            socialSyncBusyRef.current = false;
          }, 3000);
        });
      }
      return next;
    });
  };

  const deletePost = (postId: ID) => {
    markPostLocallyRemoved(postId);
    let nextState: AppState | null = null;
    setStateRaw(s => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const post = s.posts.find((p) => p.id === postId);
      if (!post || post.userId !== s.currentUserId) return s;
      const next = { ...s, posts: s.posts.filter((p) => p.id !== postId) };
      nextState = next;
      return next;
    });
    if (!nextState) return;
    socialSyncBusyRef.current = true;
    pushSnapshotNow(nextState);
    window.setTimeout(() => {
      socialSyncBusyRef.current = false;
    }, 3000);
  };

  const deleteStory: Ctx["deleteStory"] = useCallback(
    (storyId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const st = s.stories.find((x) => x.id === storyId);
        if (!st || st.userId !== s.currentUserId) return s;
        const next = {
          ...s,
          stories: s.stories.filter((x) => x.id !== storyId),
          storyArchive: (s.storyArchive || []).filter((x) => x.id !== storyId),
        };
        const token = getApiToken();
        if (token && apiBackendEnabled()) {
          void pushRemoteAppState(token, next);
        }
        return next;
      });
    },
    [setState],
  );

  const addStory: Ctx["addStory"] = useCallback(
    async (image, audience = "all", stickers, video, expiryHours = 24) => {
      const userId = stateRef.current.currentUserId;
      if (!userId || isGuestUserId(userId)) {
        return { ok: false, error: "سجّل الدخول لنشر ستوري" };
      }
      const videoUrl =
        video ||
        (typeof image === "string" && image.startsWith("data:video") ? image : undefined);
      const isVideoPayload = !!videoUrl;
      const row: StoryItem = isVideoPayload
        ? {
            id: uid(),
            userId,
            image: "🎬",
            video: videoUrl,
            createdAt: Date.now(),
            audience,
            likes: [],
            viewedByUserIds: [],
            expiryHours,
          }
        : {
            id: uid(),
            userId,
            image,
            createdAt: Date.now(),
            audience,
            likes: [],
            viewedByUserIds: [],
            expiryHours,
          };
      if (stickers && stickers.length > 0) row.stickers = stickers;

      storyPublishBusyRef.current = true;
      setStateRaw(s => ({ ...s, stories: [row, ...s.stories] }));

      const token = getApiToken();
      if (token && apiBackendEnabled()) {
        try {
          const created = await apiCreateStory(token, row);
          if (!created.ok) {
            setStateRaw(s => ({ ...s, stories: s.stories.filter(st => st.id !== row.id) }));
            return { ok: false, error: created.error };
          }
          setStateRaw(s => ({
            ...s,
            stories: [
              created.story,
              ...s.stories.filter(st => st.id !== row.id && st.id !== created.story.id),
            ],
          }));
          return { ok: true };
        } finally {
          window.setTimeout(() => {
            storyPublishBusyRef.current = false;
          }, 5000);
        }
      }

      storyPublishBusyRef.current = false;
      return { ok: true };
    },
    [setStateRaw],
  );

  const setGroupNickname: Ctx["setGroupNickname"] = (chatId, nickname) => {
    const meId = stateRef.current.currentUserId;
    if (!meId || isGuestUserId(meId)) return;
    const trimmed = nickname.trim().slice(0, 30);
    setState(s => ({
      ...s,
      chats: s.chats.map(c => {
        if (c.id !== chatId || (!c.isGroup && !c.isChannel)) return c;
        const next = { ...(c.groupNicknames || {}) };
        if (trimmed) next[meId] = trimmed;
        else delete next[meId];
        return { ...c, groupNicknames: next };
      }),
    }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      void pushRemoteAppState(token, stateRef.current);
    }
  };

  const addGroupMembers: Ctx["addGroupMembers"] = (chatId, memberIds) => {
    if (!memberIds.length || !state.currentUserId || isGuestUserId(state.currentUserId)) return;
    const prevMembers = stateRef.current.chats.find(c => c.id === chatId)?.members;
    const meId = state.currentUserId;
    const chatRow = stateRef.current.chats.find(c => c.id === chatId);
    const adder = stateRef.current.users.find(u => u.id === meId);
    setState((s) => {
      let next = {
        ...s,
        chats: s.chats.map((c) => {
          if (c.id !== chatId || (!c.isGroup && !c.isChannel)) return c;
          const added = memberIds.filter(id => !c.members.includes(id));
          const joinMsgs: Message[] = added.map(memberId => {
            const nu = s.users.find(u => u.id === memberId);
            return {
              id: uid(),
              senderId: meId,
              type: "text" as const,
              content: `${adder?.username ? `@${adder.username}` : "مشرف"} أضاف ${nu?.username ? `@${nu.username}` : "عضو"} إلى المجموعة`,
              createdAt: Date.now(),
            };
          });
          return {
            ...c,
            members: Array.from(new Set([...c.members, ...memberIds])),
            messages: [...c.messages, ...joinMsgs],
          };
        }),
      };
      for (const memberId of memberIds) {
        if (memberId === meId) continue;
        next = pushNotif(next, {
          userId: memberId,
          fromId: meId,
          type: "message",
          text: `${adder?.username ? `@${adder.username}` : "شخص"} أضافك إلى «${chatRow?.name || "مجموعة"}»`,
        });
      }
      return next;
    });
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      void (async () => {
        groupSyncBusyRef.current = true;
        try {
          const res = await apiAddGroupMembers(token, chatId, memberIds);
          if (res.ok && res.chat) {
            setState(s => ({
              ...s,
              chats: s.chats.map(c =>
                c.id === chatId ? mergeChatRecord(c, res.chat!) : c,
              ),
            }));
            scheduleRemoteSync();
          } else if (!res.ok) {
            console.warn("[Retweet] فشل إضافة أعضاء المجموعة:", res.error);
            if (prevMembers) {
              setState(s => ({
                ...s,
                chats: s.chats.map(c =>
                  c.id === chatId ? { ...c, members: [...prevMembers] } : c,
                ),
              }));
            }
            scheduleRemoteSync();
          }
        } finally {
          window.setTimeout(() => {
            groupSyncBusyRef.current = false;
          }, 1200);
        }
      })();
    }
  };

  const voteStoryPoll: Ctx["voteStoryPoll"] = useCallback(
    (storyId, stickerId, side) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const uidMe = s.currentUserId;
        return {
          ...s,
          stories: s.stories.map((st) => {
            if (st.id !== storyId || !st.stickers?.length) return st;
            return {
              ...st,
              stickers: st.stickers.map((sk) => {
                if (sk.kind !== "poll" || sk.id !== stickerId) return sk;
                const votesLeft = sk.votesLeft.filter((id) => id !== uidMe);
                const votesRight = sk.votesRight.filter((id) => id !== uidMe);
                if (side === "left") return { ...sk, votesLeft: [...votesLeft, uidMe], votesRight };
                return { ...sk, votesLeft, votesRight: [...votesRight, uidMe] };
              }),
            };
          }),
        };
      });
    },
    [setState],
  );

  const answerStoryQuiz: Ctx["answerStoryQuiz"] = useCallback(
    (storyId, stickerId, optionIndex) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const uidMe = s.currentUserId;
        return {
          ...s,
          stories: s.stories.map((st) => {
            if (st.id !== storyId || !st.stickers?.length) return st;
            return {
              ...st,
              stickers: st.stickers.map((sk) => {
                if (sk.kind !== "quiz" || sk.id !== stickerId) return sk;
                return { ...sk, answers: { ...(sk.answers || {}), [uidMe]: optionIndex } };
              }),
            };
          }),
        };
      });
    },
    [setState],
  );

  const rateStorySlider: Ctx["rateStorySlider"] = useCallback(
    (storyId, stickerId, value) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const uidMe = s.currentUserId;
        const v = Math.max(0, Math.min(100, Math.round(value)));
        return {
          ...s,
          stories: s.stories.map((st) => {
            if (st.id !== storyId || !st.stickers?.length) return st;
            return {
              ...st,
              stickers: st.stickers.map((sk) => {
                if (sk.kind !== "slider" || sk.id !== stickerId) return sk;
                return { ...sk, ratings: { ...(sk.ratings || {}), [uidMe]: v } };
              }),
            };
          }),
        };
      });
    },
    [setState],
  );

  const addHighlight: Ctx["addHighlight"] = (p) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const myStories = [...s.stories, ...(s.storyArchive || [])].filter(
        (st) => st.userId === s.currentUserId,
      );
      const byId = new Map<ID, StoryItem>();
      for (const st of myStories) byId.set(st.id, st);
      const safeStoryIds = p.storyIds.filter((id) => byId.has(id));
      if (safeStoryIds.length === 0) return s;
      const slides: HighlightSlide[] = safeStoryIds.map((id) => {
        const st = byId.get(id)!;
        return st.video ? { image: st.image, video: st.video } : { image: st.image };
      });
      const entry: HighlightEntry = {
        id: uid(),
        title: p.title,
        cover: p.cover,
        coverImage: p.coverImage,
        storyIds: safeStoryIds,
        slides,
      };
      return {
        ...s,
        users: s.users.map((u) =>
          u.id === s.currentUserId ? { ...u, highlights: [...u.highlights, entry] } : u,
        ),
      };
    });

  const openOrCreateChat: Ctx["openOrCreateChat"] = useCallback(
    (otherUserId) => {
      const snap = stateRef.current;
      if (!snap.currentUserId || isGuestUserId(snap.currentUserId)) return null;
      const selfId = snap.currentUserId;
      if (otherUserId === selfId) return null;

      const existing = findDmChatForPeer(snap.chats, selfId, otherUserId);
      if (existing) return existing;

      const other = snap.users.find((u) => u.id === otherUserId);
      const meRow = snap.users.find((u) => u.id === selfId);
      const isFollowing = meRow?.following.includes(otherUserId) ?? false;
      const followsMe = other?.following.includes(selfId) ?? false;
      const newChat: Chat = {
        id: dmChatId(selfId, otherUserId),
        isGroup: false,
        members: [selfId, otherUserId],
        admins: [],
        messages: [],
        request: !isFollowing && !followsMe,
        lastOpenAtByUser: {},
        lastReadMessageIdByUser: {},
      };

      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const uid = s.currentUserId;
        if (findDmChatForPeer(s.chats, uid, otherUserId)) return s;
        return { ...s, chats: [...s.chats, newChat] };
      });
      return newChat;
    },
    [setState],
  );

  const createGroup: Ctx["createGroup"] = (name, avatar, memberIds) => {
    if (memberIds.length < 2 || !state.currentUserId || isGuestUserId(state.currentUserId))
      return null;
    const creatorId = state.currentUserId;
    const newChat: Chat = {
      id: uid(),
      isGroup: true,
      name,
      avatar,
      members: Array.from(new Set([creatorId, ...memberIds])),
      admins: [creatorId],
      ownerId: creatorId,
      messages: [],
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
      joinRequests: [],
      isPublicGroup: false,
    };
    setState((s) => ({ ...s, chats: [...s.chats, newChat] }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      groupSyncBusyRef.current = true;
      void (async () => {
        try {
          const created = await apiCreateGroup(token, {
            id: newChat.id,
            name: newChat.name || "مجموعة",
            avatar: newChat.avatar || "👥",
            memberIds: memberIds.filter(id => id !== creatorId),
            welcomeMessage: `مرحباً بكم في «${newChat.name || "مجموعة"}»`,
          });
          if (created.ok) {
            setState(s => ({
              ...s,
              chats: s.chats.map(c =>
                c.id === newChat.id
                  ? {
                      ...c,
                      ...created.chat,
                      members: Array.from(new Set([...c.members, ...created.chat.members])),
                    }
                  : c,
              ),
            }));
          } else {
            console.warn("[Retweet] createGroup API failed:", created.error);
          }
          scheduleRemoteSync();
        } finally {
          window.setTimeout(() => {
            groupSyncBusyRef.current = false;
          }, 1800);
        }
      })();
    }
    return newChat;
  };
  const createChannel: Ctx["createChannel"] = (name, avatar, memberIds) => {
    let created: Chat | null = null;
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const id = uid();
      const newChat: Chat = {
        id,
        isGroup: true,
        isChannel: true,
        createdByUserId: s.currentUserId,
        name,
        avatar,
        members: Array.from(new Set([s.currentUserId, ...memberIds])),
        admins: [s.currentUserId],
        hosts: [s.currentUserId],
        messages: [],
        lastOpenAtByUser: {},
        lastReadMessageIdByUser: {},
      };
      created = newChat;
      return {
        ...s,
        chats: [...s.chats, newChat],
        users: s.users.map((u) =>
          u.id === s.currentUserId
            ? { ...u, publicChannelIds: [...(u.publicChannelIds || []), id] }
            : u,
        ),
      };
    });
    return created;
  };
  const toggleHost = (chatId: ID, userId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      return {
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId
            ? {
                ...c,
                hosts: (c.hosts || []).includes(userId)
                  ? c.hosts!.filter((x) => x !== userId)
                  : [...(c.hosts || []), userId],
              }
            : c,
        ),
      };
    });
  const leaveChat = (chatId: ID) => {
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      const target = s.chats.find(c => c.id === chatId);
      const removeWholeGroup = target?.isGroup && !target.isChannel;
      return {
        ...s,
        chats: removeWholeGroup
          ? s.chats.filter(c => c.id !== chatId)
          : s.chats.map(c =>
              c.id === chatId && meId
                ? {
                    ...c,
                    members: c.members.filter(x => x !== meId),
                    admins: c.admins.filter(x => x !== meId),
                    hosts: (c.hosts || []).filter(x => x !== meId),
                  }
                : c,
            ),
        users: meId
          ? s.users.map(u =>
              u.id !== meId
                ? u
                : {
                    ...u,
                    pinnedChatIds: (u.pinnedChatIds || []).filter(id => id !== chatId),
                    mutedChatIds: (u.mutedChatIds || []).filter(id => id !== chatId),
                  },
            )
          : s.users,
      };
    });
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      void apiLeaveGroup(token, chatId).then(() => scheduleRemoteSync());
    }
  };

  const persistMessageOnServer = useCallback(
    (chat: Chat, m: Message, senderId: string) => {
      if (!apiBackendEnabled()) return;
      if (m.senderId !== senderId) return;
      const activeId = stateRef.current.currentUserId;
      if (!activeId || activeId !== senderId) return;
      if (!chat.members.includes(senderId)) return;
      const token = ensureApiTokenMatchesUser(senderId);
      if (!token) return;
      const isDm = !chat.isGroup && !chat.isChannel && chat.members.length === 2;
      const receiverId = isDm ? (chat.members.find(id => id !== senderId) ?? null) : null;
      const storageChatId =
        isDm && receiverId ? dmChatId(senderId, receiverId) : chat.id;
      const body = {
        id: m.id,
        chatId: storageChatId,
        receiverId,
        type: m.type,
        content: m.content,
        createdAt: m.createdAt,
        durationSec: m.durationSec,
        shareText: m.shareText,
        viewOnce: m.viewOnce,
        viewOnceOpenedByUserIds: m.viewOnceOpenedByUserIds,
        replyTo: m.replyTo,
        parentMessageId: m.parentMessageId ?? m.replyTo?.id,
        status: m.status ?? "sent",
        reactions: m.reactions,
        forwardedFrom: m.forwardedFrom,
      };
      void (async () => {
        const attemptSocket = async (): Promise<boolean> => emitDirectMessage(body, senderId);
        const attemptRest = async (): Promise<boolean> => {
          const restToken = ensureApiTokenMatchesUser(senderId);
          if (!restToken || stateRef.current.currentUserId !== senderId) return false;
          const result = await apiPostMessage(restToken, storageChatId, receiverId, m);
          return result !== null;
        };
        const delivered = await new Promise<boolean>(resolve => {
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled || !ok) return;
            settled = true;
            resolve(true);
          };
          void attemptSocket().then(finish);
          void attemptRest().then(finish);
          window.setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          }, 12_000);
        });
        if (!delivered && stateRef.current.currentUserId === senderId) {
          // تحديث حالة الرسالة إلى "failed" عند الفشل الكامل
          setState(s => {
            if (s.currentUserId !== senderId) return s;
            return {
              ...s,
              chats: s.chats.map(c => {
                const hasMsg = (c.messages || []).some(msg => msg.id === m.id);
                if (!hasMsg) return c;
                return {
                  ...c,
                  messages: c.messages.map(msg =>
                    msg.id === m.id ? { ...msg, status: "failed" as const } : msg,
                  ),
                };
              }),
            };
          });
        }
      })();
    },
    [],
  );

  const loadChatMessages: Ctx["loadChatMessages"] = useCallback(async (chatId) => {
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    const uid = stateRef.current.currentUserId;
    if (!token || !uid || isGuestUserId(uid)) return;
    const localChat = stateRef.current.chats.find(
      c => c.id === chatId || chatMergeKey(c, uid) === chatId,
    );
    if (!localChat?.members.includes(uid)) return;
    const peer =
      !localChat.isGroup && !localChat.isChannel
        ? localChat.members.find(id => id !== uid)
        : null;
    const stateKey = peer ? dmChatId(uid, peer) : chatId;

    const cached = await readCachedChatMessages(uid, stateKey);
    if (cached?.length) {
      setState(s => {
        if (s.currentUserId !== uid) return s;
        const chat = s.chats.find(
          c => c.id === chatId || c.id === stateKey || chatMergeKey(c, uid) === stateKey,
        );
        if (!chat?.members.includes(uid)) return s;
        const merged = {
          ...chat,
          id: stateKey,
          messages: mergeChatMessages(chat.messages || [], cached),
        };
        const withoutDup = s.chats.filter(
          c =>
            c.id !== chat.id &&
            c.id !== stateKey &&
            chatMergeKey(c, uid) !== stateKey,
        );
        return { ...s, chats: [...withoutDup, merged] };
      });
    }

    const fetchId = stateKey;
    const remote = await apiFetchChatMessages(token, fetchId);
    if (remote.length === 0) return;
    void writeCachedChatMessages(uid, stateKey, remote);
    setState(s => {
      if (s.currentUserId !== uid) return s;
      const chat = s.chats.find(
        c => c.id === chatId || c.id === stateKey || chatMergeKey(c, uid) === stateKey,
      );
      if (!chat?.members.includes(uid)) return s;
      const merged = {
        ...chat,
        id: stateKey,
        messages: mergeChatMessages(chat.messages || [], remote),
      };
      const withoutDup = s.chats.filter(
        c =>
          c.id !== chat.id &&
          c.id !== stateKey &&
          chatMergeKey(c, uid) !== stateKey,
      );
      return {
        ...s,
        chats: [...withoutDup, merged],
      };
    });
  }, [setState]);

  const sendMessage: Ctx["sendMessage"] = useCallback(
    (chatId, msg) => {
      const senderId = stateRef.current.currentUserId;
      if (!senderId || isGuestUserId(senderId)) return false;
      ensureApiTokenMatchesUser(senderId);

      const snap = stateRef.current;
      const preflight =
        resolveChatForSend(snap, chatId, senderId) ?? findChatByOpenId(snap.chats, chatId, senderId);
      if (!preflight) return false;
      if (preflight.isChannel && !(preflight.hosts || []).includes(senderId)) return false;
      if (preflight.isGroup && !preflight.isChannel) {
        const mutedUntil = preflight.mutedUserIds?.[senderId];
        if (mutedUntil && mutedUntil > Date.now()) return false;
        const role =
          preflight.memberRoles?.[senderId] ||
          (preflight.ownerId === senderId
            ? "owner"
            : (preflight.admins || []).includes(senderId)
              ? "admin"
              : "member");
        const whoCanSend = preflight.groupSettings?.whoCanSendMessages || "everyone";
        if (whoCanSend === "admins" && role !== "owner" && role !== "admin") return false;
        if (whoCanSend === "moderators" && role === "member") return false;
      }

      const m: Message = {
        id: uid(),
        senderId,
        createdAt: Date.now(),
        status: "sent",
        parentMessageId: msg.replyTo?.id ?? msg.parentMessageId,
        ...msg,
      };
      let persistChat: Chat | null = null;
      let mentionWork: ((prev: AppState) => AppState) | null = null;

      setState(s => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId) || s.currentUserId !== senderId) {
          return s;
        }
        let chat =
          resolveChatForSend(s, chatId, senderId) ?? findChatByOpenId(s.chats, chatId, senderId);
        if (!chat) return s;
        if (chat.isChannel && !(chat.hosts || []).includes(senderId)) return s;

        const isDm = !chat.isGroup && !chat.isChannel && chat.members.length === 2;
        const peer = isDm ? chat.members.find(id => id !== senderId) : null;
        const canonicalId = peer ? dmChatId(senderId, peer) : chat.id;
        if (isDm && peer) {
          const existing = findDmChatForPeer(s.chats, senderId, peer);
          if (existing) chat = existing;
          else if (chat.id !== canonicalId) chat = { ...chat, id: canonicalId };
        }

        if (chat.isGroup && !chat.isChannel) {
          const mutedUntil = chat.mutedUserIds?.[senderId];
          if (mutedUntil && mutedUntil > Date.now()) return s;
          const role =
            chat.memberRoles?.[senderId] ||
            (chat.ownerId === senderId
              ? "owner"
              : (chat.admins || []).includes(senderId)
                ? "admin"
                : "member");
          const whoCanSend = chat.groupSettings?.whoCanSendMessages || "everyone";
          if (whoCanSend === "admins" && role !== "owner" && role !== "admin") return s;
          if (whoCanSend === "moderators" && role === "member") return s;
        }

        const updatedChat: Chat = { ...chat, messages: [...(chat.messages || []), m] };
        persistChat = updatedChat;
        const mergeKey = chatMergeKey(updatedChat, senderId);
        const others = s.chats.filter(
          c =>
            c.id !== chat!.id &&
            c.id !== canonicalId &&
            chatMergeKey(c, senderId) !== mergeKey,
        );
        let next: AppState = { ...s, chats: [...others, { ...updatedChat, id: mergeKey }] };

        if (
          msg.type === "text" &&
          chat.isGroup &&
          !chat.isChannel &&
          chat.members.length > 1 &&
          chat.members.length <= 24
        ) {
          const mentionAll = /@all\b|@الجميع|منشن عام/i.test(msg.content);
          const mentions = Array.from(
            new Set(
              (msg.content.match(/@([a-z0-9_]{1,30})/gi) || []).map(x => x.slice(1).toLowerCase()),
            ),
          ).filter(n => n !== "all" && n !== "الجميع");
          if (mentionAll || mentions.length) {
            const chatSnap = chat;
            const mergeKeySnap = mergeKey;
            mentionWork = s => {
              let n = s;
              if (mentionAll) {
                for (const mid of chatSnap.members) {
                  if (mid === senderId) continue;
                  n = pushNotif(n, {
                    userId: mid,
                    fromId: senderId,
                    type: "mention",
                    chatId: mergeKeySnap,
                    text: `منشن عام في «${chatSnap.name || "مجموعة"}»`,
                  });
                }
              } else {
                for (const uname of mentions) {
                  const member = chatSnap.members
                    .map(id => n.users.find(x => x.id === id))
                    .find(u => u && u.username.toLowerCase() === uname);
                  if (member) {
                    n = pushNotif(n, {
                      userId: member.id,
                      fromId: senderId,
                      type: "mention",
                      chatId: mergeKeySnap,
                      text: msg.content.slice(0, 160),
                    });
                  }
                }
              }
              return n;
            };
          }
        }

        if (isDm && peer) {
          let preview = "";
          if (msg.type === "text")
            preview = msg.content.length > 160 ? msg.content.slice(0, 160) + "…" : msg.content;
          else if (msg.type === "sticker") preview = "ملصق";
          else if (msg.type === "image") preview = msg.viewOnce ? "صورة (مرة واحدة)" : "صورة";
          else if (msg.type === "drawing") preview = msg.viewOnce ? "رسم (مرة واحدة)" : "رسم";
          else if (msg.type === "video") preview = msg.viewOnce ? "فيديو (مرة واحدة)" : "فيديو";
          else if (msg.type === "voice") preview = "رسالة صوتية";
          else if (msg.type === "shared_post") preview = "منشور";
          else if (msg.type === "shared_story") preview = "ستوري";
          else preview = "رسالة";
          next = pushNotif(next, {
            userId: peer,
            fromId: senderId,
            type: "message",
            chatId: canonicalId,
            text: preview,
          });
        }

        return next;
      });

      if (!persistChat) return false;

      messageSendBusyRef.current = true;
      persistMessageOnServer(persistChat, m, senderId);
      if (mentionWork) {
        queueMicrotask(() => setState(mentionWork));
      }
      window.setTimeout(() => {
        messageSendBusyRef.current = false;
      }, 450);
      return true;
    },
    [setState, persistMessageOnServer],
  );

  const markViewOnceOpened: Ctx["markViewOnceOpened"] = useCallback(
    (chatId, messageId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const me = s.currentUserId;
        return {
          ...s,
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                if (!m.viewOnce) return m;
                const prev = m.viewOnceOpenedByUserIds ?? [];
                if (prev.includes(me)) return m;
                return { ...m, viewOnceOpenedByUserIds: [...prev, me] };
              }),
            };
          }),
        };
      });
    },
    [setState],
  );

  const renameGroup = (chatId: ID, name: string) => {
    setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === chatId ? { ...c, name } : c)) }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) void apiPatchGroup(token, chatId, { name });
  };
  const updateGroupAvatar: Ctx["updateGroupAvatar"] = (chatId, avatar) => {
    setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === chatId ? { ...c, avatar } : c)) }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) void apiPatchGroup(token, chatId, { avatar });
  };
  const toggleGroupAdmin = (chatId: ID, userId: ID) =>
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              admins: c.admins.includes(userId)
                ? c.admins.filter((x) => x !== userId)
                : [...c.admins, userId],
            }
          : c,
      ),
    }));
  const kickMember = (chatId: ID, userId: ID) => {
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              members: c.members.filter((x) => x !== userId),
              admins: c.admins.filter((x) => x !== userId),
              hosts: (c.hosts || []).filter((x) => x !== userId),
              messages: [
                ...(c.messages || []),
                {
                  id: uid(),
                  senderId: s.currentUserId || c.ownerId || userId,
                  type: "text",
                  content: `${
                    s.users.find(u => u.id === s.currentUserId)?.username
                      ? `@${s.users.find(u => u.id === s.currentUserId)!.username}`
                      : "مشرف"
                  } طرد ${
                    s.users.find(u => u.id === userId)?.username
                      ? `@${s.users.find(u => u.id === userId)!.username}`
                      : "عضو"
                  } من المجموعة`,
                  createdAt: Date.now(),
                },
              ],
            }
          : c,
      ),
    }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      groupSyncBusyRef.current = true;
      void apiKickGroupMember(token, chatId, userId)
        .then(() => scheduleRemoteSync())
        .finally(() => {
          window.setTimeout(() => {
            groupSyncBusyRef.current = false;
          }, 2000);
        });
    }
  };

  const muteGroupMember: Ctx["muteGroupMember"] = (chatId, userId, durationMinutes) => {
    const meId = stateRef.current.currentUserId;
    if (!meId || isGuestUserId(meId)) return;
    const now = Date.now();
    const foreverMinutes = 5_256_000; // ~10 years
    const effectiveMinutes = durationMinutes == null ? foreverMinutes : Math.max(1, durationMinutes);
    const mutedUntil = now + effectiveMinutes * 60_000;
    const meUser = stateRef.current.users.find(u => u.id === meId);
    const targetUser = stateRef.current.users.find(u => u.id === userId);
    const muteLabel =
      durationMinutes == null
        ? "للأبد"
        : durationMinutes === 5
          ? "5 دقائق"
          : durationMinutes === 10
            ? "10 دقائق"
            : durationMinutes === 60
              ? "ساعة"
              : `${durationMinutes} دقيقة`;

    setState(s => ({
      ...s,
      chats: s.chats.map(c => {
        if (c.id !== chatId) return c;
        const mutedMap = { ...(c.mutedUserIds || {}), [userId]: mutedUntil };
        const systemMsg: Message = {
          id: uid(),
          senderId: meId,
          type: "text",
          content: `${meUser?.username ? `@${meUser.username}` : "مشرف"} كتم ${targetUser?.username ? `@${targetUser.username}` : "عضو"} لمدة ${muteLabel}`,
          createdAt: now,
        };
        return {
          ...c,
          mutedUserIds: mutedMap,
          messages: [...(c.messages || []), systemMsg],
        };
      }),
    }));

    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      groupSyncBusyRef.current = true;
      void apiMuteGroupMember(chatId, userId, Math.min(effectiveMinutes, 10080))
        .then(r => {
          if (r.ok && r.data.chat) {
            setState(s => ({
              ...s,
              chats: s.chats.map(c => (c.id === chatId ? mergeChatRecord(c, r.data.chat!) : c)),
            }));
          }
          scheduleRemoteSync();
        })
        .finally(() => {
          window.setTimeout(() => {
            groupSyncBusyRef.current = false;
          }, 1200);
        });
    }
  };

  const setGroupPublic: Ctx["setGroupPublic"] = (chatId, isPublic) => {
    setState(s => ({
      ...s,
      chats: s.chats.map(c => (c.id === chatId ? { ...c, isPublicGroup: isPublic } : c)),
    }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      void apiPatchGroup(token, chatId, { isPublicGroup: isPublic }).then(res => {
        if (res.ok && res.chat) {
          setState(s => ({
            ...s,
            chats: s.chats.map(c => (c.id === chatId ? mergeChatRecord(c, res.chat!) : c)),
          }));
        }
        scheduleRemoteSync();
      });
    }
  };

  const joinGroupByInviteCode: Ctx["joinGroupByInviteCode"] = async code => {
    const token = getApiToken();
    if (!token || !apiBackendEnabled()) {
      return { ok: false, error: "الخادم غير متصل" };
    }
    groupSyncBusyRef.current = true;
    let res: Awaited<ReturnType<typeof apiJoinGroupByInvite>>;
    try {
      res = await apiJoinGroupByInvite(token, code.trim());
    } finally {
      window.setTimeout(() => {
        groupSyncBusyRef.current = false;
      }, 1200);
    }
    if (!res.ok) return res;
    if (res.chat) {
      setState(s => {
        if (!s.currentUserId) return s;
        const meId = s.currentUserId;
        const existing = s.chats.find(c => c.id === res.chat!.id);
        const merged: Chat = existing
          ? mergeChatRecord(existing, {
              ...res.chat!,
              members: Array.from(new Set([...res.chat!.members, meId])),
            })
          : {
              ...res.chat!,
              members: Array.from(new Set([...res.chat!.members, meId])),
            };
        const has = s.chats.some(c => c.id === merged.id);
        return {
          ...s,
          chats: has ? s.chats.map(c => (c.id === merged.id ? merged : c)) : [...s.chats, merged],
        };
      });
    }
    scheduleRemoteSync();
    if (res.pending) {
      return { ok: true, chatId: "", pending: true };
    }
    return { ok: true, chatId: res.chat?.id || "" };
  };

  const respondGroupJoinRequest: Ctx["respondGroupJoinRequest"] = (chatId, userId, action) => {
    setState(s => ({
      ...s,
      chats: s.chats.map(c => {
        if (c.id !== chatId) return c;
        const requests = (c.joinRequests || []).filter(r => r.userId !== userId);
        const members = action === "accept" ? Array.from(new Set([...c.members, userId])) : c.members;
        if (action !== "accept") return { ...c, joinRequests: requests, members };
        const actor = s.users.find(u => u.id === s.currentUserId);
        const target = s.users.find(u => u.id === userId);
        const joinMsg: Message = {
          id: uid(),
          senderId: s.currentUserId || c.ownerId || userId,
          type: "text",
          content: `${actor?.username ? `@${actor.username}` : "مشرف"} أضاف ${target?.username ? `@${target.username}` : "عضو"} إلى المجموعة`,
          createdAt: Date.now(),
        };
        return { ...c, joinRequests: requests, members, messages: [...(c.messages || []), joinMsg] };
      }),
    }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      groupSyncBusyRef.current = true;
      void apiRespondGroupJoinRequest(token, chatId, userId, action)
        .then(r => {
          if (r.ok && r.chat) {
            setState(s => ({
              ...s,
              chats: s.chats.map(c => (c.id === chatId ? mergeChatRecord(c, r.chat!) : c)),
            }));
          }
          scheduleRemoteSync();
        })
        .finally(() => {
          window.setTimeout(() => {
            groupSyncBusyRef.current = false;
          }, 1200);
        });
    }
  };

  const acceptRequest = (chatId: ID) =>
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, request: false } : c)),
    }));
  const deleteChat = (chatId: ID) =>
    setState((s) => ({
      ...s,
      chats: s.chats.filter((c) => c.id !== chatId),
      users: s.users.map((u) => ({
        ...u,
        pinnedChatIds: (u.pinnedChatIds || []).filter((id) => id !== chatId),
        mutedChatIds: (u.mutedChatIds || []).filter((id) => id !== chatId),
      })),
    }));

  const toggleChatListPin: Ctx["toggleChatListPin"] = useCallback(
    (chatId: ID) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        return {
          ...s,
          users: s.users.map((u) => {
            if (u.id !== s.currentUserId) return u;
            const prev = [...(u.pinnedChatIds || [])];
            const i = prev.indexOf(chatId);
            if (i >= 0) {
              prev.splice(i, 1);
              return { ...u, pinnedChatIds: prev };
            }
            return { ...u, pinnedChatIds: [chatId, ...prev.filter((id) => id !== chatId)] };
          }),
        };
      });
    },
    [setState],
  );

  const toggleChatMute: Ctx["toggleChatMute"] = useCallback(
    (chatId: ID) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        return {
          ...s,
          users: s.users.map((u) => {
            if (u.id !== s.currentUserId) return u;
            const prev = [...(u.mutedChatIds || [])];
            const i = prev.indexOf(chatId);
            if (i >= 0) {
              prev.splice(i, 1);
              return { ...u, mutedChatIds: prev };
            }
            return { ...u, mutedChatIds: [...prev, chatId] };
          }),
        };
      });
    },
    [setState],
  );

  const hideMessageForMe: Ctx["hideMessageForMe"] = useCallback(
    (chatId, messageId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const me = s.currentUserId;
        const next = {
          ...s,
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            const prev = c.hiddenMessageIdsByUser?.[me] ?? [];
            if (prev.includes(messageId)) return c;
            return {
              ...c,
              hiddenMessageIdsByUser: {
                ...(c.hiddenMessageIdsByUser || {}),
                [me]: [...prev, messageId],
              },
            };
          }),
        };
        const token = getApiToken();
        if (token && apiBackendEnabled()) {
          socialSyncBusyRef.current = true;
          void pushRemoteAppState(token, next).finally(() => {
            window.setTimeout(() => {
              socialSyncBusyRef.current = false;
            }, 3000);
          });
        }
        return next;
      });
    },
    [setState],
  );

  const addMessageReaction: Ctx["addMessageReaction"] = useCallback(
    (chatId, messageId, emoji) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const uidMe = s.currentUserId;
        return {
          ...s,
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const prev = m.reactions || [];
                const mine = prev.find((r) => r.userId === uidMe);
                if (mine && mine.emoji === emoji) {
                  const next = prev.filter((r) => r.userId !== uidMe);
                  return { ...m, reactions: next.length ? next : undefined };
                }
                const others = prev.filter((r) => r.userId !== uidMe);
                return { ...m, reactions: [...others, { emoji, userId: uidMe }] };
              }),
            };
          }),
        };
      });
    },
    [setState],
  );

  const forwardMessage: Ctx["forwardMessage"] = useCallback(
    (fromChatId, targetChatId, messageId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const me = s.currentUserId;
        const fromChat = s.chats.find((c) => c.id === fromChatId);
        const toChat = s.chats.find((c) => c.id === targetChatId);
        const orig = fromChat?.messages.find((m) => m.id === messageId);
        if (!fromChat || !toChat || !orig || fromChatId === targetChatId) return s;
        if (toChat.isChannel && !(toChat.hosts || []).includes(me)) return s;

        const sourceLabel =
          fromChat.isGroup || fromChat.isChannel
            ? fromChat.name || (fromChat.isChannel ? "قناة" : "مجموعة")
            : (() => {
                const oid = fromChat.members.find((x) => x !== me);
                const u = oid ? s.users.find((x) => x.id === oid) : null;
                return u ? `@${u.username}` : "خاص";
              })();

        const m: Message = {
          id: uid(),
          senderId: me,
          createdAt: Date.now(),
          type: orig.type,
          content: orig.content,
          durationSec: orig.durationSec,
          shareText: orig.shareText,
          viewOnce: orig.viewOnce,
          forwardedFrom: { sourceChatLabel: sourceLabel },
        };

        let next: AppState = {
          ...s,
          chats: s.chats.map((c) =>
            c.id === targetChatId ? { ...c, messages: [...c.messages, m] } : c,
          ),
        };

        const isDm = !toChat.isGroup && !toChat.isChannel && toChat.members.length === 2;
        if (isDm) {
          const otherId = toChat.members.find((id) => id !== me);
          if (otherId) {
            let preview = "";
            if (m.type === "text")
              preview = m.content.length > 160 ? m.content.slice(0, 160) + "…" : m.content;
            else if (m.type === "sticker") preview = "ملصق";
            else if (m.type === "image") preview = "صورة";
            else if (m.type === "drawing") preview = "رسم";
            else if (m.type === "video") preview = "فيديو";
            else if (m.type === "voice") preview = "رسالة صوتية";
            else if (m.type === "shared_post") preview = "منشور";
            else if (m.type === "shared_story") preview = "ستوري";
            else preview = "رسالة";
            next = pushNotif(next, {
              userId: otherId,
              fromId: me,
              type: "message",
              chatId: targetChatId,
              text: preview,
            });
          }
        }
        return next;
      });
    },
    [setState],
  );

  const pinChatMessage: Ctx["pinChatMessage"] = useCallback(
    (chatId, messageId) => {
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) => {
          if (c.id !== chatId) return c;
          if (!(c.messages || []).some((m) => m.id === messageId)) return c;
          const cur = [...(c.pinnedMessageIds || [])].filter((id) => id !== messageId);
          cur.unshift(messageId);
          return { ...c, pinnedMessageIds: cur.slice(0, 3) };
        }),
      }));
    },
    [setState],
  );

  const unpinChatMessage: Ctx["unpinChatMessage"] = useCallback(
    (chatId, messageId) => {
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) =>
          c.id !== chatId
            ? c
            : {
                ...c,
                pinnedMessageIds: (c.pinnedMessageIds || []).filter((id) => id !== messageId),
              },
        ),
      }));
    },
    [setState],
  );

  const addFavoriteStickerContent: Ctx["addFavoriteStickerContent"] = useCallback(
    (content) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const me = s.currentUserId;
        return {
          ...s,
          users: s.users.map((u) => {
            if (u.id !== me) return u;
            const prev = u.favoriteStickerContents || [];
            if (prev.includes(content)) return u;
            return { ...u, favoriteStickerContents: [content, ...prev].slice(0, 120) };
          }),
        };
      });
    },
    [setState],
  );

  const addCreatedStickerContent: Ctx["addCreatedStickerContent"] = useCallback(
    (content) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const me = s.currentUserId;
        return {
          ...s,
          users: s.users.map((u) => {
            if (u.id !== me) return u;
            const prev = u.createdStickerContents || [];
            if (prev.includes(content)) return u;
            return { ...u, createdStickerContents: [content, ...prev].slice(0, 120) };
          }),
        };
      });
    },
    [setState],
  );

  const setNote = (text: string) =>
    setStateRaw(s => {
      if (!s.currentUserId) return s;
      const trimmed = text.trim();
      const next: AppState = {
        ...s,
        users: s.users.map(u =>
          u.id === s.currentUserId
            ? { ...u, note: trimmed, noteAt: trimmed ? Date.now() : undefined }
            : u,
        ),
      };
      if (apiBackendEnabled()) {
        const token = getApiToken();
        if (token) void pushRemoteAppState(token, next);
      }
      return next;
    });
  const createSticker = (emoji: string, label: string) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      return {
        ...s,
        stickers: [...s.stickers, { id: uid(), userId: s.currentUserId, emoji, label }],
      };
    });
  const markNotificationsRead = () =>
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) =>
        n.userId === s.currentUserId ? { ...n, read: true } : n,
      ),
    }));
  const markNotificationRead: Ctx["markNotificationRead"] = (id) =>
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));

  const addMediaNote: Ctx["addMediaNote"] = (kind, targetId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const n: MediaNote = {
        id: uid(),
        kind,
        targetId,
        authorId: s.currentUserId,
        text: trimmed,
        createdAt: Date.now(),
      };
      const rest = s.mediaNotes.filter(
        (m) => !(m.kind === kind && m.targetId === targetId && m.authorId === s.currentUserId),
      );
      return { ...s, mediaNotes: [...rest, n] };
    });
  };

  const markChatOpened: Ctx["markChatOpened"] = useCallback(
    (chatId) => {
      const meId = stateRef.current.currentUserId;
      const chat = stateRef.current.chats.find(c => c.id === chatId);
      if (meId && chat && !isGuestUserId(meId)) {
        const isDm = !chat.isGroup && !chat.isChannel && chat.members.length === 2;
        const peer = isDm ? chat.members.find(id => id !== meId) : null;
        const storageId = peer ? dmChatId(meId, peer) : chatId;
        const unreadFromPeer = (chat.messages || [])
          .filter(m => m.senderId !== meId && m.status !== "read")
          .map(m => m.id);
        if (unreadFromPeer.length) emitMessagesRead(storageId, unreadFromPeer);
      }
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const me = s.currentUserId;
        return {
          ...s,
          chats: s.chats.map((c) => {
            if (c.id !== chatId) return c;
            const readIds = new Set(
              (c.messages || []).filter(m => m.senderId !== me).map(m => m.id),
            );
            return {
              ...c,
              lastOpenAtByUser: { ...(c.lastOpenAtByUser || {}), [me]: Date.now() },
              messages: (c.messages || []).map(m =>
                readIds.has(m.id) && m.senderId !== me
                  ? { ...m, status: "read" as const }
                  : m,
              ),
            };
          }),
        };
      });
    },
    [setState],
  );

  const replyToMediaNoteAsDm: Ctx["replyToMediaNoteAsDm"] = (p) => {
    let out: { chatId: ID } | null = null;
    setState((s) => {
      if (!s.currentUserId || !p.replyText.trim()) return s;
      if (isGuestUserId(s.currentUserId)) return s;
      if (p.noteAuthorId === s.currentUserId) return s;
      const me = s.currentUserId;
      const other = s.users.find((u) => u.id === p.noteAuthorId);
      const isFollowing = s.users.find((u) => u.id === me)?.following.includes(p.noteAuthorId);
      const preview = p.noteText.length > 200 ? p.noteText.slice(0, 200) + "…" : p.noteText;
      const header = `↩️ رد على نوتك على ${p.contentLabelAr}:\n«${preview}»\n—\n`;
      const content = header + p.replyText.trim();
      const m: Message = { id: uid(), senderId: me, type: "text", content, createdAt: Date.now() };
      const existing = findDmChatForPeer(s.chats, me, p.noteAuthorId);
      if (existing) {
        out = { chatId: existing.id };
        return {
          ...s,
          chats: s.chats.map((c) =>
            c.id === existing.id ? { ...c, messages: [...c.messages, m] } : c,
          ),
        };
      }
      const newChat: Chat = {
        id: dmChatId(me, p.noteAuthorId),
        isGroup: false,
        members: [me, p.noteAuthorId],
        admins: [],
        messages: [m],
        request: !isFollowing && !!other?.isPrivate,
        lastOpenAtByUser: {},
        lastReadMessageIdByUser: {},
      };
      out = { chatId: newChat.id };
      return { ...s, chats: [...s.chats, newChat] };
    });
    return out;
  };

  const replyToProfileNoteAsDm: Ctx["replyToProfileNoteAsDm"] = (p) => {
    let out: { chatId: ID } | null = null;
    let persist: { chat: Chat; message: Message; senderId: string } | null = null;
    setState((s) => {
      if (!s.currentUserId || !p.replyText.trim()) return s;
      if (isGuestUserId(s.currentUserId)) return s;
      if (p.friendId === s.currentUserId) return s;
      const me = s.currentUserId;
      const other = s.users.find((u) => u.id === p.friendId);
      const isFollowing = s.users.find((u) => u.id === me)?.following.includes(p.friendId);
      const preview = p.noteText.length > 200 ? p.noteText.slice(0, 200) + "…" : p.noteText;
      const m: Message = {
        id: uid(),
        senderId: me,
        type: "text",
        content: p.replyText.trim(),
        replyContext: { kind: "note", noteText: preview },
        createdAt: Date.now(),
      };
      const existing = findDmChatForPeer(s.chats, me, p.friendId);
      if (existing) {
        out = { chatId: existing.id };
        const chat = { ...existing, messages: [...existing.messages, m] };
        persist = { chat, message: m, senderId: me };
        return {
          ...s,
          chats: s.chats.map((c) => (c.id === existing.id ? chat : c)),
        };
      }
      const newChat: Chat = {
        id: dmChatId(me, p.friendId),
        isGroup: false,
        members: [me, p.friendId],
        admins: [],
        messages: [m],
        request: !isFollowing && !!other?.isPrivate,
        lastOpenAtByUser: {},
        lastReadMessageIdByUser: {},
      };
      out = { chatId: newChat.id };
      persist = { chat: newChat, message: m, senderId: me };
      return { ...s, chats: [...s.chats, newChat] };
    });
    if (persist) persistMessageOnServer(persist.chat, persist.message, persist.senderId);
    return out;
  };

  const markChatRead: Ctx["markChatRead"] = useCallback(
    (chatId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const meId = s.currentUserId;
        const chat = s.chats.find((c) => c.id === chatId);
        if (!chat) return s;
        const msgs = chat.messages || [];
        const last = msgs[msgs.length - 1];
        const lastId = last?.id ?? "";
        if (chat.lastReadMessageIdByUser?.[meId] === lastId) return s;
        return {
          ...s,
          chats: s.chats.map((c) =>
            c.id !== chatId
              ? c
              : {
                  ...c,
                  lastReadMessageIdByUser: { ...(c.lastReadMessageIdByUser || {}), [meId]: lastId },
                },
          ),
        };
      });
    },
    [setState],
  );
  const recordProfileVisit: Ctx["recordProfileVisit"] = (targetUserId) => {
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId) || s.currentUserId === targetUserId)
        return s;
      const visitor = s.users.find((u) => u.id === s.currentUserId);
      if (visitor?.shareProfileVisitActivity === false) return s;
      return {
        ...s,
        users: s.users.map((u) => {
          if (u.id !== targetUserId) return u;
          const next = [
            { userId: s.currentUserId!, at: Date.now() },
            ...(u.profileViews || []).filter((v) => v.userId !== s.currentUserId),
          ];
          return { ...u, profileViews: next.slice(0, 60) };
        }),
      };
    });
    const token = getApiToken();
    const visitorId = stateRef.current.currentUserId;
    if (token && apiBackendEnabled() && visitorId && !isGuestUserId(visitorId) && visitorId !== targetUserId) {
      void apiRecordProfileVisit(token, targetUserId);
    }
  };
  const touchQuranBot = () =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const channel = s.chats.find((c) => c.id === QURAN_CHANNEL_ID);
      if (!channel) return s;
      const lastBotMessage = [...channel.messages]
        .reverse()
        .find((m) => m.senderId === BOT_USER_ID);
      const oneHourMs = 60 * 60_000;
      const withMember = {
        ...s,
        chats: s.chats.map((c) =>
          c.id === QURAN_CHANNEL_ID && !c.members.includes(s.currentUserId!)
            ? { ...c, members: [...c.members, s.currentUserId!] }
            : c,
        ),
      };
      if (lastBotMessage && Date.now() - lastBotMessage.createdAt < oneHourMs) return withMember;
      const botMessage: Message = {
        id: uid(),
        senderId: BOT_USER_ID,
        type: "text",
        content: pickBotDuaContent(),
        createdAt: Date.now(),
      };
      return {
        ...withMember,
        chats: withMember.chats.map((c) =>
          c.id === QURAN_CHANNEL_ID ? { ...c, messages: [...c.messages, botMessage] } : c,
        ),
      };
    });

  const enterGuestBrowseMode = () => {
    setState((s) => {
      const hasGuest = s.users.some((u) => u.id === GUEST_LOCAL_USER_ID);
      const users = hasGuest ? s.users : [...s.users, mkGuestUser()];
      return {
        ...s,
        users,
        currentUserId: GUEST_LOCAL_USER_ID,
        accountIds: [GUEST_LOCAL_USER_ID],
      };
    });
    queueMicrotask(() => {
      try {
        window.dispatchEvent(new CustomEvent("retweet-close-modals"));
      } catch {
        /* ignore */
      }
    });
  };

  const exitGuestBrowseMode = () => {
    setState((s) => ({
      ...s,
      currentUserId: null,
      accountIds: s.accountIds.filter((id) => !isGuestUserId(id)),
      users: s.users.filter((u) => !isGuestUserId(u.id)),
    }));
  };

  const mergeDiscoveredUsers = useCallback<Ctx["mergeDiscoveredUsers"]>((incoming) => {
    if (!incoming.length) return;
    setState((s) => {
      const byId = new Map(s.users.map((u) => [u.id, u]));
      let changed = false;
      let cacheTouched = false;
      for (const u of incoming) {
        if (isGuestUserId(u.id)) continue;
        cachePublicProfileFromUser(u);
        cacheTouched = true;
        const prev = byId.get(u.id);
        const next = mergeDirectoryUser(prev, {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar ?? u.username.slice(0, 2),
          bio: u.bio,
          verified: u.verified,
          founderVerified: u.founderVerified,
          founderOfficialLabel: u.founderOfficialLabel,
          appOfficialVerified: u.appOfficialVerified,
          appOfficialLabel: u.appOfficialLabel,
          supportOfficialVerified: u.supportOfficialVerified,
          supportOfficialLabel: u.supportOfficialLabel,
          isPrivate: u.isPrivate,
          followers: u.followers,
          following: u.following,
          followerCount: typeof u.displayFollowerCount === "number" ? u.displayFollowerCount : undefined,
          followingCount: undefined,
        });
        if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
          byId.set(u.id, next);
          changed = true;
        }
      }
      if (!changed && !cacheTouched) return s;
      if (!changed) return { ...s };
      return { ...s, users: [...byId.values()] };
    });
  }, [setState]);

  const refreshUserDirectory = useCallback(async () => {
    if (!apiBackendEnabled() || !getApiToken()) return;
    if (isGuestUserId(stateRef.current.currentUserId)) return;
    if (hydrateRemoteBusy.current || groupSyncBusyRef.current) return;
    const rows = await apiFetchUserDirectory();
    if (!rows.length) return;
    for (const row of rows) cachePublicProfileFromApi(row);
    mergeDiscoveredUsers(rows.map(userFromSearchResult));
  }, [mergeDiscoveredUsers]);

  const hardResyncFromServer = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!apiBackendEnabled()) return { ok: false, error: "الخادم غير مفعّل" };
    const token = getApiToken();
    const activeId = stateRef.current.currentUserId;
    if (!token || !activeId || isGuestUserId(activeId)) {
      return { ok: false, error: "سجّل الدخول أولاً" };
    }
    try {
      localStorage.removeItem(`retweet_account_state_${activeId}`);
      localStorage.removeItem("retweet_state_v2");
    } catch {
      /* ignore */
    }
    const remote = await pullRemoteAppState(token);
    if (!remote) return { ok: false, error: "تعذر الاتصال بالخادم" };
    const { markServerHydrated } = await import("./remotePushGate");
    const merged = buildMultiAccountState(
      activeId,
      remote,
      { ...stateRef.current, posts: [], chats: [] },
      undefined,
      { serverAuthoritative: true },
    );
    markServerHydrated(activeId, merged);
    saveAccountStateCache(activeId, merged);
    setStateRaw(s =>
      preserveResolvedFollowRequestNotifications(
        s,
        buildMultiAccountState(activeId, remote, s, undefined, { serverAuthoritative: true }),
      ),
    );
    lastFullPullAtRef.current = Date.now();
    return { ok: true };
  }, []);

  const refreshFromServer = useCallback((opts?: { urgent?: boolean }) => {
    if (storyPublishBusyRef.current) return;
    if (!opts?.urgent && socialSyncBusyRef.current) return;
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(stateRef.current.currentUserId)) return;
    if (opts?.urgent) urgentPullRef.current = true;

    const runPull = () => {
      const urgent = urgentPullRef.current;
      urgentPullRef.current = false;
      if (
        hydrateRemoteBusy.current ||
        groupSyncBusyRef.current ||
        messageSendBusyRef.current ||
        (!urgent && socialSyncBusyRef.current) ||
        storyPublishBusyRef.current ||
        (!urgent && profileSaveBusyRef.current)
      ) {
        fullPullPendingRef.current = false;
        return;
      }
      void (async () => {
        const token = getApiToken();
        const activeId = stateRef.current.currentUserId;
        if (!token || !activeId || isGuestUserId(activeId)) {
          fullPullPendingRef.current = false;
          return;
        }
        const remote = await pullRemoteAppState(token);
        lastFullPullAtRef.current = Date.now();
        fullPullPendingRef.current = false;
        if (!remote) return;
        const nextPreview = buildMultiAccountState(
          activeId,
          remote,
          stateRef.current,
          undefined,
          { serverAuthoritative: true },
        );
        const { markServerHydrated } = await import("./remotePushGate");
        markServerHydrated(activeId, nextPreview);
        startTransition(() => {
          setStateRaw(s => {
            const next = preserveResolvedFollowRequestNotifications(
              s,
              buildMultiAccountState(activeId, remote, s, undefined, { serverAuthoritative: true }),
            );
            const meRow = next.users.find(u => u.id === activeId);
            const sess = meRow ? getAccountSession(activeId) : null;
            if (meRow && sess) {
              upsertAccountSession({
                ...sess,
                username: meRow.username,
                avatar: toStoredMediaRef(meRow.avatar),
              });
            }
            return next;
          });
        });
        void refreshUserDirectory();
        void (async () => {
          const feed = await apiFetchHomeFeed(token);
          if (feed.ok) {
            startTransition(() => {
              setStateRaw(s => mergeHomeFeedIntoState(s, feed));
            });
          }
        })();
      })();
    };

    const now = Date.now();
    const minGap = opts?.urgent ? MIN_URGENT_PULL_MS : MIN_FULL_PULL_MS;
    if (now - lastFullPullAtRef.current >= minGap) {
      if (fullPullTimerRef.current) {
        window.clearTimeout(fullPullTimerRef.current);
        fullPullTimerRef.current = null;
      }
      runPull();
      return;
    }
    if (fullPullPendingRef.current) return;
    fullPullPendingRef.current = true;
    if (fullPullTimerRef.current) window.clearTimeout(fullPullTimerRef.current);
    fullPullTimerRef.current = window.setTimeout(
      runPull,
      minGap - (now - lastFullPullAtRef.current),
    );
  }, [setStateRaw, refreshUserDirectory]);

  const refreshFeedFromServer = useCallback(async () => {
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(stateRef.current.currentUserId)) return;
    const token = getApiToken()!;
    const feed = await apiFetchHomeFeed(token);
    if (!feed.ok) return;
    startTransition(() => {
      setStateRaw(s => mergeHomeFeedIntoState(s, feed));
    });
    void refreshUserDirectory();
  }, [setStateRaw, refreshUserDirectory]);

  const refreshProfilePostsFromServer = useCallback(
    async (profileUserId: ID) => {
      if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(stateRef.current.currentUserId)) return;
      const token = getApiToken()!;
      const res = await apiFetchUserPosts(token, profileUserId);
      if (!res.ok) return;
      startTransition(() => {
        setStateRaw(s => {
          const posts = mergePostsPreservingLocalDeletes(s.posts || [], res.posts || []);
          const usersById = new Map(s.users.map(u => [u.id, u]));
          for (const u of res.users || []) {
            const prev = usersById.get(u.id);
            usersById.set(u.id, prev ? mergeUserFromServer(prev, u) : { ...u, password: "" });
          }
          return { ...s, posts, users: [...usersById.values()] };
        });
      });
    },
    [setStateRaw],
  );

  const scheduleFeedPull = useCallback(() => {
    if (feedPullDebounceRef.current != null) window.clearTimeout(feedPullDebounceRef.current);
    feedPullDebounceRef.current = window.setTimeout(() => {
      feedPullDebounceRef.current = null;
      void refreshFeedFromServer();
    }, 350);
  }, [refreshFeedFromServer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAuthFeed = () => {
      void refreshFeedFromServer();
      refreshFromServer({ urgent: true });
    };
    void import("./feedVisibility").then(({ AUTH_FEED_REFRESH_EVENT }) => {
      window.addEventListener(AUTH_FEED_REFRESH_EVENT, onAuthFeed);
    });
    return () => {
      void import("./feedVisibility").then(({ AUTH_FEED_REFRESH_EVENT }) => {
        window.removeEventListener(AUTH_FEED_REFRESH_EVENT, onAuthFeed);
      });
    };
  }, [refreshFromServer, refreshFeedFromServer]);

  const refreshSocialRelation = useCallback(
    (targetUserId: ID) => {
      void (async () => {
        await ensureApiRuntimeConfig();
        const token = getApiToken();
        const meId = stateRef.current.currentUserId;
        if (!token || !meId || isGuestUserId(meId) || !apiBackendEnabled()) return;
        const profileRow = await apiFetchUserById(targetUserId);
        if (profileRow) {
          cachePublicProfileFromApi(profileRow);
          mergeDiscoveredUsers([userFromSearchResult(profileRow)]);
        }
        const r = await apiGetSocialRelation(token, targetUserId);
        if (r.ok) {
          setStateRaw(s => applySocialRelationToState(s, meId, targetUserId, r.relation));
        }
      })();
    },
    [setStateRaw, mergeDiscoveredUsers],
  );

  const scheduleRemoteSync = useCallback(() => {
    if (
      hydrateRemoteBusy.current ||
      groupSyncBusyRef.current ||
      messageSendBusyRef.current ||
      socialSyncBusyRef.current ||
      storyPublishBusyRef.current ||
      profileSaveBusyRef.current
    )
      return;
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(stateRef.current.currentUserId)) return;
    if (remoteSyncTimerRef.current) window.clearTimeout(remoteSyncTimerRef.current);
    remoteSyncTimerRef.current = window.setTimeout(() => {
      remoteSyncTimerRef.current = null;
      refreshFromServer();
    }, 4000);
  }, [refreshFromServer]);

  /** تحديث فوري عبر SSE (رسائل، لايكات، حسابات جديدة) */
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    if (!getApiToken()) return;
    if (isGuestUserId(state.currentUserId)) return;
    return subscribeRealtimeEvents((event, data) => {
      if (event === "typing") {
        const payload = data as { chatId?: string; userId?: string; active?: boolean };
        if (!payload?.chatId || !payload?.userId) return;
        const chatId = payload.chatId;
        const typerId = payload.userId;
        const meId = stateRef.current.currentUserId;
        const chatKeys = new Set<string>([chatId]);
        if (meId && typerId !== meId) {
          chatKeys.add(dmChatId(meId, typerId));
        }
        const timerKey = `${chatId}:${typerId}`;
        const existing = typingIndicatorTimersRef.get(timerKey);
        if (existing) {
          clearTimeout(existing);
          typingIndicatorTimersRef.delete(timerKey);
        }
        if (payload.active) {
          setTypingUserByChatId(prev => {
            const next = { ...prev };
            for (const key of chatKeys) next[key] = typerId;
            return next;
          });
          typingIndicatorTimersRef.set(
            timerKey,
            setTimeout(() => {
              typingIndicatorTimersRef.delete(timerKey);
              setTypingUserByChatId(prev => {
                let changed = false;
                const next = { ...prev };
                for (const key of chatKeys) {
                  if (next[key] !== typerId) continue;
                  delete next[key];
                  changed = true;
                }
                return changed ? next : prev;
              });
            }, 4_000),
          );
        } else {
          setTypingUserByChatId(prev => {
            let changed = false;
            const next = { ...prev };
            for (const key of chatKeys) {
              if (next[key] !== typerId) continue;
              delete next[key];
              changed = true;
            }
            return changed ? next : prev;
          });
        }
        return;
      }
      if (event === "message_status") {
        const payload = data as {
          chatId?: string;
          messageIds?: string[];
          status?: Message["status"];
        };
        if (!payload?.chatId || !payload.messageIds?.length || !payload.status) return;
        setState(s => {
          if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
          const ids = new Set(payload.messageIds);
          return {
            ...s,
            chats: s.chats.map(c => {
              if (c.id !== payload.chatId && chatMergeKey(c, s.currentUserId) !== payload.chatId)
                return c;
              return {
                ...c,
                messages: (c.messages || []).map(m =>
                  ids.has(m.id) && m.senderId === s.currentUserId
                    ? { ...m, status: payload.status }
                    : m,
                ),
              };
            }),
          };
        });
        return;
      }
      if (event === "user_registered") {
        const payload = data as { user?: Parameters<typeof userFromSearchResult>[0] };
        if (!payload?.user?.id) return;
        const user = userFromSearchResult(payload.user);
        mergeDiscoveredUsers([user]);
        try {
          window.dispatchEvent(new CustomEvent(USER_REGISTERED_WINDOW_EVENT, { detail: user }));
        } catch {
          /* ignore */
        }
        return;
      }
      if (event === "call:signal") {
        void handleRemoteCallSignal(data as CallSignalPayload);
        return;
      }
      if (event === "call:ring") {
        const payload = data as IncomingCallRing;
        if (!payload?.chatId || !payload?.fromUserId) return;
        try {
          window.dispatchEvent(
            new CustomEvent(INCOMING_CALL_WINDOW_EVENT, { detail: payload }),
          );
        } catch {
          /* ignore */
        }
        return;
      }
      if (event === "group_invite") {
        const payload = data as { chat?: Chat; fromUserId?: string };
        if (!payload?.chat?.id) return;
        setState(s => {
          if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
          const meId = s.currentUserId;
          const existing = s.chats.find(c => c.id === payload.chat!.id);
          const remoteMembers = payload.chat!.members || [];
          const unionMembers = Array.from(
            new Set([...(existing?.members || []), ...remoteMembers, meId]),
          );
          const members =
            remoteMembers.length >= unionMembers.length ? remoteMembers : unionMembers;
          const remoteChat = normalizeChatRecord(payload.chat!);
          let merged: Chat = existing
            ? {
                ...existing,
                ...remoteChat,
                members: members.includes(meId) ? members : [...members, meId],
                messages: mergeChatMessages(existing.messages || [], remoteChat.messages || []),
                hiddenMessageIdsByUser: mergeHiddenMessageIdsByUser(
                  existing.hiddenMessageIdsByUser,
                  remoteChat.hiddenMessageIdsByUser,
                  meId,
                ),
              }
            : {
                ...remoteChat,
                members: members.includes(meId) ? members : [...members, meId],
              };
          if (!merged.members.includes(meId)) {
            merged = { ...merged, members: [...merged.members, meId] };
          }
          const has = s.chats.some(c => c.id === merged.id);
          return {
            ...s,
            chats: has ? s.chats.map(c => (c.id === merged.id ? merged : c)) : [...s.chats, merged],
          };
        });
        return;
      }
      if (event === "message_new") {
        const payload = data as {
          chatId?: string;
          message?: Message;
          request?: boolean;
          members?: string[];
          isGroup?: boolean;
        };
        if (!payload?.chatId || !payload?.message) return;
        skipNextAutoPushRef.current = true;
        setState(s => {
          if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
          const meId = s.currentUserId;
          let chat = s.chats.find(c => c.id === payload.chatId);
          if (!chat && payload.members?.length === 2 && !payload.isGroup) {
            const peer = payload.members.find(id => id !== meId);
            const existing = peer ? findDmChatForPeer(s.chats, meId, peer) : null;
            chat =
              existing ??
              ({
                id: peer ? dmChatId(meId, peer) : payload.chatId!,
                isGroup: false,
                members: payload.members,
                admins: [],
                messages: [],
                request: payload.request === true,
                lastOpenAtByUser: {},
                lastReadMessageIdByUser: {},
              } as Chat);
          }
          if (!chat && payload.isGroup && payload.members?.length) {
            chat = {
              id: payload.chatId!,
              isGroup: true,
              members: payload.members,
              admins: [],
              messages: [],
              lastOpenAtByUser: {},
              lastReadMessageIdByUser: {},
            };
          }
          if (!chat) return s;
          if (!chat.members.includes(meId)) return s;
          let incoming = payload.message!;
          const otherOwnedOnDevice = new Set(
            listAccountSessions().map(x => x.userId).filter(id => id !== meId),
          );
          if (otherOwnedOnDevice.has(incoming.senderId)) return s;
          if (!messageBelongsToChatForOwner(incoming, chat, meId)) return s;
          const existing = (chat.messages || []).find(m => m.id === incoming.id);
          if (existing) {
            if (existing.senderId !== incoming.senderId && existing.senderId === meId) return s;
            if (
              existing.content === incoming.content &&
              existing.type === incoming.type &&
              existing.createdAt === incoming.createdAt
            ) {
              return s;
            }
            incoming = { ...existing, ...incoming };
          }
          const mergedMsgs = mergeChatMessages(chat.messages || [], [
            normalizeChatMessage(incoming) ?? incoming,
          ]);
          const updatedRaw: Chat = {
            ...chat,
            messages: mergedMsgs,
            request: payload.request === true ? true : chat.request,
          };
          const scopedChat = scopeAppStateToAccount(meId, {
            ...s,
            chats: [updatedRaw],
          }).chats[0];
          if (!scopedChat) return s;
          const updated: Chat = { ...scopedChat, request: updatedRaw.request };
          const mergeKey = chatMergeKey(updated, meId);
          const chatIdx = s.chats.findIndex(
            c =>
              c.id === chat!.id ||
              c.id === updated.id ||
              chatMergeKey(c, meId) === mergeKey,
          );
          if (chatIdx >= 0) {
            const nextChats = s.chats.slice();
            nextChats[chatIdx] = { ...updated, id: mergeKey };
            return { ...s, chats: nextChats };
          }
          const deduped = s.chats.filter(
            c =>
              c.id !== chat!.id &&
              c.id !== updated.id &&
              chatMergeKey(c, meId) !== mergeKey,
          );
          return { ...s, chats: [...deduped, { ...updated, id: mergeKey }] };
        });
        const meId = stateRef.current.currentUserId;
        const incoming = payload.message;
        if (
          meId &&
          !isGuestUserId(meId) &&
          incoming?.id &&
          incoming.senderId !== meId
        ) {
          const isDm = payload.members?.length === 2 && !payload.isGroup;
          const peer = payload.members?.find(id => id !== meId);
          const storageId =
            isDm && peer ? dmChatId(meId, peer) : payload.chatId!;
          emitMessagesDelivered(storageId, [incoming.id]);
        }
        return;
      }
      if (event === "social_graph_update") {
        const payload = data as { peerId?: string; relation?: SocialRelation };
        if (!payload?.peerId || !payload.relation) return;
        setState(s => {
          const meId = s.currentUserId;
          if (!meId || isGuestUserId(meId)) return s;
          return applySocialRelationToState(s, meId, payload.peerId!, payload.relation!);
        });
        return;
      }
      if (event === "social_update") {
        const payload = data as { notification?: Notification };
        if (payload?.notification) {
          setState(s => {
            if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
            const n = payload.notification!;
            if (n.userId !== s.currentUserId) return s;
            if ((s.notifications || []).some(x => x.id === n.id)) return s;
            return { ...s, notifications: [n, ...(s.notifications || [])].slice(0, 200) };
          });
        }
        if (payload?.notification?.type !== "follow" && !socialSyncBusyRef.current) {
          scheduleRemoteSync();
        }
        return;
      }
      if (event === "streak_update") {
        const payload = data as { chatId?: string; streak?: import("./types").ChatStreak };
        if (payload?.chatId && payload.streak) {
          const { chatId, streak } = payload;
          setState(s => ({
            ...s,
            chats: s.chats.map(c =>
              c.id === chatId || c.id.replace("dm:", "") === chatId.replace("dm:", "")
                ? { ...c, streak }
                : c,
            ),
          }));
        }
        return;
      }
      if (event === "post_update") {
        const payload = data as { post?: Post };
        const patch = payload?.post;
        if (!patch?.id) return;
        setState(s => {
          if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
          const i = s.posts.findIndex(p => p.id === patch.id);
          if (i < 0) {
            return { ...s, posts: [patch, ...s.posts].sort((a, b) => b.createdAt - a.createdAt) };
          }
          const prev = s.posts[i];
          const comments =
            patch.comments.length > 0
              ? patch.comments
              : prev.comments;
          return {
            ...s,
            posts: s.posts.map(p =>
              p.id === patch.id
                ? {
                    ...p,
                    ...patch,
                    likes: patch.likes,
                    reposts: patch.reposts,
                    comments,
                  }
                : p,
            ),
          };
        });
        void (async () => {
          const row = await apiFetchUserById(patch.userId);
          if (row) mergeDiscoveredUsers([userFromSearchResult(row)]);
        })();
        scheduleFeedPull();
        return;
      }
      if (event === "group:updated") {
        const payload = data as { chatId?: string; patch?: Partial<Chat> };
        if (!payload?.chatId || !payload.patch) return;
        setState(s => ({
          ...s,
          chats: s.chats.map(c =>
            c.id === payload.chatId ? normalizeChatRecord({ ...c, ...payload.patch }) : c,
          ),
        }));
        return;
      }
      if (event === "group:deleted") {
        const payload = data as { chatId?: string };
        if (!payload?.chatId) return;
        setState(s => ({
          ...s,
          chats: s.chats.filter(c => c.id !== payload.chatId),
        }));
        return;
      }
      if (event === "account:moderation") {
        try {
          window.dispatchEvent(new CustomEvent("retweet-account-moderation", { detail: data }));
        } catch {
          /* ignore */
        }
        return;
      }
      if (event === "sync_hint") {
        const kind = (data as { kind?: string })?.kind;
        if (kind === "feed" || kind === "story") {
          scheduleFeedPull();
          return;
        }
        if (kind === "chats" || kind === "profile") {
          if (!profileSaveBusyRef.current) refreshFromServer({ urgent: false });
          return;
        }
        if (!socialSyncBusyRef.current) scheduleRemoteSync();
        return;
      }
      if (event === "user_profile_updated") {
        const payload = data as { user?: Parameters<typeof userFromSearchResult>[0]; userId?: string; avatar?: string };
        if (payload?.user?.id) {
          const row = payload.user;
          const meId = stateRef.current.currentUserId;
          skipNextAutoPushRef.current = true;
          if (meId && row.id === meId) {
            const av = toStoredMediaRef(row.avatar);
            setState(s => ({
              ...s,
              users: s.users.map(u =>
                u.id === meId
                  ? withFounderProfileFields(
                      mergeUserProfilePatch(u, {
                        id: meId,
                        username: row.username,
                        displayName: row.displayName,
                        avatar: av,
                        bio: row.bio,
                        verified: row.verified === true,
                        founderVerified: row.founderVerified === true,
                        founderOfficialLabel: row.founderOfficialLabel,
                        isSubscribed: row.isSubscribed === true,
                        subscriptionPlan: row.subscriptionPlan,
                        subscriptionExpiresAt: row.subscriptionExpiresAt,
                        verificationStatus: row.verificationStatus,
                        verificationBadgeColor: row.verificationBadgeColor,
                        canUseAnimatedAvatar: row.canUseAnimatedAvatar === true,
                        storyMaxDuration: row.storyMaxDuration,
                        storyExpiryOptions: row.storyExpiryOptions,
                        postCharacterLimit: row.postCharacterLimit,
                      }),
                    )
                  : u,
              ),
            }));
            const sess = getAccountSession(meId);
            if (sess) {
              upsertAccountSession({
                ...sess,
                username: row.username,
                avatar: av,
              });
            }
            saveAccountStateCache(meId, {
              ...stateRef.current,
              users: stateRef.current.users.map(u =>
                u.id === meId
                  ? withFounderProfileFields(
                      mergeUserProfilePatch(u, {
                        id: meId,
                        username: row.username,
                        displayName: row.displayName,
                        avatar: av,
                        bio: row.bio,
                        verified: row.verified === true,
                        founderVerified: row.founderVerified === true,
                        founderOfficialLabel: row.founderOfficialLabel,
                        isSubscribed: row.isSubscribed === true,
                        subscriptionPlan: row.subscriptionPlan,
                        subscriptionExpiresAt: row.subscriptionExpiresAt,
                        verificationStatus: row.verificationStatus,
                        verificationBadgeColor: row.verificationBadgeColor,
                        canUseAnimatedAvatar: row.canUseAnimatedAvatar === true,
                        storyMaxDuration: row.storyMaxDuration,
                        storyExpiryOptions: row.storyExpiryOptions,
                        postCharacterLimit: row.postCharacterLimit,
                      }),
                    )
                  : u,
              ),
            });
            return;
          }
          const merged = userFromSearchResult(row);
          mergeDiscoveredUsers([merged]);
          return;
        }
        if (!payload?.userId) return;
        const av = payload.avatar;
        if (!av) return;
        setState(s => ({
          ...s,
          users: s.users.map(u => (u.id === payload.userId ? { ...u, avatar: av } : u)),
        }));
      }
    });
  }, [
    state.currentUserId,
    mergeDiscoveredUsers,
    scheduleRemoteSync,
    refreshFromServer,
    scheduleFeedPull,
    setState,
  ]);

  useEffect(() => {
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(state.currentUserId)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      scheduleFeedPull();
      scheduleRemoteSync();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [state.currentUserId, scheduleRemoteSync, scheduleFeedPull]);

  useEffect(() => {
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(state.currentUserId)) return;
    void refreshUserDirectory();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshUserDirectory();
    }, 90_000);
    return () => window.clearInterval(id);
  }, [state.currentUserId, refreshUserDirectory]);

  const ctxActionsRef = useRef({} as Omit<
    Ctx,
    "state" | "currentUser" | "isGuest" | "accountSwitching" | "accountSessionKey" | "typingUserByChatId"
  >);
  ctxActionsRef.current = {
    setState,
    enterGuestBrowseMode,
    exitGuestBrowseMode,
    mergeDiscoveredUsers,
    refreshUserDirectory,
    refreshFromServer,
    refreshFeedFromServer,
    refreshProfilePostsFromServer,
    hardResyncFromServer,
    refreshSocialRelation,
    signup,
    login,
    verifyLogin,
    resetPasswordForUser,
    requestPasswordResetRemote,
    completePasswordResetRemote,
    completePasswordResetLink,
    changeOwnPassword,
    logout,
    switchAccount,
    removeAccount,
    updateProfile,
    toggleFollow,
    acceptFollowRequest,
    declineFollowRequest,
    joinChannel,
    toggleBlock,
    toggleBlockWithSync,
    toggleCloseFriend,
    createPost,
    toggleLike,
    toggleStoryLike,
    recordStoryView,
    toggleFavorite,
    touchQuranBot,
    toggleRepost,
    addComment,
    deleteComment,
    deletePost,
    deleteStory,
    addStory,
    addHighlight,
    openOrCreateChat,
    createGroup,
    createChannel,
    toggleHost,
    leaveChat,
    sendMessage,
    loadChatMessages,
    markViewOnceOpened,
    hideMessageForMe,
    addMessageReaction,
    forwardMessage,
    pinChatMessage,
    unpinChatMessage,
    addFavoriteStickerContent,
    addCreatedStickerContent,
    renameGroup,
    updateGroupAvatar,
    toggleGroupAdmin,
    kickMember,
    muteGroupMember,
    setGroupPublic,
    joinGroupByInviteCode,
    respondGroupJoinRequest,
    addGroupMembers,
    setGroupNickname,
    acceptRequest,
    deleteChat,
    toggleChatListPin,
    toggleChatMute,
    setNote,
    createSticker,
    markNotificationsRead,
    markNotificationRead,
    addMediaNote,
    markChatOpened,
    markChatRead,
    replyToMediaNoteAsDm,
    replyToProfileNoteAsDm,
    recordProfileVisit,
    voteStoryPoll,
    answerStoryQuiz,
    rateStorySlider,
  };

  const value = useMemo<Ctx>(
    () => ({
      state,
      currentUser,
      isGuest,
      accountSwitching,
      accountSessionKey,
      typingUserByChatId: {} as Record<ID, ID>,
      ...ctxActionsRef.current,
    }),
    [state, currentUser, isGuest, accountSwitching, accountSessionKey],
  );

  const uiLang: "ar" | "en" =
    state.language === "en" &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("retweet_lang_en") === "1"
      ? "en"
      : "ar";

  return (
    <AppLanguageCtx.Provider value={uiLang}>
      <TypingCtx.Provider value={typingUserByChatId}>
        <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
      </TypingCtx.Provider>
    </AppLanguageCtx.Provider>
  );
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("يجب استخدام التطبيق داخل مزوّد الحالة (AppProvider)");
  return ctx;
}

/** حالة «يكتب» فقط — لا تُعيد رسم المكوّنات التي لا تعرض مؤشر الكتابة */
export { useTypingUsers } from "./typingContext";

export function userById(state: AppState, id: ID) {
  const u = resolveUserProfile(state, id);
  return u ? withOfficialAppProfileFields(withFounderProfileFields(u)) : undefined;
}

/** رسائل المحادثة الظاهرة للمستخدم (بعد استبعاد «حذف عندك فقط») */
export function visibleChatMessages(chat: Chat, viewerId: ID): Message[] {
  const base = (chat.messages || []).filter(m => messageBelongsToChatForOwner(m, chat, viewerId));
  const hid = chat.hiddenMessageIdsByUser?.[viewerId];
  if (!hid?.length) return base;
  const hidden = new Set(hid);
  return base.filter(m => !hidden.has(m.id));
}

export function isMutual(state: AppState, a: ID, b: ID) {
  const ua = userById(state, a);
  const ub = userById(state, b);
  return !!(ua && ub && ua.following.includes(b) && ub.following.includes(a));
}

/** هل `followerId` يتابع `followeeId` (من قائمة following وليس followers) */
export function userIsFollowing(state: AppState, followerId: ID, followeeId: ID): boolean {
  const u = userById(state, followerId);
  return !!(u && u.following.includes(followeeId));
}

/** هل الطرف الآخر يتابع المشاهد */
export function theyFollowViewer(state: AppState, viewerId: ID, otherId: ID): boolean {
  return userIsFollowing(state, otherId, viewerId);
}

export function canViewProfile(state: AppState, viewerId: ID | null, targetId: ID): boolean {
  const target = userById(state, targetId);
  if (!target) return false;
  if (!viewerId) return !target.isPrivate;
  if (viewerId === targetId) return true;
  const viewer = userById(state, viewerId);
  if (viewer?.blocked.includes(targetId)) return false;
  if (target.blocked.includes(viewerId)) return false;
  return true;
}

/**
 * حساب خاص: نسمح بالرؤية إن كان المرء في قائمة متابعيه، أو كان المشاهد يتابعه
 * (قائمة `me.following` أحياناً أوضح في حالة حساب مقطوع عن state أو قوائم followers ناقصة).
 */
export { viewerCanSeePrivateAuthorContent } from "./storyVisibility";

/** منشورات وريبوستات وإعجابات الحساب الخاص: للمتابعين أو صاحب الحساب فقط */
export function canViewPrivatePosts(state: AppState, viewerId: ID | null, targetId: ID): boolean {
  const target = userById(state, targetId);
  if (!target) return false;
  if (!viewerId) return !target.isPrivate;
  if (viewerId === targetId) return true;
  if (!target.isPrivate) return true;
  return viewerCanSeePrivateAuthorContent(state, viewerId, targetId, (st, id) => userById(st, id));
}

export function isStoryActive(story: StoryItem, now = Date.now(), state?: AppState): boolean {
  try {
    if (state) {
      const author = state.users.find(u => u.id === story.userId);
      if (author) return isStoryStillActive(story, getUserEntitlements(author), now);
    }
    const hours = typeof story.expiryHours === "number" && [24, 48, 72].includes(story.expiryHours)
      ? story.expiryHours
      : 24;
    return story.createdAt + hours * 60 * 60 * 1000 > now;
  } catch {
    return story.createdAt > now - STORY_TTL_MS;
  }
}

/** قصص منتهية الصلاحية في أرشيف المستخدم — الأحدث أولاً */
export function archivedStoriesForUser(state: AppState, userId: ID): StoryItem[] {
  return (state.storyArchive || [])
    .filter((s) => s.userId === userId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** ستوريات حساب معيّن كما يراها المشاهد (نشطة خلال ٢٤ ساعة) */
export function storiesForUser(state: AppState, authorId: ID, viewerId: ID): StoryItem[] {
  return storiesVisibleToViewer(state, viewerId, (st, id) => userById(st, id))
    .filter(s => s.userId === authorId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function userHasVisibleStories(state: AppState, viewerId: ID, authorId: ID): boolean {
  return storiesForUser(state, authorId, viewerId).length > 0;
}

/** ترتيب حسابات الستوري في الشريط (أحدث ستوري أولاً) */
export function visibleStoryUserIds(state: AppState, viewerId: ID): ID[] {
  const latest = new Map<ID, number>();
  for (const s of storiesVisibleToViewer(state, viewerId, (st, id) => userById(st, id))) {
    latest.set(s.userId, Math.max(latest.get(s.userId) ?? 0, s.createdAt));
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/** متابعون/أصدقاء متبادلون لديهم ستوريات (لشريط الرئيسية) */
export function visibleStoryFriendsUserIds(state: AppState, viewerId: ID): ID[] {
  const me = userById(state, viewerId);
  if (!me) return [];
  return visibleStoryUserIds(state, viewerId).filter((id) => {
    if (id === viewerId) return false;
    return me.following.includes(id);
  });
}

/** صاحب الستوري التالي في الحلقة (دائري) */
export function nextStoryAuthorInRing(ring: ID[], current: ID): ID | null {
  if (ring.length <= 1) return null;
  const i = ring.indexOf(current);
  if (i < 0) return ring[0] ?? null;
  return ring[(i + 1) % ring.length];
}

/** الحساب التالي في شريط الستوريات بنفس الترتيب — بدون العودة للبداية (عند آخر حساب يرجع `null` لإغلاق العارض) */
export function nextStoryAuthorAfter(ring: ID[], current: ID): ID | null {
  const i = ring.indexOf(current);
  if (i < 0 || i >= ring.length - 1) return null;
  return ring[i + 1] ?? null;
}

/** نوتات تظهر للمشاهد على منشور/ستوري (النفس + الأصدقاء المتبادلين) */
export function visibleMediaNotes(
  state: AppState,
  kind: MediaNote["kind"],
  targetId: ID,
  viewerId: ID,
) {
  return state.mediaNotes.filter((n) => {
    if (n.kind !== kind || n.targetId !== targetId) return false;
    if (n.authorId === viewerId) return true;
    return isMutual(state, viewerId, n.authorId);
  });
}

export function trendingHashtags(state: AppState, limit = 10) {
  const counts = new Map<string, number>();
  state.posts.forEach((p) => {
    const tags = p.text.match(/#[\p{L}\w]+/gu) || [];
    tags.forEach((t) =>
      counts.set(t, (counts.get(t) || 0) + 1 + p.likes.length + p.reposts.length),
    );
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
