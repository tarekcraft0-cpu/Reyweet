import {
  createContext,
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
  ensureApiRuntimeConfig,
  pullRemoteAppState,
  pushRemoteAppState,
  apiCreateStory,
  apiRequestPasswordReset,
  setApiToken,
  apiPostMessage,
  apiFetchChatMessages,
  mergeChatMessages,
  userFromSearchResult,
  apiFetchUserDirectory,
  apiCreateGroup,
  apiAddGroupMembers,
  apiPatchGroup,
  apiKickGroupMember,
  apiLeaveGroup,
  apiFetchGroupInvitePreview,
  apiJoinGroupByInvite,
  apiRespondGroupJoinRequest,
} from "./apiBackend";
import { subscribeRealtimeEvents, USER_REGISTERED_WINDOW_EVENT } from "./realtimeEvents";
import {
  disconnectRealtimeSocketHard,
  emitDirectMessage,
  isRealtimeSocketConnected,
} from "./realtimeSocket";
import { handleRemoteCallSignal, type CallSignalPayload, type IncomingCallRing } from "./webrtcCall";

export const INCOMING_CALL_WINDOW_EVENT = "retweet-call-ring";
import { logAuthRoute } from "./authRouteDebug";
import {
  activateAccountSession,
  getAccountSession,
  getLastActiveUserId,
  listAccountSessions,
  loadAccountStateCache,
  isolateUsersForAccountCache,
  mergeUsersForAccounts,
  migrateLegacyApiToken,
  reconcileOwnedAccountProfiles,
  removeAccountSession,
  ensureApiTokenMatchesUser,
  restoreActiveSessionOnLaunch,
  saveAccountStateCache,
  setLastActiveUserId,
  syncActiveApiToken,
  upsertAccountSession,
} from "./accountSessions";
import {
  applyAuthoritativeProfile,
  mergeDirectoryUser,
  mergeUserFromServer,
  mergeUserProfilePatch,
} from "./mergeUserSocial";
import { withFounderProfileFields } from "./founderAccount";
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
  const L = LEGACY_FOUNDER_USER_ID;
  const CH = LEGACY_FOUNDER_CHANNEL_ID;
  const stripUser = (id: string) => id !== L;

  const users = (s.users || [])
    .filter(u => u.id !== L)
    .map(u => ({
      ...u,
      followers: (u.followers || []).filter(stripUser),
      following: (u.following || []).filter(stripUser),
      followRequestIn: (u.followRequestIn || []).filter(stripUser),
      followRequestOut: (u.followRequestOut || []).filter(stripUser),
      blocked: (u.blocked || []).filter(stripUser),
      closeFriends: (u.closeFriends || []).filter(stripUser),
      profileViews: (u.profileViews || []).filter(pv => pv.userId !== L),
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
      let createdByUserId = c.createdByUserId === L ? undefined : c.createdByUserId;
      if (c.isChannel && !createdByUserId && admins[0]) createdByUserId = admins[0];
      const lastOpenAtByUser = { ...(c.lastOpenAtByUser || {}) };
      delete lastOpenAtByUser[L];
      const lastReadMessageIdByUser = { ...(c.lastReadMessageIdByUser || {}) };
      delete lastReadMessageIdByUser[L];
      const messages = (c.messages || [])
        .filter(msg => msg.senderId !== L)
        .map(msg => ({
          ...msg,
          viewOnceOpenedByUserIds: (msg.viewOnceOpenedByUserIds || []).filter(stripUser),
          reactions: (msg.reactions || []).filter(r => r.userId !== L),
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
    .filter(p => p.userId !== L)
    .map(p => ({
      ...p,
      likes: (p.likes || []).filter(stripUser),
      reposts: (p.reposts || []).filter(stripUser),
      comments: (p.comments || []).filter(c => c.userId !== L),
    }));

  const stories = (s.stories || [])
    .filter(st => st.userId !== L)
    .map(st => ({
      ...st,
      likes: (st.likes || []).filter(stripUser),
      stickers: cleanStoryStickersForLegacyUser(st.stickers, L),
    }));

  const stickers = (s.stickers || []).filter(st => st.userId !== L);
  const notifications = (s.notifications || []).filter(n => n.userId !== L && n.fromId !== L);
  const mediaNotes = (s.mediaNotes || []).filter(mn => mn.authorId !== L);
  const currentUserId = s.currentUserId === L ? null : s.currentUserId;
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
    id: "u_sara",
    username: "sara_q",
    email: "sara@x.com",
    password: "12345678",
    avatar: "SQ",
    bio: "مصممة | قهوة ☕",
    note: "اليوم حلو 🌸",
    noteAt: Date.now(),
  }),
  mkUser({
    id: "u_omar",
    username: "omar.dev",
    email: "omar@x.com",
    password: "12345678",
    avatar: "OD",
    bio: "",
    note: "أكوّد",
    noteAt: Date.now(),
  }),
  mkUser({
    id: "u_lina",
    username: "lina_art",
    email: "lina@x.com",
    password: "12345678",
    avatar: "LA",
    bio: "فنانة 🎨",
    isPrivate: true,
  }),
  mkUser({
    id: "u_tariq_bot",
    username: "tareq_bot",
    email: "tareq.bot@retweet.app",
    password: "bot",
    avatar: "RT",
    bio: "بوت طارق رمدي — أدعية وتذكير",
  }),
];
seedUsers[0].followers = ["u_omar", "u_lina"];
seedUsers[0].following = ["u_omar"];
seedUsers[1].followers = ["u_sara"];
seedUsers[1].following = ["u_sara", "u_lina"];
seedUsers[2].followers = ["u_omar"];
seedUsers[2].following = ["u_sara"];

/** عينات فيديو قصيرة لريلز التجربة الأولى (روابط عامة) */
const SAMPLE_REEL_MP4 = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
];

const REEL_CAPTIONS = [
  "لحظة من اليوم ✨",
  "جولة سريعة 🎬",
  "تجربة كاميرا جديدة",
  "منشن صاحبك 👇",
  "صباح وطاقة ☀️",
  "خلف الكواليس",
  "يوم عادي بس حلو",
  "ريلز بدون فلتر",
  "مود اليوم 😎",
  "تحدي ١٥ ثانية",
  "من الطبيعة 🌿",
  "قهوة وشمس ☕",
  "وصلنا المليون؟ 😂",
  "ترند جديد تجربته",
  "لقطات الأسبوع",
  "تصوير سريع 📱",
  "مع أصحابي",
  "ليلة في المدينة 🌃",
  "ويكند",
  "ريلز عربي",
];

const seedPosts: Post[] = [
  {
    id: uid(),
    userId: "u_sara",
    type: "post",
    text: "يوم لطيف بالشاطئ #صيف #بحر",
    image: "🏖️",
    likes: ["u_omar"],
    reposts: [],
    comments: [{ id: uid(), userId: "u_omar", text: "روعة!", createdAt: Date.now() }],
    createdAt: Date.now() - 3600_000,
  },
  {
    id: uid(),
    userId: "u_omar",
    type: "tweet",
    text: "Swift أحلى من أي شي #كود #برمجة 🚀",
    likes: [],
    reposts: [],
    comments: [],
    createdAt: Date.now() - 7200_000,
  },
  {
    id: uid(),
    userId: "u_lina",
    type: "post",
    text: "لوحتي الجديدة #فن",
    image: "🖼️",
    likes: ["u_sara"],
    reposts: [],
    comments: [],
    createdAt: Date.now() - 10800_000,
  },
  {
    id: uid(),
    userId: "u_sara",
    type: "reel",
    text: "ريلز ترحيبي #ريلز",
    video: SAMPLE_REEL_MP4[0],
    likes: [],
    reposts: [],
    comments: [],
    createdAt: Date.now() - 14400_000,
  },
];

const seedReelAuthors = ["u_sara", "u_omar", "u_lina"] as const;
for (let i = 0; i < 20; i++) {
  seedPosts.push({
    id: uid(),
    userId: seedReelAuthors[i % seedReelAuthors.length],
    type: "reel",
    text: `${REEL_CAPTIONS[i % REEL_CAPTIONS.length]} #ريلز`,
    video: SAMPLE_REEL_MP4[i % SAMPLE_REEL_MP4.length],
    likes: i % 4 === 0 ? ["u_omar"] : [],
    reposts: [],
    comments: [],
    createdAt: Date.now() - (20 - i) * 900_000 - 60_000,
  });
}

const seedStories: StoryItem[] = [
  {
    id: uid(),
    userId: "u_sara",
    image: "🌅",
    createdAt: Date.now(),
    audience: "all",
    likes: [],
    viewedByUserIds: ["u_omar", "u_lina"],
  },
  { id: uid(), userId: "u_omar", image: "💻", createdAt: Date.now(), audience: "all", likes: [], viewedByUserIds: ["u_sara"] },
  { id: uid(), userId: "u_lina", image: "🎨", createdAt: Date.now(), audience: "all", likes: [], viewedByUserIds: [] },
];

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
  stickers: [
    { id: uid(), userId: "u_sara", emoji: "✨", label: "نجمة" },
    { id: uid(), userId: "u_sara", emoji: "🔥", label: "نار" },
    { id: uid(), userId: "u_sara", emoji: "💯", label: "مية" },
    { id: uid(), userId: "u_omar", emoji: "👍", label: "تمام" },
    { id: uid(), userId: "u_omar", emoji: "❤️", label: "قلب" },
    { id: uid(), userId: "u_lina", emoji: "🎨", label: "فن" },
  ],
  notifications: [],
  mediaNotes: [],
  currentUserId: null,
  accountIds: [],
  theme: "light",
  language: "ar",
};

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
  if (!m.chats.some((c) => c.id === QURAN_CHANNEL_ID)) {
    m.chats = [...initial.chats.filter((c) => c.id === QURAN_CHANNEL_ID), ...m.chats];
  }

  m.chats = m.chats.map((c) => {
    let cc = {
      ...c,
      lastOpenAtByUser: c.lastOpenAtByUser || {},
      lastReadMessageIdByUser: c.lastReadMessageIdByUser || {},
      pinnedMessageIds: c.pinnedMessageIds || [],
    };
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

  m.users = m.users.map((u) => {
    const noteActive = isProfileNoteActive(u);
    return {
    ...u,
    username: typeof u.username === "string" ? u.username : "user",
    email: typeof u.email === "string" ? u.email : "",
    bio: typeof u.bio === "string" ? u.bio : "",
    note: noteActive ? u.note : "",
    noteAt: noteActive ? u.noteAt : undefined,
    avatar: typeof u.avatar === "string" && u.avatar ? u.avatar : (u.username || "U").slice(0, 2).toUpperCase(),
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
    founderVerified: u.founderVerified === true,
    founderOfficialLabel:
      typeof u.founderOfficialLabel === "string" ? u.founderOfficialLabel : undefined,
    };
  }).map((u: User) => withFounderProfileFields(u));
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
  m.theme = readDeviceTheme();
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
    avatar: user.avatar || user.username.slice(0, 2).toUpperCase(),
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
    accountIds: Array.from(new Set([...(state.accountIds || []), userId])),
  });
}

function loadState(): AppState {
  if (typeof window === "undefined") return initial;
  try {
    runChatIsolationMigration();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizePersistedAppState(initial);
    const parsed = JSON.parse(raw);
    const merged = { ...initial, ...parsed } as AppState;
    const lastActive = getLastActiveUserId();
    if (lastActive && getAccountSession(lastActive)?.token) {
      activateAccountSession(lastActive);
    }
    const scopeUid =
      lastActive && getAccountSession(lastActive)?.token
        ? lastActive
        : merged.currentUserId && !isGuestUserId(merged.currentUserId)
          ? merged.currentUserId
          : null;
    if (scopeUid) {
      const scoped = scopeAppStateToAccount(scopeUid, merged, {
        accountIds: listAccountSessions().map(s => s.userId),
        isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
      });
      return normalizePersistedAppState(scoped);
    }
    return normalizePersistedAppState(merged);
  } catch {
    return normalizePersistedAppState(initial);
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
    accountIds: listAccountSessions().map(s => s.userId),
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
): AppState {
  const resolvedId = activeUserId || primary.currentUserId || previous.currentUserId || "";
  if (!resolvedId) {
    logAuthRoute("build-state-no-user-id", { activeUserId, primaryId: primary.currentUserId });
    return normalizePersistedAppState({ ...primary, users: primary.users ?? [] });
  }
  const accountIds = listAccountSessions().map(s => s.userId);
  const ids = accountIds.length ? accountIds : [resolvedId];
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
  const accountUsers = mergeUsersForAccounts(ids, sources);
  const serverMe = primaryNorm.users.find(u => u.id === resolvedId);
  const accountSet = new Set(ids);
  const directoryById = new Map<ID, User>();
  for (const src of sources) {
    for (const u of src.users || []) {
      if (accountSet.has(u.id)) continue;
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
  const absorbChat = (raw: Chat) => {
    const scoped = scopeAppStateToAccount(resolvedId, { ...primaryNorm, chats: [raw] }).chats[0];
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
          }
        : { ...scoped, id: key },
    );
  };
  if (previous.currentUserId === resolvedId) {
    for (const c of previous.chats || []) absorbChat(c);
  }
  for (const c of primaryNorm.chats || []) {
    if (c.members.includes(resolvedId)) absorbChat(c);
  }

  const scopedNotifications = (primaryNorm.notifications || []).filter(
    n => n.userId === resolvedId,
  );

  return scopeAppStateToAccount(
    resolvedId,
    reconcileOwnedAccountProfiles(
      ensureAuthUserInState(
        normalizePersistedAppState({
          ...primaryNorm,
          currentUserId: resolvedId,
          accountIds: ids,
          users: [...usersById.values()],
          stories: mergedStories,
          chats: [...chatsById.values()],
          notifications: scopedNotifications,
        }),
        resolvedId,
        apiUser,
      ),
    ),
    {
      accountIds: ids,
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

  let next = buildMultiAccountState(user.id, remote, previous, user);
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
  logAuthRoute("login-apply-success", {
    userId: user.id,
    currentUserId: next.currentUserId,
    usersCount: next.users.length,
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
  }) => Promise<{ ok: boolean; error?: string; requiresOtp?: boolean; emailHint?: string }>;
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
  updateProfile: (patch: Partial<User>, opts?: { commitRemote?: boolean }) => void;
  toggleFollow: (userId: ID) => void;
  acceptFollowRequest: (fromId: ID) => void;
  declineFollowRequest: (fromId: ID) => void;
  joinChannel: (chatId: ID) => void;
  toggleBlock: (userId: ID) => void;
  toggleCloseFriend: (userId: ID) => void;
  createPost: (p: { type: Post["type"]; text: string; image?: string; video?: string }) => void;
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
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  addGroupMembers: (chatId: ID, memberIds: ID[]) => void;
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
  refreshFromServer: () => void;
  refreshSocialRelation: (targetUserId: ID) => void;
}

const AppCtx = createContext<Ctx | null>(null);

function applySocialRelationToState(
  state: AppState,
  meId: ID,
  peerId: ID,
  rel: SocialRelation,
): AppState {
  return {
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
        const followers = rel.isFollowing
          ? [...new Set([...u.followers.filter(x => x !== meId), meId])]
          : u.followers.filter(x => x !== meId);
        const followRequestIn = rel.pendingOut
          ? [...new Set([...(u.followRequestIn || []).filter(x => x !== meId), meId])]
          : (u.followRequestIn || []).filter(x => x !== meId);
        const followRequestOut = rel.pendingIn
          ? [...new Set([...(u.followRequestOut || []).filter(x => x !== meId), meId])]
          : (u.followRequestOut || []).filter(x => x !== meId);
        const following = rel.isFollowedBy
          ? [...new Set([...u.following.filter(x => x !== meId), meId])]
          : u.following.filter(x => x !== meId);
        return { ...u, followers, followRequestIn, followRequestOut, following };
      }
      return u;
    }),
  };
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

export function AppProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: AppState;
}) {
  const [state, setStateRaw] = useState<AppState>(() => {
    const loaded = initialState ?? loadState();
    const uid = loaded.currentUserId;
    const base =
      uid && !isGuestUserId(uid)
        ? scopeAppStateToAccount(uid, loaded, {
            accountIds: listAccountSessions().map(s => s.userId),
            isolateOwnedUsers: (ownerId, s) => isolateUsersForAccountCache(ownerId, s),
          })
        : loaded;
    return reconcileOwnedAccountProfiles(base);
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const [accountSwitching, setAccountSwitching] = useState(false);
  const [accountSessionKey, setAccountSessionKey] = useState(
    () => `sess-${state.currentUserId || "guest"}-0`,
  );

  const pushSnapshotNow = useCallback((next: AppState) => {
    if (!apiBackendEnabled()) return;
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

  const pullSocialState = useCallback(async () => {
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    const activeId = stateRef.current.currentUserId;
    if (!token || !activeId || isGuestUserId(activeId)) return;
    const remote = await pullRemoteAppState(token);
    if (!remote) return;
    setStateRaw(s =>
      preserveResolvedFollowRequestNotifications(s, buildMultiAccountState(activeId, remote, s)),
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
    }, 450);
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
          const merged = buildMultiAccountState(activeId, remote, s);
          logAuthRoute("hydrate-remote", {
            activeId,
            usersCount: merged.users.length,
          });
          if (sessionIds.length) {
            return normalizePersistedAppState({
              ...merged,
              accountIds: sessionIds,
            });
          }
          return merged;
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

  /** مزامنة الحالة الكاملة إلى الخادم (لقطة JSON) — لا أثناء حفظ المتابعة */
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    if (
      accountSwitching ||
      hydrateRemoteBusy.current ||
      socialSyncBusyRef.current ||
      groupSyncBusyRef.current ||
      messageSendBusyRef.current ||
      storyPublishBusyRef.current ||
      profileSaveBusyRef.current
    )
      return;
    const token = getApiToken();
    if (!token || !state.currentUserId || isGuestUserId(state.currentUserId)) return;
    const tid = window.setTimeout(() => {
      if (
        hydrateRemoteBusy.current ||
        socialSyncBusyRef.current ||
        groupSyncBusyRef.current ||
        messageSendBusyRef.current ||
        storyPublishBusyRef.current ||
        profileSaveBusyRef.current
      )
        return;
      void pushRemoteAppState(token, stateRef.current);
    }, 2500);
    return () => window.clearTimeout(tid);
  }, [state, accountSwitching]);

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
          return buildMultiAccountState(activeId, remote, s, apiUser);
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
    const tick = () => {
      setStateRaw((s) => {
        const cutoff = Date.now() - STORY_TTL_MS;
        const nextStories = s.stories.filter((st) => st.createdAt > cutoff);
        return nextStories.length === s.stories.length ? s : { ...s, stories: nextStories };
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
    return u ? withFounderProfileFields(u) : null;
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
      accountIds: Array.from(
        new Set([...s.accountIds.filter((id) => !isGuestUserId(id)), newUser.id]),
      ),
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
        };
      }
      const adding =
        !!(stateRef.current.currentUserId && !isGuestUserId(stateRef.current.currentUserId));
      const applied = await applyApiAuthSuccess(r.token, r.user, stateRef.current, adding);
      if (!applied.ok) return { ok: false, error: applied.error };
      setStateRaw(applied.state);
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
      accountIds: Array.from(new Set([...s.accountIds.filter((id) => !isGuestUserId(id)), u.id])),
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

    const leavingId = stateRef.current.currentUserId;
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

    try {
      if (apiBackendEnabled() && getAccountSession(userId)) {
        activateAccountSession(userId);
        socialSyncBusyRef.current = false;
        if (remoteSyncTimerRef.current) {
          window.clearTimeout(remoteSyncTimerRef.current);
          remoteSyncTimerRef.current = null;
        }
        const cached = loadAccountStateCache(userId);
        if (cached) {
          const instant = refreshOwnedUsersInState(
            buildMultiAccountState(userId, cached, {
              ...prev,
              currentUserId: userId,
              chats: [],
            }),
          );
          setStateRaw(instant);
        } else {
          setStateRaw(s => scopeAppStateToAccount(userId, { ...s, currentUserId: userId }));
        }
        const token = getApiToken();
        if (!token) return;
        const remote = await pullRemoteAppState(token);
        if (!remote) return;
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
        setStateRaw(s => {
          const next = refreshOwnedUsersInState(
            buildMultiAccountState(userId, remote, s),
          );
          saveAccountStateCache(userId, next);
          return next;
        });
        return;
      }

      setState((s) => {
        let users = s.users;
        if (s.currentUserId && isGuestUserId(s.currentUserId) && !isGuestUserId(userId)) {
          users = users.filter((u) => !isGuestUserId(u.id));
        }
        return scopeAppStateToAccount(userId, { ...s, currentUserId: userId, users });
      });
    } finally {
      setAccountSessionKey(`sess-${userId}-${Date.now()}`);
      setAccountSwitching(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("retweet-account-switch-end", { detail: { userId } }),
        );
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
      const nextIds = s.accountIds.filter((id) => id !== userId);
      const switchTo = s.currentUserId === userId ? nextIds[0] ?? null : s.currentUserId;
      return {
        ...s,
        accountIds: nextIds,
        currentUserId: switchTo,
        users: isGuestUserId(userId) ? s.users.filter((u) => u.id !== userId) : s.users,
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
      const patched: AppState = {
        ...s,
        users: s.users.map(u =>
          u.id === s.currentUserId
            ? withFounderProfileFields(mergeUserProfilePatch(u, { ...safePatch, id: u.id }))
            : u,
        ),
      };
      const next = scopeAppStateToAccount(s.currentUserId!, patched, {
        accountIds: listAccountSessions().map(x => x.userId),
        isolateOwnedUsers: (ownerId, st) => isolateUsersForAccountCache(ownerId, st),
      });
      nextForRemote = reconcileOwnedAccountProfiles(next);
      return nextForRemote;
    });
    if (!nextForRemote || !apiBackendEnabled()) return;
    const token = getApiToken();
    if (!token) return;
    const meId = nextForRemote.currentUserId;
    const meRow = nextForRemote.users.find(u => u.id === meId);
    if (meId && meRow) {
      saveAccountStateCache(meId, nextForRemote);
      const sess = getAccountSession(meId);
      if (sess) {
        upsertAccountSession({
          ...sess,
          username: meRow.username,
          avatar: meRow.avatar,
        });
      }
    }
    if (opts?.commitRemote) {
      profileSaveBusyRef.current = true;
      void pushRemoteAppState(token, nextForRemote).finally(() => {
        profileSaveBusyRef.current = false;
      });
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

  const toggleBlock = (userId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId) || s.currentUserId === userId)
        return s;
      const meId = s.currentUserId;
      const meRow = s.users.find((u) => u.id === meId);
      const blocking = !!(meRow && !meRow.blocked.includes(userId));
      return {
        ...s,
        users: s.users.map((u) => {
          if (u.id === meId) {
            const b = blocking ? [...u.blocked, userId] : u.blocked.filter((x) => x !== userId);
            const following = blocking ? u.following.filter((x) => x !== userId) : u.following;
            const followRequestOut = blocking
              ? (u.followRequestOut || []).filter((x) => x !== userId)
              : u.followRequestOut || [];
            const followRequestIn = blocking
              ? (u.followRequestIn || []).filter((x) => x !== userId)
              : u.followRequestIn || [];
            return { ...u, blocked: b, following, followRequestOut, followRequestIn };
          }
          if (u.id === userId) {
            const followers = blocking ? u.followers.filter((x) => x !== meId) : u.followers;
            const followRequestIn = blocking
              ? (u.followRequestIn || []).filter((x) => x !== meId)
              : u.followRequestIn || [];
            const followRequestOut = blocking
              ? (u.followRequestOut || []).filter((x) => x !== meId)
              : u.followRequestOut || [];
            return { ...u, followers, followRequestIn, followRequestOut };
          }
          return u;
        }),
      };
    });

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

  const createPost: Ctx["createPost"] = (p) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const post: Post = {
        id: uid(),
        userId: s.currentUserId,
        likes: [],
        reposts: [],
        comments: [],
        createdAt: Date.now(),
        ...p,
      };
      // mention notifications
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
      queueMicrotask(() => pushSnapshotNow(next));
      return next;
    });

  const toggleLike = (postId: ID) =>
    setState((s) => {
      const post = s.posts.find((p) => p.id === postId);
      if (!post || !s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const liked = post.likes.includes(s.currentUserId);
      const next = {
        ...s,
        posts: s.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                likes: liked
                  ? p.likes.filter((x) => x !== s.currentUserId)
                  : [...p.likes, s.currentUserId!],
              }
            : p,
        ),
      };
      return liked
        ? next
        : pushNotif(next, {
            userId: post.userId,
            fromId: s.currentUserId,
            type: "like",
            postId,
            text: "وضع ❤️ على منشورك",
          });
    });
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
  const recordStoryView: Ctx["recordStoryView"] = (storyId) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      const st = s.stories.find((x) => x.id === storyId);
      if (!st || st.userId === meId) return s;
      const v = st.viewedByUserIds || [];
      if (v.includes(meId)) return s;
      const next = {
        ...s,
        stories: s.stories.map((x) =>
          x.id === storyId ? { ...x, viewedByUserIds: [...v, meId] } : x,
        ),
      };
      const token = getApiToken();
      if (token && apiBackendEnabled()) {
        void pushRemoteAppState(token, next);
      }
      return next;
    });
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
  const toggleRepost = (postId: ID) =>
    setState((s) => {
      const post = s.posts.find((p) => p.id === postId);
      if (!post || !s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const r = post.reposts.includes(s.currentUserId);
      const next = {
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
      const out = r ? next : pushNotif(next, { userId: post.userId, fromId: s.currentUserId, type: "repost", postId });
      const token = getApiToken();
      if (token && apiBackendEnabled()) {
        socialSyncBusyRef.current = true;
        void pushRemoteAppState(token, out).finally(() => {
          socialSyncBusyRef.current = false;
        });
      }
      return out;
    });
  const addComment = (postId: ID, text: string) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId) || !text.trim()) return s;
      const post = s.posts.find((p) => p.id === postId);
      if (!post) return s;
      const c: Comment = { id: uid(), userId: s.currentUserId, text, createdAt: Date.now() };
      const next = {
        ...s,
        posts: s.posts.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, c] } : p)),
      };
      return pushNotif(next, {
        userId: post.userId,
        fromId: s.currentUserId,
        type: "comment",
        postId,
        text: `علّق على منشورك: ${text.trim().slice(0, 120)}${text.trim().length > 120 ? "…" : ""}`,
      });
    });
  const deleteComment = (postId: ID, commentId: ID) =>
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
          socialSyncBusyRef.current = false;
        });
      }
      return next;
    });

  const deletePost = (postId: ID) =>
    setState((s) => {
      if (isGuestUserId(s.currentUserId)) return s;
      const post = s.posts.find((p) => p.id === postId);
      if (!post || post.userId !== s.currentUserId) return s;
      const next = { ...s, posts: s.posts.filter((p) => p.id !== postId) };
      const token = getApiToken();
      if (token && apiBackendEnabled()) {
        socialSyncBusyRef.current = true;
        void pushRemoteAppState(token, next).finally(() => {
          socialSyncBusyRef.current = false;
        });
      }
      return next;
    });

  const deleteStory: Ctx["deleteStory"] = useCallback(
    (storyId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const st = s.stories.find((x) => x.id === storyId);
        if (!st || st.userId !== s.currentUserId) return s;
        const next = { ...s, stories: s.stories.filter((x) => x.id !== storyId) };
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
    async (image, audience = "all", stickers, video) => {
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
          }
        : {
            id: uid(),
            userId,
            image,
            createdAt: Date.now(),
            audience,
            likes: [],
            viewedByUserIds: [],
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

  const addGroupMembers: Ctx["addGroupMembers"] = (chatId, memberIds) => {
    if (!memberIds.length || !state.currentUserId || isGuestUserId(state.currentUserId)) return;
    const prevMembers = stateRef.current.chats.find(c => c.id === chatId)?.members;
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) => {
        if (c.id !== chatId || (!c.isGroup && !c.isChannel)) return c;
        return {
          ...c,
          members: Array.from(new Set([...c.members, ...memberIds])),
        };
      }),
    }));
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
                c.id === chatId ? { ...c, ...res.chat!, members: res.chat!.members } : c,
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
      const myStories = s.stories.filter((st) => st.userId === s.currentUserId);
      const byId = new Map(myStories.map((st) => [st.id, st]));
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
      const isFollowing = snap.users.find((u) => u.id === selfId)?.following.includes(otherUserId) ?? false;
      const newChat: Chat = {
        id: dmChatId(selfId, otherUserId),
        isGroup: false,
        members: [selfId, otherUserId],
        admins: [],
        messages: [],
        request: !isFollowing && !!other?.isPrivate,
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
      messages: [],
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
      joinRequests: [],
      isPublicGroup: false,
    };
    setState((s) => ({ ...s, chats: [...s.chats, newChat] }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      void (async () => {
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
        }
        scheduleRemoteSync();
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
        reactions: m.reactions,
        forwardedFrom: m.forwardedFrom,
      };
      void (async () => {
        let viaSocket = false;
        if (isRealtimeSocketConnected()) {
          viaSocket = await emitDirectMessage(body, senderId);
        }
        if (!viaSocket) {
          const restToken = ensureApiTokenMatchesUser(senderId);
          if (restToken && stateRef.current.currentUserId === senderId) {
            await apiPostMessage(restToken, storageChatId, receiverId, m);
          }
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
    const fetchId = peer ? dmChatId(uid, peer) : chatId;
    const remote = await apiFetchChatMessages(token, fetchId);
    if (remote.length === 0) return;
    const stateKey = peer ? dmChatId(uid, peer) : chatId;
    setState(s => {
      if (s.currentUserId !== uid) return s;
      const chat = s.chats.find(
        c => c.id === chatId || c.id === stateKey || chatMergeKey(c, uid) === stateKey,
      );
      if (!chat?.members.includes(uid)) return s;
      const merged = {
        ...chat,
        id: stateKey,
        messages: mergeChatMessages(chat.messages, remote),
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

      const snap = stateRef.current;
      const preflight =
        resolveChatForSend(snap, chatId, senderId) ?? findChatByOpenId(snap.chats, chatId, senderId);
      if (!preflight) return false;
      if (preflight.isChannel && !(preflight.hosts || []).includes(senderId)) return false;

      const m: Message = { id: uid(), senderId, createdAt: Date.now(), ...msg };
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

        const updatedChat: Chat = { ...chat, messages: [...chat.messages, m] };
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
            }
          : c,
      ),
    }));
    const token = getApiToken();
    if (token && apiBackendEnabled()) {
      void apiKickGroupMember(token, chatId, userId).then(() => scheduleRemoteSync());
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
            chats: s.chats.map(c => (c.id === chatId ? { ...c, ...res.chat! } : c)),
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
          ? {
              ...existing,
              ...res.chat!,
              members: Array.from(new Set([...res.chat!.members, meId])),
            }
          : { ...res.chat!, members: Array.from(new Set([...res.chat!.members, meId])) };
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
        const members =
          action === "accept" ? Array.from(new Set([...c.members, userId])) : c.members;
        return { ...c, joinRequests: requests, members };
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
              chats: s.chats.map(c => (c.id === chatId ? { ...c, ...r.chat! } : c)),
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
        return {
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
          if (!c.messages.some((m) => m.id === messageId)) return c;
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
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const meId = s.currentUserId;
        return {
          ...s,
          chats: s.chats.map((c) =>
            c.id !== chatId
              ? c
              : {
                  ...c,
                  lastOpenAtByUser: { ...(c.lastOpenAtByUser || {}), [meId]: Date.now() },
                },
          ),
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
        const last = chat.messages[chat.messages.length - 1];
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
  const recordProfileVisit: Ctx["recordProfileVisit"] = (targetUserId) =>
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
        accountIds: Array.from(
          new Set([...s.accountIds.filter((id) => !isGuestUserId(id)), GUEST_LOCAL_USER_ID]),
        ),
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
      for (const u of incoming) {
        if (isGuestUserId(u.id)) continue;
        const prev = byId.get(u.id);
        const next = mergeDirectoryUser(prev, {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar,
          bio: u.bio,
          verified: u.verified,
          founderVerified: u.founderVerified,
          founderOfficialLabel: u.founderOfficialLabel,
        });
        if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
          byId.set(u.id, next);
          changed = true;
        }
      }
      if (!changed) return s;
      return { ...s, users: [...byId.values()] };
    });
  }, [setState]);

  const refreshUserDirectory = useCallback(async () => {
    if (!apiBackendEnabled() || !getApiToken()) return;
    if (isGuestUserId(stateRef.current.currentUserId)) return;
    if (
      hydrateRemoteBusy.current ||
      groupSyncBusyRef.current ||
      socialSyncBusyRef.current ||
      profileSaveBusyRef.current
    )
      return;
    const rows = await apiFetchUserDirectory();
    if (!rows.length) return;
    mergeDiscoveredUsers(rows);
  }, [mergeDiscoveredUsers]);

  const remoteSyncTimerRef = useRef<number | null>(null);
  const refreshFromServer = useCallback(() => {
    if (storyPublishBusyRef.current || socialSyncBusyRef.current) return;
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(stateRef.current.currentUserId)) return;
    void (async () => {
      const token = getApiToken();
      const activeId = stateRef.current.currentUserId;
      if (!token || !activeId || isGuestUserId(activeId)) return;
      const remote = await pullRemoteAppState(token);
      if (!remote) return;
      setStateRaw(s =>
        preserveResolvedFollowRequestNotifications(s, buildMultiAccountState(activeId, remote, s)),
      );
    })();
  }, [setStateRaw]);

  const refreshSocialRelation = useCallback(
    (targetUserId: ID) => {
      void (async () => {
        await ensureApiRuntimeConfig();
        const token = getApiToken();
        const meId = stateRef.current.currentUserId;
        if (!token || !meId || isGuestUserId(meId) || !apiBackendEnabled()) return;
        const r = await apiGetSocialRelation(token, targetUserId);
        if (r.ok) {
          setStateRaw(s => applySocialRelationToState(s, meId, targetUserId, r.relation));
        }
      })();
    },
    [setStateRaw],
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
      void (async () => {
        if (
          hydrateRemoteBusy.current ||
          groupSyncBusyRef.current ||
          messageSendBusyRef.current ||
          socialSyncBusyRef.current ||
          storyPublishBusyRef.current ||
          profileSaveBusyRef.current
        )
          return;
        const token = getApiToken();
        const activeId = stateRef.current.currentUserId;
        if (!token || !activeId || isGuestUserId(activeId)) return;
        const remote = await pullRemoteAppState(token);
        if (!remote) return;
        setStateRaw(s =>
          preserveResolvedFollowRequestNotifications(s, buildMultiAccountState(activeId, remote, s)),
        );
      })();
    }, 500);
  }, [setStateRaw]);

  /** تحديث فوري عبر SSE (رسائل، لايكات، حسابات جديدة) */
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    if (!getApiToken()) return;
    if (isGuestUserId(state.currentUserId)) return;
    return subscribeRealtimeEvents((event, data) => {
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
          let merged: Chat = existing
            ? {
                ...existing,
                ...payload.chat!,
                members: members.includes(meId) ? members : [...members, meId],
                messages: mergeChatMessages(existing.messages, payload.chat!.messages || []),
              }
            : {
                ...payload.chat!,
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
        if (!socialSyncBusyRef.current) scheduleRemoteSync();
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
          if (!messageBelongsToChatForOwner(incoming, chat, meId)) return s;
          const existing = chat.messages.find(m => m.id === incoming.id);
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
          const scopedChat = scopeAppStateToAccount(meId, {
            ...s,
            chats: [
              {
                ...chat,
                messages: mergeChatMessages(chat.messages, [incoming]),
              },
            ],
          }).chats[0];
          if (!scopedChat) return s;
          const updated: Chat = {
            ...scopedChat,
            request: payload.request === true ? true : chat.request,
          };
          const mergeKey = chatMergeKey(updated, meId);
          const deduped = s.chats.filter(
            c =>
              c.id !== chat!.id &&
              c.id !== updated.id &&
              chatMergeKey(c, meId) !== mergeKey,
          );
          return { ...s, chats: [...deduped, { ...updated, id: mergeKey }] };
        });
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
      if (event === "sync_hint") {
        if (!socialSyncBusyRef.current) scheduleRemoteSync();
        return;
      }
      if (event === "user_profile_updated") {
        const payload = data as { user?: Parameters<typeof userFromSearchResult>[0]; userId?: string; avatar?: string };
        if (payload?.user?.id) {
          const row = payload.user;
          const meId = stateRef.current.currentUserId;
          if (meId && row.id === meId) {
            setState(s => ({
              ...s,
              users: s.users.map(u =>
                u.id === meId
                  ? withFounderProfileFields(
                      mergeUserProfilePatch(u, {
                        id: meId,
                        username: row.username,
                        displayName: row.displayName,
                        avatar: row.avatar,
                        bio: row.bio,
                        verified: row.verified,
                        founderVerified: row.founderVerified,
                        founderOfficialLabel: row.founderOfficialLabel,
                      }),
                    )
                  : u,
              ),
            }));
            if (!profileSaveBusyRef.current) scheduleRemoteSync();
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
  }, [state.currentUserId, mergeDiscoveredUsers, scheduleRemoteSync, setState]);

  useEffect(() => {
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(state.currentUserId)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleRemoteSync();
    }, 90_000);
    return () => window.clearInterval(id);
  }, [state.currentUserId, scheduleRemoteSync]);

  useEffect(() => {
    if (!apiBackendEnabled() || !getApiToken() || isGuestUserId(state.currentUserId)) return;
    void refreshUserDirectory();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshUserDirectory();
    }, 120_000);
    return () => window.clearInterval(id);
  }, [state.currentUserId, refreshUserDirectory]);

  const value: Ctx = {
    state,
    setState,
    currentUser,
    isGuest,
    enterGuestBrowseMode,
    exitGuestBrowseMode,
    mergeDiscoveredUsers,
    refreshUserDirectory,
    refreshFromServer,
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
    accountSwitching,
    accountSessionKey,
    removeAccount,
    updateProfile,
    toggleFollow,
    acceptFollowRequest,
    declineFollowRequest,
    joinChannel,
    toggleBlock,
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
    setGroupPublic,
    joinGroupByInviteCode,
    respondGroupJoinRequest,
    addGroupMembers,
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

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("يجب استخدام التطبيق داخل مزوّد الحالة (AppProvider)");
  return ctx;
}

export function userById(state: AppState, id: ID) {
  const u = resolveUserProfile(state, id);
  return u ? withFounderProfileFields(u) : undefined;
}

/** رسائل المحادثة الظاهرة للمستخدم (بعد استبعاد «حذف عندك فقط») */
export function visibleChatMessages(chat: Chat, viewerId: ID): Message[] {
  const base = chat.messages.filter(m => messageBelongsToChatForOwner(m, chat, viewerId));
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

/** منشورات وريبوستات وإعجابات الحساب الخاص: للمتابعين أو صاحب الحساب فقط */
export function canViewPrivatePosts(state: AppState, viewerId: ID | null, targetId: ID): boolean {
  const target = userById(state, targetId);
  if (!target) return false;
  if (!viewerId) return !target.isPrivate;
  if (viewerId === targetId) return true;
  if (!target.isPrivate) return true;
  return !!target.followers.includes(viewerId);
}

export function isStoryActive(story: StoryItem, now = Date.now()): boolean {
  return story.createdAt > now - STORY_TTL_MS;
}

/** ستوريات حساب معيّن كما يراها المشاهد (نشطة خلال ٢٤ ساعة) */
export function storiesForUser(state: AppState, authorId: ID, viewerId: ID): StoryItem[] {
  const author = userById(state, authorId);
  const me = userById(state, viewerId);
  if (!author || !me) return [];
  return state.stories
    .filter((s) => s.userId === authorId && isStoryActive(s))
    .filter(
      (s) =>
        s.audience === "all" || s.userId === viewerId || author.closeFriends.includes(viewerId),
    )
    .filter((s) => {
      if (s.userId === viewerId) return true;
      if (author.blocked.includes(viewerId) || me.blocked.includes(s.userId)) return false;
      if (author.isPrivate && !author.followers.includes(viewerId)) return false;
      return true;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function userHasVisibleStories(state: AppState, viewerId: ID, authorId: ID): boolean {
  return storiesForUser(state, authorId, viewerId).length > 0;
}

/** ترتيب حسابات الستوري في الشريط (أحدث ستوري أولاً) */
export function visibleStoryUserIds(state: AppState, viewerId: ID): ID[] {
  const me = userById(state, viewerId);
  if (!me) return [];
  const latest = new Map<ID, number>();
  for (const s of state.stories) {
    if (!isStoryActive(s)) continue;
    const author = userById(state, s.userId);
    if (!author) continue;
    if (s.userId !== viewerId) {
      if (author.blocked.includes(viewerId) || me.blocked.includes(s.userId)) continue;
      if (author.isPrivate && !author.followers.includes(viewerId)) continue;
    }
    const ok =
      s.audience === "all" || s.userId === viewerId || author.closeFriends.includes(viewerId);
    if (!ok) continue;
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
