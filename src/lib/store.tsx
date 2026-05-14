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
import { cloudEnabled, getSupabaseClient, loadCloudState, saveCloudState } from "./cloud";
import { supabaseSignIn, supabaseSignOut, supabaseSignUp } from "./supabaseAuth";
import {
  apiBackendEnabled,
  apiLogin,
  apiRegister,
  apiChangePassword,
  apiCompletePasswordReset,
  getApiToken,
  pullRemoteAppState,
  pushRemoteAppState,
  apiRequestPasswordReset,
  setApiToken,
} from "./apiBackend";
import { isUsernameTaken, validateUsernameFormat } from "./usernameRules";
import {
  hashPassword,
  verifyStoredPassword,
  normalizeEmail,
  validateEmailFormat,
  validateNewPasswordPlain,
} from "./passwordAuth";
import {
  GUEST_LOCAL_USER_ID,
  isGuestUserId,
  mkGuestUser,
  stripGuestFromPersistedState,
} from "./guestUser";

const STORAGE_KEY = "retweet_state_v2";
const uid = () => Math.random().toString(36).slice(2, 10);
export const QURAN_CHANNEL_ID = "channel_quran_official";

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
  if (n.userId === n.fromId) return s;
  if (n.type === "message" && n.chatId) {
    const recipient = s.users.find((u) => u.id === n.userId);
    if (recipient?.mutedChatIds?.includes(n.chatId)) return s;
  }
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
    bio: "iOS Developer",
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
    bio: "بوت طارق - تذكير بالأدعية والآيات",
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

const BOT_MESSAGES = [
  "اللهم أصلح لي ديني الذي هو عصمة أمري، وأصلح لي دنياي التي فيها معاشي.",
  "﴿رَّبِّ زِدْنِي عِلْمًا﴾",
  "اللهم اجعل هذا اليوم سكينة في القلب وبركة في الوقت.",
  "﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾",
  "اللهم ارزقنا الثبات وحسن الظن بك.",
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
      name: "قناة القرآن",
      avatar: "RT",
      members: [BOT_USER_ID],
      admins: [BOT_USER_ID],
      hosts: [BOT_USER_ID],
      messages: [
        {
          id: uid(),
          senderId: BOT_USER_ID,
          type: "text",
          content: "🤍 أهلاً بك، أنا بوت طارق. كل ساعة أرسل لك دعاء أو آية قصيرة للتذكير.",
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
    if (cc.isChannel && !cc.createdByUserId && cc.admins?.length && cc.id !== QURAN_CHANNEL_ID) {
      cc = { ...cc, createdByUserId: cc.admins[0] };
    }
    return cc;
  });
  const channelIdsByCreator = new Map<ID, ID[]>();
  for (const c of m.chats) {
    if (c.isChannel && c.createdByUserId && c.id !== QURAN_CHANNEL_ID) {
      const list = channelIdsByCreator.get(c.createdByUserId) || [];
      list.push(c.id);
      channelIdsByCreator.set(c.createdByUserId, list);
    }
  }
  m.users = m.users.map((u) => ({
    ...u,
    favorites: u.favorites || [],
    favoriteStickerContents: u.favoriteStickerContents || [],
    createdStickerContents: u.createdStickerContents || [],
    profileViews: u.profileViews || [],
    shareProfileVisitActivity: u.shareProfileVisitActivity !== false,
    showLikesAndFavoritesOnProfile: u.showLikesAndFavoritesOnProfile !== false,
    hideFollowListsFromOthers: u.hideFollowListsFromOthers === true,
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
    allowStoryReplies: u.allowStoryReplies !== false,
    verified: u.verified === true,
  }));
  m.stories = (m.stories || []).map((st: StoryItem) => ({
    ...st,
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
  }));
  return m;
}

function loadState(): AppState {
  if (typeof window === "undefined") return initial;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizePersistedAppState(initial);
    const parsed = JSON.parse(raw);
    const merged = { ...initial, ...parsed } as AppState;
    return normalizePersistedAppState(merged);
  } catch {
    return normalizePersistedAppState(initial);
  }
}

interface Ctx {
  state: AppState;
  setState: (updater: (s: AppState) => AppState) => void;
  currentUser: User | null;
  signup: (data: {
    email: string;
    username: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; userId?: string }>;
  login: (data: { username: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  resetPasswordForUser: (
    userId: ID,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  requestPasswordResetRemote: (
    identifier: string,
  ) => Promise<{ ok: boolean; error?: string; devCode?: string }>;
  completePasswordResetRemote: (
    identifier: string,
    code: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  changeOwnPassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  switchAccount: (userId: ID) => void;
  removeAccount: (userId: ID) => void;
  updateProfile: (patch: Partial<User>) => void;
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
  deletePost: (postId: ID) => void;
  addStory: (image: string, audience?: "all" | "close", stickers?: StorySticker[]) => void;
  voteStoryPoll: (storyId: ID, stickerId: ID, side: "left" | "right") => void;
  answerStoryQuiz: (storyId: ID, stickerId: ID, optionIndex: number) => void;
  rateStorySlider: (storyId: ID, stickerId: ID, value: number) => void;
  addHighlight: (p: { title: string; cover: string; coverImage?: string; storyIds: ID[] }) => void;
  openOrCreateChat: (otherUserId: ID) => Chat | null;
  createGroup: (name: string, avatar: string, memberIds: ID[]) => Chat | null;
  createChannel: (name: string, avatar: string, memberIds: ID[]) => Chat | null;
  toggleHost: (chatId: ID, userId: ID) => void;
  leaveChat: (chatId: ID) => void;
  sendMessage: (chatId: ID, msg: Omit<Message, "id" | "senderId" | "createdAt">) => void;
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
  toggleGroupAdmin: (chatId: ID, userId: ID) => void;
  kickMember: (chatId: ID, userId: ID) => void;
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
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AppState>(() => loadState());
  const [cloudLoadedByUser, setCloudLoadedByUser] = useState<Record<string, boolean>>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripGuestFromPersistedState(state)));
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        console.warn(
          "[Retweet] مساحة التخزين المحلي ممتلئة. صورة GIF كبيرة قد لا تُحفظ بعد التحديث — جرّب ملفاً أصغر أو صيغة أخف.",
        );
      }
    }
  }, [state]);

  /** عند وجود توكن خادم: جرّب جلب الحالة المحفوظة على الخادم بعد التحميل المحلي */
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await pullRemoteAppState(token);
        if (cancelled || !remote) return;
        setStateRaw((s) =>
          normalizePersistedAppState({
            ...s,
            ...remote,
            currentUserId: remote.currentUserId ?? s.currentUserId,
          }),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** مزامنة الحالة الكاملة إلى الخادم (لقطة JSON) */
  useEffect(() => {
    if (!apiBackendEnabled()) return;
    const token = getApiToken();
    if (!token || !state.currentUserId || isGuestUserId(state.currentUserId)) return;
    const tid = window.setTimeout(() => {
      void pushRemoteAppState(token, state);
    }, 1000);
    return () => window.clearTimeout(tid);
  }, [state]);

  useEffect(() => {
    if (
      !cloudEnabled ||
      apiBackendEnabled() ||
      !state.currentUserId ||
      isGuestUserId(state.currentUserId) ||
      cloudLoadedByUser[state.currentUserId]
    )
      return;
    let cancelled = false;
    loadCloudState(state.currentUserId)
      .then((remoteState) => {
        if (cancelled) return;
        if (remoteState) {
          setStateRaw((s) =>
            normalizePersistedAppState({
              ...s,
              ...remoteState,
              currentUserId: s.currentUserId,
            }),
          );
        }
        setCloudLoadedByUser((s) => ({ ...s, [state.currentUserId!]: true }));
      })
      .catch(() => {
        if (!cancelled) setCloudLoadedByUser((s) => ({ ...s, [state.currentUserId!]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [state.currentUserId, cloudLoadedByUser]);

  useEffect(() => {
    if (
      !cloudEnabled ||
      apiBackendEnabled() ||
      !state.currentUserId ||
      isGuestUserId(state.currentUserId) ||
      !cloudLoadedByUser[state.currentUserId]
    )
      return;
    const timer = window.setTimeout(() => {
      void saveCloudState(state.currentUserId!, state);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [state, cloudLoadedByUser]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    root.setAttribute("dir", state.language === "en" ? "ltr" : "rtl");
    root.setAttribute("lang", state.language);
  }, [state.theme, state.language]);

  const STORY_TTL_MS = 24 * 60 * 60 * 1000;
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

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? null,
    [state.users, state.currentUserId],
  );

  const isGuest = useMemo(
    () => !!(state.currentUserId && isGuestUserId(state.currentUserId)),
    [state.currentUserId],
  );

  const signup: Ctx["signup"] = async (data) => {
    const pwdErrFirst = validateNewPasswordPlain(data.password);
    if (pwdErrFirst) return { ok: false, error: pwdErrFirst };

    if (cloudEnabled && !apiBackendEnabled()) {
      const nameErr = validateUsernameFormat(data.username.trim());
      if (nameErr) return { ok: false, error: nameErr };
      const emailErr = validateEmailFormat(data.email);
      if (emailErr) return { ok: false, error: emailErr };
      const pwdErr = validateNewPasswordPlain(data.password);
      if (pwdErr) return { ok: false, error: pwdErr };
      const uSb = data.username.trim();
      const emailNormSb = normalizeEmail(data.email);
      if (isUsernameTaken(uSb, state.users)) return { ok: false, error: "اليوزر موجود" };
      if (state.users.some((x) => x.email.toLowerCase() === emailNormSb))
        return { ok: false, error: "إيميل مسجل" };
      const regSb = await supabaseSignUp(emailNormSb, uSb, data.password);
      if (!regSb.ok) return { ok: false, error: regSb.error };
      setApiToken(null);
      let hashedSb: string;
      try {
        hashedSb = await hashPassword(data.password);
      } catch {
        return { ok: false, error: "تعذر تأمين كلمة المرور في هذا الجهاز" };
      }
      const newUserSb: User = mkUser({
        id: regSb.userId,
        username: uSb,
        email: emailNormSb,
        password: hashedSb,
        avatar: uSb.slice(0, 2).toUpperCase(),
      });
      setState((s) => ({
        ...s,
        users: [...s.users.filter((x) => !isGuestUserId(x.id)), newUserSb],
        currentUserId: newUserSb.id,
        accountIds: Array.from(
          new Set([...s.accountIds.filter((id) => !isGuestUserId(id)), newUserSb.id]),
        ),
      }));
      return { ok: true, userId: regSb.userId };
    }

    if (apiBackendEnabled()) {
      const nameErr = validateUsernameFormat(data.username.trim());
      if (nameErr) return { ok: false, error: nameErr };
      const emailErr = validateEmailFormat(data.email);
      if (emailErr) return { ok: false, error: emailErr };
      const pwdErr = validateNewPasswordPlain(data.password);
      if (pwdErr) return { ok: false, error: pwdErr };
      const reg = await apiRegister(
        normalizeEmail(data.email),
        data.username.trim(),
        data.password,
      );
      if (!reg.ok) return { ok: false, error: reg.error };
      setApiToken(reg.token);
      const remote = await pullRemoteAppState(reg.token);
      if (!remote) {
        setApiToken(null);
        return { ok: false, error: "تعذر تحميل الحساب من الخادم" };
      }
      setStateRaw(normalizePersistedAppState(remote));
      return { ok: true, userId: reg.userId };
    }

    const u = data.username.trim();
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
      const r = await apiLogin(username, password);
      if (!r.ok) return { ok: false, error: r.error };
      setApiToken(r.token);
      const remote = await pullRemoteAppState(r.token);
      if (!remote) {
        setApiToken(null);
        return { ok: false, error: "تعذر تحميل الحساب من الخادم" };
      }
      setStateRaw(normalizePersistedAppState(remote));
      return { ok: true };
    }

    if (cloudEnabled && !apiBackendEnabled()) {
      const sup = await supabaseSignIn(q, password);
      if (!sup.ok) return { ok: false, error: sup.error };
      setApiToken(null);
      const remoteSb = await loadCloudState(sup.userId);
      if (remoteSb) {
        setStateRaw(
          normalizePersistedAppState({
            ...remoteSb,
            currentUserId: sup.userId,
          }),
        );
        return { ok: true };
      }
      const existingSb = state.users.find((x) => x.id === sup.userId);
      if (existingSb) {
        setState((s) => ({
          ...s,
          users: s.users.filter((x) => !isGuestUserId(x.id)),
          currentUserId: existingSb.id,
          accountIds: Array.from(
            new Set([...s.accountIds.filter((id) => !isGuestUserId(id)), existingSb.id]),
          ),
        }));
        return { ok: true };
      }
      const sb = getSupabaseClient();
      const { data: sessionData } = sb ? await sb.auth.getSession() : { data: { session: null } };
      const sessionUser = sessionData.session?.user;
      const emailSb = sessionUser?.email ?? "";
      const meta = sessionUser?.user_metadata as { username?: string } | undefined;
      let uName = (meta?.username ?? "").trim();
      if (!uName || validateUsernameFormat(uName) !== null) {
        const raw = (emailSb.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "");
        uName =
          raw.length >= 3
            ? raw.slice(0, 30)
            : `user_${sup.userId.replace(/-/g, "").slice(0, 10)}`;
      }
      if (validateUsernameFormat(uName) !== null) {
        uName = `user_${sup.userId.replace(/-/g, "").slice(0, 10)}`;
      }
      let candSb = uName;
      let nSb = 0;
      while (isUsernameTaken(candSb, state.users)) {
        nSb += 1;
        candSb = `${uName}_${nSb}`;
      }
      const emailNormLogin = normalizeEmail(
        emailSb || `${candSb}@users.supabase.local`,
      );
      const newFromAuth: User = mkUser({
        id: sup.userId,
        username: candSb,
        email: emailNormLogin,
        password: "",
        avatar: candSb.slice(0, 2).toUpperCase(),
      });
      setState((s) => ({
        ...s,
        users: [...s.users.filter((x) => !isGuestUserId(x.id)), newFromAuth],
        currentUserId: newFromAuth.id,
        accountIds: Array.from(
          new Set([...s.accountIds.filter((id) => !isGuestUserId(id)), newFromAuth.id]),
        ),
      }));
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
    return { ok: true, devCode: r.devCode };
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

  const logout = () => {
    if (cloudEnabled) void supabaseSignOut();
    setApiToken(null);
    setState((s) => {
      const leaving = s.currentUserId;
      const dropGuest = leaving && isGuestUserId(leaving);
      return {
        ...s,
        currentUserId: null,
        accountIds: s.accountIds.filter((id) => id !== leaving),
        users: dropGuest ? s.users.filter((u) => !isGuestUserId(u.id)) : s.users,
      };
    });
  };
  const switchAccount = (userId: ID) =>
    setState((s) => {
      let users = s.users;
      if (s.currentUserId && isGuestUserId(s.currentUserId) && !isGuestUserId(userId)) {
        users = users.filter((u) => !isGuestUserId(u.id));
      }
      return { ...s, currentUserId: userId, users };
    });
  const removeAccount = (userId: ID) =>
    setState((s) => ({
      ...s,
      accountIds: s.accountIds.filter((id) => id !== userId),
      currentUserId: s.currentUserId === userId ? null : s.currentUserId,
      users: isGuestUserId(userId) ? s.users.filter((u) => u.id !== userId) : s.users,
    }));

  const updateProfile: Ctx["updateProfile"] = (patch) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const { password: _ignoredPassword, ...safePatch } = patch as Partial<User> & {
        password?: unknown;
      };
      if (_ignoredPassword !== undefined && import.meta.env.DEV) {
        console.warn("[Retweet] تجاهل password في updateProfile — استخدم changeOwnPassword");
      }
      if (safePatch.username != null) {
        const nameErr = validateUsernameFormat(String(safePatch.username), s.currentUserId);
        if (nameErr) {
          try {
            alert(nameErr);
          } catch {
            /* ignore */
          }
          return s;
        }
        if (isUsernameTaken(String(safePatch.username), s.users, s.currentUserId)) {
          try {
            alert("اسم المستخدم مستخدم من قبل");
          } catch {
            /* ignore */
          }
          return s;
        }
      }
      return {
        ...s,
        users: s.users.map((u) => (u.id === s.currentUserId ? { ...u, ...safePatch } : u)),
      };
    });

  const toggleFollow = (userId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId) || s.currentUserId === userId)
        return s;
      const meId = s.currentUserId;
      const me = s.users.find((u) => u.id === meId)!;
      const target = s.users.find((u) => u.id === userId);
      if (!target) return s;
      const wasFollowing = me.following.includes(userId);
      if (wasFollowing) {
        return {
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
      }
      const pendingOut = (me.followRequestOut || []).includes(userId);
      if (target.isPrivate) {
        if (pendingOut) {
          return {
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
        }
        const next: AppState = {
          ...s,
          users: s.users.map((u) => {
            if (u.id === meId)
              return { ...u, followRequestOut: [...(u.followRequestOut || []), userId] };
            if (u.id === userId)
              return { ...u, followRequestIn: [...(u.followRequestIn || []), meId] };
            return u;
          }),
        };
        return pushNotif(next, {
          userId,
          fromId: meId,
          type: "friend_request",
          text: "أرسل لك طلب متابعة",
          followRequestStatus: "pending",
        });
      }
      const next = {
        ...s,
        users: s.users.map((u) => {
          if (u.id === meId) return { ...u, following: [...u.following, userId] };
          if (u.id === userId) return { ...u, followers: [...u.followers, meId] };
          return u;
        }),
      };
      return pushNotif(next, { userId, fromId: meId, type: "follow" });
    });

  const acceptFollowRequest = (fromId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      const inbox = s.users.find((u) => u.id === meId)?.followRequestIn || [];
      if (!inbox.includes(fromId)) return s;
      return {
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
        notifications: s.notifications.map((n) =>
          n.userId === meId && n.fromId === fromId && n.type === "friend_request"
            ? {
                ...n,
                read: true,
                followRequestStatus: "accepted" as const,
                text: "لقد قبلت طلب المتابعة من هذا الحساب ✓",
              }
            : n,
        ),
      };
    });

  const declineFollowRequest = (fromId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      const meId = s.currentUserId;
      return {
        ...s,
        users: s.users.map((u) => {
          if (u.id === meId)
            return { ...u, followRequestIn: (u.followRequestIn || []).filter((x) => x !== fromId) };
          if (u.id === fromId)
            return { ...u, followRequestOut: (u.followRequestOut || []).filter((x) => x !== meId) };
          return u;
        }),
        notifications: s.notifications.map((n) =>
          n.userId === meId && n.fromId === fromId && n.type === "friend_request"
            ? {
                ...n,
                read: true,
                followRequestStatus: "declined" as const,
                text: "لقد رفضت طلب المتابعة من هذا الحساب",
              }
            : n,
        ),
      };
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
      return {
        ...s,
        stories: s.stories.map((x) =>
          x.id === storyId ? { ...x, viewedByUserIds: [...v, meId] } : x,
        ),
      };
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
      return r
        ? next
        : pushNotif(next, { userId: post.userId, fromId: s.currentUserId, type: "repost", postId });
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
  const deletePost = (postId: ID) =>
    setState((s) => {
      if (isGuestUserId(s.currentUserId)) return s;
      return { ...s, posts: s.posts.filter((p) => p.id !== postId) };
    });

  const addStory: Ctx["addStory"] = useCallback(
    (image, audience = "all", stickers) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const row: StoryItem = isVid
          ? {
              id: uid(),
              userId: s.currentUserId,
              image: "🎬",
              video: image,
              createdAt: Date.now(),
              audience,
              likes: [],
              viewedByUserIds: [],
            }
          : {
              id: uid(),
              userId: s.currentUserId,
              image,
              createdAt: Date.now(),
              audience,
              likes: [],
              viewedByUserIds: [],
            };
        if (stickers && stickers.length > 0) row.stickers = stickers;
        return { ...s, stories: [row, ...s.stories] };
      });
    },
    [setState],
  );

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
      if (otherUserId === snap.currentUserId) return null;

      const existing = snap.chats.find(
        (c) =>
          !c.isGroup &&
          !c.isChannel &&
          c.members.includes(snap.currentUserId) &&
          c.members.includes(otherUserId),
      );
      if (existing) return existing;

      const me = snap.currentUserId;
      const other = snap.users.find((u) => u.id === otherUserId);
      const isFollowing = snap.users.find((u) => u.id === me)?.following.includes(otherUserId) ?? false;
      const newChat: Chat = {
        id: uid(),
        isGroup: false,
        members: [me, otherUserId],
        admins: [],
        messages: [],
        request: !isFollowing && !!other?.isPrivate,
        lastOpenAtByUser: {},
        lastReadMessageIdByUser: {},
      };

      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const dup = s.chats.find(
          (c) =>
            !c.isGroup &&
            !c.isChannel &&
            c.members.includes(s.currentUserId) &&
            c.members.includes(otherUserId),
        );
        if (dup) return s;
        return { ...s, chats: [...s.chats, newChat] };
      });
      return newChat;
    },
    [setState],
  );

  const createGroup: Ctx["createGroup"] = (name, avatar, memberIds) => {
    if (memberIds.length < 2 || !state.currentUserId || isGuestUserId(state.currentUserId))
      return null;
    const newChat: Chat = {
      id: uid(),
      isGroup: true,
      name,
      avatar,
      members: Array.from(new Set([state.currentUserId, ...memberIds])),
      admins: [state.currentUserId],
      messages: [],
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
    };
    setState((s) => ({ ...s, chats: [...s.chats, newChat] }));
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
  const leaveChat = (chatId: ID) =>
    setState((s) => {
      if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
      return {
        ...s,
        chats: s.chats.map((c) =>
          c.id === chatId && s.currentUserId
            ? {
                ...c,
                members: c.members.filter((x) => x !== s.currentUserId),
                admins: c.admins.filter((x) => x !== s.currentUserId),
                hosts: (c.hosts || []).filter((x) => x !== s.currentUserId),
              }
            : c,
        ),
        users: s.currentUserId
          ? s.users.map((u) =>
              u.id !== s.currentUserId
                ? u
                : {
                    ...u,
                    pinnedChatIds: (u.pinnedChatIds || []).filter((id) => id !== chatId),
                    mutedChatIds: (u.mutedChatIds || []).filter((id) => id !== chatId),
                  },
            )
          : s.users,
      };
    });

  const sendMessage: Ctx["sendMessage"] = useCallback(
    (chatId, msg) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const chat = s.chats.find((c) => c.id === chatId);
        if (!chat) return s;
        if (chat.isChannel && !(chat.hosts || []).includes(s.currentUserId)) return s;
        const m: Message = { id: uid(), senderId: s.currentUserId, createdAt: Date.now(), ...msg };
        let next = {
          ...s,
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, m] } : c)),
        };
        if (msg.type === "text") {
          const mentions = Array.from(
            new Set((msg.content.match(/@(\w+)/g) || []).map((x) => x.slice(1))),
          );
          mentions.forEach((uname) => {
            const u = next.users.find((x) => x.username === uname);
            if (u)
              next = pushNotif(next, {
                userId: u.id,
                fromId: s.currentUserId!,
                type: "mention",
                text: msg.content,
              });
          });
        }
        const isDm = !chat.isGroup && !chat.isChannel && chat.members.length === 2;
        if (isDm) {
          const otherId = chat.members.find((id) => id !== s.currentUserId);
          if (otherId) {
            let preview = "";
            if (msg.type === "text")
              preview = msg.content.length > 160 ? msg.content.slice(0, 160) + "…" : msg.content;
            else if (msg.type === "sticker") preview = "ملصق";
            else if (msg.type === "image") preview = msg.viewOnce ? "صورة (مرة واحدة)" : "صورة";
            else if (msg.type === "video") preview = msg.viewOnce ? "فيديو (مرة واحدة)" : "فيديو";
            else if (msg.type === "voice") preview = "رسالة صوتية";
            else if (msg.type === "shared_post") preview = "منشور";
            else if (msg.type === "shared_story") preview = "ستوري";
            else preview = "رسالة";
            next = pushNotif(next, {
              userId: otherId,
              fromId: s.currentUserId!,
              type: "message",
              chatId,
              text: preview,
            });
          }
        }
        return next;
      });
    },
    [setState],
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

  const renameGroup = (chatId: ID, name: string) =>
    setState((s) => ({ ...s, chats: s.chats.map((c) => (c.id === chatId ? { ...c, name } : c)) }));
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
  const kickMember = (chatId: ID, userId: ID) =>
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
    setState((s) => ({
      ...s,
      users: s.users.map((u) =>
        u.id === s.currentUserId ? { ...u, note: text, noteAt: Date.now() } : u,
      ),
    }));
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
      const existing = s.chats.find(
        (c) =>
          !c.isGroup &&
          !c.isChannel &&
          c.members.includes(me) &&
          c.members.includes(p.noteAuthorId),
      );
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
        id: uid(),
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
    setState((s) => {
      if (!s.currentUserId || !p.replyText.trim()) return s;
      if (isGuestUserId(s.currentUserId)) return s;
      if (p.friendId === s.currentUserId) return s;
      const me = s.currentUserId;
      const other = s.users.find((u) => u.id === p.friendId);
      const isFollowing = s.users.find((u) => u.id === me)?.following.includes(p.friendId);
      const preview = p.noteText.length > 200 ? p.noteText.slice(0, 200) + "…" : p.noteText;
      const header = `↩️ رد على نوتك:\n«${preview}»\n—\n`;
      const content = header + p.replyText.trim();
      const m: Message = { id: uid(), senderId: me, type: "text", content, createdAt: Date.now() };
      const existing = s.chats.find(
        (c) =>
          !c.isGroup && !c.isChannel && c.members.includes(me) && c.members.includes(p.friendId),
      );
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
        id: uid(),
        isGroup: false,
        members: [me, p.friendId],
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

  const markChatRead: Ctx["markChatRead"] = useCallback(
    (chatId) => {
      setState((s) => {
        if (!s.currentUserId || isGuestUserId(s.currentUserId)) return s;
        const meId = s.currentUserId;
        const chat = s.chats.find((c) => c.id === chatId);
        if (!chat) return s;
        const last = chat.messages[chat.messages.length - 1];
        const lastId = last?.id ?? "";
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
        content: BOT_MESSAGES[Math.floor(Math.random() * BOT_MESSAGES.length)],
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

  const value: Ctx = {
    state,
    setState,
    currentUser,
    isGuest,
    enterGuestBrowseMode,
    exitGuestBrowseMode,
    signup,
    login,
    resetPasswordForUser,
    requestPasswordResetRemote,
    completePasswordResetRemote,
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
    toggleCloseFriend,
    createPost,
    toggleLike,
    toggleStoryLike,
    recordStoryView,
    toggleFavorite,
    touchQuranBot,
    toggleRepost,
    addComment,
    deletePost,
    addStory,
    addHighlight,
    openOrCreateChat,
    createGroup,
    createChannel,
    toggleHost,
    leaveChat,
    sendMessage,
    markViewOnceOpened,
    hideMessageForMe,
    addMessageReaction,
    forwardMessage,
    pinChatMessage,
    unpinChatMessage,
    addFavoriteStickerContent,
    addCreatedStickerContent,
    renameGroup,
    toggleGroupAdmin,
    kickMember,
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
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function userById(state: AppState, id: ID) {
  return state.users.find((u) => u.id === id);
}

/** رسائل المحادثة الظاهرة للمستخدم (بعد استبعاد «حذف عندك فقط») */
export function visibleChatMessages(chat: Chat, viewerId: ID): Message[] {
  const hid = chat.hiddenMessageIdsByUser?.[viewerId];
  if (!hid?.length) return chat.messages;
  const hidden = new Set(hid);
  return chat.messages.filter((m) => !hidden.has(m.id));
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

/** ترتيب حسابات الستوري في الشريط (حسب ظهور أحدث ستوري لكل حساب) */
export function visibleStoryUserIds(state: AppState, viewerId: ID): ID[] {
  const me = userById(state, viewerId);
  if (!me) return [];
  const out: ID[] = [];
  const seen = new Set<ID>();
  for (const s of state.stories) {
    if (seen.has(s.userId)) continue;
    const author = userById(state, s.userId);
    if (!author) continue;
    if (s.userId !== viewerId) {
      if (author.blocked.includes(viewerId) || me.blocked.includes(s.userId)) continue;
      if (author.isPrivate && !author.followers.includes(viewerId)) continue;
    }
    const ok =
      s.audience === "all" || s.userId === viewerId || author.closeFriends.includes(viewerId);
    if (!ok) continue;
    seen.add(s.userId);
    out.push(s.userId);
  }
  return out;
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
