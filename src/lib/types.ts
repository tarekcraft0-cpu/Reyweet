export type ID = string;

/** شريحة محفوظة في الهايلايت (تبقى بعد انتهاء الستوري ٢٤ ساعة) */
export interface HighlightSlide {
  image: string;
  /** فيديو الستوري المحفوظ في الهايلايت */
  video?: string;
}

export interface HighlightEntry {
  id: ID;
  title: string;
  /** غلاف نصي/إيموجي إن لم تُضف صورة */
  cover: string;
  /** صورة دائرية للغلاف (اختياري) */
  coverImage?: string;
  storyIds: ID[];
  /** نسخ محتوى الستوريات للعرض الدائم */
  slides?: HighlightSlide[];
}

export interface User {
  id: ID;
  username: string;
  /** الاسم المعروض (مختلف عن @username) */
  displayName?: string;
  email: string;
  /** رقم جوال اختياري */
  phone?: string;
  password: string;
  bio: string;
  avatar: string;
  /** رابط يظهر تحت البايو */
  profileLink?: string;
  /** السماح للآخرين بالرد على ستورياتك */
  allowStoryReplies?: boolean;
  isPrivate: boolean;
  /** توثيق الحساب (يظهر بجانب اليوزر) — بعد موافقة الإدارة فقط */
  verified?: boolean;
  /** اشتراك التوثيق ($4/شهر) */
  isSubscribed?: boolean;
  subscriptionPlan?: string;
  subscriptionExpiresAt?: string;
  verificationStatus?: "none" | "pending" | "approved" | "rejected";
  verificationBadgeColor?: "blue" | "pink";
  verificationRequestedAt?: string;
  verificationRejectReason?: string;
  canUseAnimatedAvatar?: boolean;
  storyMaxDuration?: number;
  storyExpiryOptions?: number[];
  postCharacterLimit?: number;
  /** توثيق منشئ التطبيق — شارة مميزة غير التوثيق الأزرق العادي */
  founderVerified?: boolean;
  /** نص الملاحظة الرسمية (تُعرض في إطار خارج البايو) */
  founderOfficialLabel?: string;
  /** حساب التطبيق الرسمي — شارة بنفسجية مميزة */
  appOfficialVerified?: boolean;
  /** نص الإطار الرسمي لحساب التطبيق */
  appOfficialLabel?: string;
  followers: ID[];
  following: ID[];
  /** إن وُجد، يُعرض كعدد المتابعين في البروفايل (بدل `followers.length` فقط) */
  displayFollowerCount?: number;
  highlights: HighlightEntry[];
  /** طلبات متابعة واردة (حسابات خاصة) */
  followRequestIn?: ID[];
  /** طلبات أرسلتها أنت */
  followRequestOut?: ID[];
  /** معرفات قنوات تظهر في البروفايل */
  publicChannelIds?: ID[];
  /** إذا true يظهر تبويبا الإعجابات والمحفوظات لزوار ملفك؛ false يخفيها عن الغير (صاحب الحساب يراها دائماً) */
  showLikesAndFavoritesOnProfile?: boolean;
  /** إذا true لا يرى الزوار عدد المتابعين ولا المتابَعين ولا قوائم الأسماء (صاحب الحساب يرى كل شيء) */
  hideFollowListsFromOthers?: boolean;
  note?: string;
  noteAt?: number;
  blocked: ID[];
  closeFriends: ID[];
  favorites: ID[];
  /** آخر من زار ملفك */
  profileViews?: { userId: ID; at: number }[];
  /** إذا false لا يُسجَّل زيارتك لملفات الآخرين ولا يظهر اسمك في قائمة زوارهم */
  shareProfileVisitActivity?: boolean;
  /** محتوى ملصقات مفضلة للشات (روابط أو data URL) */
  favoriteStickerContents?: string[];
  /** ملصقات أنشأتها من صورك (data URL أو روابط) */
  createdStickerContents?: string[];
  /** محادثات مثبتة في أعلى قائمة الرسائل (ترتيب المصفوفة = من الأعلى للأسفل بين المثبتة فقط) */
  pinnedChatIds?: ID[];
  /** محادثات مكتومة الإشعارات — لا تُنشأ إشعارات رسائل لهذه المحادثة عندك */
  mutedChatIds?: ID[];
  /** حساب تصفّح محلي فقط — لا إعجاب ولا رسائل ولا متابعة */
  isGuest?: boolean;
}

/** ملصقات ستوري على نمط إنستغرام (استطلاع، سؤال، عدّ تنازلي، إلخ) */
export type StorySticker =
  | {
      id: ID;
      kind: "poll";
      x: number;
      y: number;
      rotation?: number;
      question: string;
      left: string;
      right: string;
      votesLeft: ID[];
      votesRight: ID[];
    }
  | {
      id: ID;
      kind: "question";
      x: number;
      y: number;
      rotation?: number;
      prompt: string;
    }
  | {
      id: ID;
      kind: "countdown";
      x: number;
      y: number;
      rotation?: number;
      title: string;
      targetAt: number;
    }
  | {
      id: ID;
      kind: "location";
      x: number;
      y: number;
      rotation?: number;
      place: string;
    }
  | {
      id: ID;
      kind: "mention";
      x: number;
      y: number;
      rotation?: number;
      userId: ID;
      username: string;
    }
  | {
      id: ID;
      kind: "hashtag";
      x: number;
      y: number;
      rotation?: number;
      tag: string;
    }
  | {
      id: ID;
      kind: "quiz";
      x: number;
      y: number;
      rotation?: number;
      question: string;
      options: string[];
      correctIndex: number;
      answers?: Record<ID, number>;
    }
  | {
      id: ID;
      kind: "slider";
      x: number;
      y: number;
      rotation?: number;
      emoji: string;
      label: string;
      ratings?: Record<ID, number>;
    };

export interface StoryItem {
  id: ID;
  userId: ID;
  image: string;
  /** بيانات فيديو (data URL أو رابط) عند رفع فيديو للستوري */
  video?: string;
  createdAt: number;
  audience: "all" | "close";
  /** مدة الظهور بالساعات */
  expiryHours?: number;
  stickers?: StorySticker[];
  /** من أعجبهم الستوري (قلب) */
  likes?: ID[];
  /** من شاهد الستوري (يُحدَّث عند فتح غير صاحب الستوري) */
  viewedByUserIds?: ID[];
}

export interface Comment { id: ID; userId: ID; text: string; createdAt: number; }

export interface Post {
  id: ID;
  userId: ID;
  type: "post" | "tweet" | "reel";
  text: string;
  image?: string;
  video?: string;
  likes: ID[];
  reposts: ID[];
  comments: Comment[];
  createdAt: number;
}

export type MessageDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: ID;
  senderId: ID;
  /** حالة التسليم — رسائلك فقط في الواجهة */
  status?: MessageDeliveryStatus;
  /** مرجع الرد في قاعدة البيانات */
  parentMessageId?: ID;
  type:
    | "text"
    | "image"
    | "video"
    | "voice"
    | "sticker"
    | "drawing"
    | "shared_post"
    | "shared_story"
    | "shared_group";
  content: string;
  createdAt: number;
  durationSec?: number;
  /** مع type === "shared_post" أو "shared_story": تعليق اختياري عند المشاركة في الخاص */
  shareText?: string;
  /** صورة/فيديو يُعرض كبطاقة «مرة واحدة» ثم يُقفل عند المشاهدة */
  viewOnce?: boolean;
  /** من فتح المحتوى الكامل لرسالة viewOnce (لكل مستخدم على حدة) */
  viewOnceOpenedByUserIds?: ID[];
  replyTo?: { id: ID; content: string; type: Message["type"] };
  /** سياق رد على نوت أو ستوري داخل المحادثة */
  replyContext?:
    | { kind: "note"; noteText: string }
    | { kind: "story"; storyId: ID; storyAuthorId?: ID };
  /** تفاعلات سريعة (إيموجي لكل مستخدم) */
  reactions?: { emoji: string; userId: ID }[];
  /** إعادة توجيه من محادثة أخرى */
  forwardedFrom?: { sourceChatLabel: string };
}

/** بيانات السترك بين مستخدمَين في محادثة خاصة */
export interface ChatStreak {
  streakCount: number;
  lastExchangeAt: number | null;
  user1LastSentAt: number | null;
  user2LastSentAt: number | null;
  streakExpiresAt: number | null;
  isStreakActive: boolean;
}

export interface Chat {
  id: ID;
  isGroup: boolean;
  isChannel?: boolean;
  /** سترك المحادثة الخاصة (Snapchat-style 🔥) */
  streak?: ChatStreak;
  /** من أنشأ القناة (لعرضها في البروفايل) */
  createdByUserId?: ID;
  name?: string;
  avatar?: string;
  members: ID[];
  admins: ID[];
  hosts?: ID[]; // channel co-hosts who can post
  messages: Message[];
  theme?: string;
  request?: boolean;
  /** آخر مرة فتح فيها كل عضو المحادثة (لحالة القراءة في الخاص) */
  lastOpenAtByUser?: Record<ID, number>;
  /** آخر رسالة قرأها العضو (لنقطة غير مقروء زرقاء في القائمة) */
  lastReadMessageIdByUser?: Record<ID, ID>;
  /** رسائل أخفاها المستخدم عند نفسه فقط (معرف المستخدم → معرفات الرسائل) */
  hiddenMessageIdsByUser?: Record<ID, ID[]>;
  /** رسائل مثبتة (حتى ٣) — الأحدث أولاً */
  pinnedMessageIds?: ID[];
  /** رمز دعوة للمجموعة (رابط انضمام) */
  inviteCode?: string;
  /** مجموعة عامة — الانضمام بالرابط مباشرة */
  isPublicGroup?: boolean;
  /** طلبات انضمام (مجموعات خاصة بالرابط) */
  joinRequests?: { userId: ID; at: number }[];
  /** ألقاب ذاتية داخل المجموعة (معرف العضو → الاسم المعروض، حتى 30 حرفاً) */
  groupNicknames?: Record<ID, string>;
}

export interface Sticker { id: ID; userId: ID; emoji: string; label: string; }

export interface Notification {
  id: ID;
  userId: ID; // recipient
  fromId: ID;
  type: "like" | "comment" | "follow" | "repost" | "mention" | "message" | "friend_request";
  postId?: ID;
  /** عند الإعجاب بستوري */
  storyId?: ID;
  /** محادثة الخاص عند type === "message" */
  chatId?: ID;
  text?: string;
  createdAt: number;
  read: boolean;
  /** طلب متابعة (حساب خاص): بعد القبول أو الرفض */
  followRequestStatus?: "pending" | "accepted" | "declined";
}

/** نوت على منشور/ريلز/ستوري يظهر لمن يشاهد المحتوى (مثل إنستغرام) */
export interface MediaNote {
  id: ID;
  kind: "post" | "story";
  targetId: ID;
  authorId: ID;
  text: string;
  createdAt: number;
}

/** سطح الرئيسية عند الرجوع من البروفايل (ورقة التعليقات على الكرت vs صفحة المنشور الكاملة) */
export type ProfileHomeSurface = "feed_comments_sheet" | "post_detail_full";

/** تبويبات البروفايل: خلاصة شاملة / تغريدات / إعادة نشر / ريلز */
export type ProfileGridTab = "all" | "tweets" | "reposts" | "reels";

/** عند فتح بروفايل من تعليق: الرجوع يعيد المنشور أو نافذة التعليقات */
export interface ProfileReturnContext {
  /** يُمرَّر فقط عند الحاجة لإعادة فتح منشور/تعليقات بعد الرجوع من البروفايل */
  postId?: ID;
  tab: "home" | "search" | "reels" | "profile";
  commentsOpen?: boolean;
  /** فقط عند tab === "home" */
  homeSurface?: ProfileHomeSurface;
  /** عند tab === "profile": الملف الذي كانت تُعرض فيه الشبكة */
  profileUserId?: ID;
  profileGridTab?: ProfileGridTab;
}

export const PROFILE_RETURN_POST_KEY = "retweet_return_post_context";

export interface AppState {
  users: User[];
  posts: Post[];
  stories: StoryItem[];
  /** قصص المستخدم بعد انتهاء ٢٤ ساعة (أرشيف القصص) */
  storyArchive?: StoryItem[];
  chats: Chat[];
  stickers: Sticker[];
  notifications: Notification[];
  /** نوتات مرتبطة بمنشور أو ستوري */
  mediaNotes: MediaNote[];
  currentUserId: ID | null;
  accountIds: ID[];
  theme: "light" | "dark";
  language: "ar" | "en";
}
