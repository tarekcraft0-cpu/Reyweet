export type ID = string;

/** شريحة محفوظة في الهايلايت (تبقى بعد انتهاء الستوري ٢٤ ساعة) */
export interface HighlightSlide {
  image: string;
  video?: string;
}

export interface HighlightEntry {
  id: ID;
  title: string;
  cover: string;
  coverImage?: string;
  storyIds: ID[];
  slides?: HighlightSlide[];
}

export interface User {
  id: ID;
  username: string;
  email: string;
  password: string;
  bio: string;
  avatar: string;
  profileLink?: string;
  allowStoryReplies?: boolean;
  isPrivate: boolean;
  verified?: boolean;
  followers: ID[];
  following: ID[];
  displayFollowerCount?: number;
  highlights: HighlightEntry[];
  followRequestIn?: ID[];
  followRequestOut?: ID[];
  publicChannelIds?: ID[];
  showLikesAndFavoritesOnProfile?: boolean;
  hideFollowListsFromOthers?: boolean;
  note?: string;
  noteAt?: number;
  blocked: ID[];
  closeFriends: ID[];
  favorites: ID[];
  profileViews?: { userId: ID; at: number }[];
  shareProfileVisitActivity?: boolean;
  favoriteStickerContents?: string[];
  createdStickerContents?: string[];
  pinnedChatIds?: ID[];
  mutedChatIds?: ID[];
}

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
  video?: string;
  createdAt: number;
  audience: "all" | "close";
  stickers?: StorySticker[];
  likes?: ID[];
}

export interface Comment {
  id: ID;
  userId: ID;
  text: string;
  createdAt: number;
}

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

export interface Message {
  id: ID;
  senderId: ID;
  type: "text" | "image" | "video" | "voice" | "sticker" | "drawing" | "shared_post" | "shared_story";
  content: string;
  createdAt: number;
  durationSec?: number;
  shareText?: string;
  viewOnce?: boolean;
  viewOnceOpenedByUserIds?: ID[];
  replyTo?: { id: ID; content: string; type: Message["type"] };
  reactions?: { emoji: string; userId: ID }[];
  forwardedFrom?: { sourceChatLabel: string };
}

export interface Chat {
  id: ID;
  isGroup: boolean;
  isChannel?: boolean;
  createdByUserId?: ID;
  name?: string;
  avatar?: string;
  members: ID[];
  admins: ID[];
  hosts?: ID[];
  messages: Message[];
  theme?: string;
  request?: boolean;
  lastOpenAtByUser?: Record<ID, number>;
  lastReadMessageIdByUser?: Record<ID, ID>;
  hiddenMessageIdsByUser?: Record<ID, ID[]>;
  pinnedMessageIds?: ID[];
}

export interface Sticker {
  id: ID;
  userId: ID;
  emoji: string;
  label: string;
}

export interface Notification {
  id: ID;
  userId: ID;
  fromId: ID;
  type: "like" | "comment" | "follow" | "repost" | "mention" | "message" | "friend_request";
  postId?: ID;
  storyId?: ID;
  chatId?: ID;
  text?: string;
  createdAt: number;
  read: boolean;
  followRequestStatus?: "pending" | "accepted" | "declined";
}

export interface MediaNote {
  id: ID;
  kind: "post" | "story";
  targetId: ID;
  authorId: ID;
  text: string;
  createdAt: number;
}

export type ProfileHomeSurface = "feed_comments_sheet" | "post_detail_full";
export type ProfileGridTab = "posts" | "reposts" | "likes";

export interface ProfileReturnContext {
  postId: ID;
  tab: "home" | "search" | "reels" | "profile";
  commentsOpen?: boolean;
  homeSurface?: ProfileHomeSurface;
  profileUserId?: ID;
  profileGridTab?: ProfileGridTab;
}

export const PROFILE_RETURN_POST_KEY = "retweet_return_post_context";

export interface AppState {
  users: User[];
  posts: Post[];
  stories: StoryItem[];
  chats: Chat[];
  stickers: Sticker[];
  notifications: Notification[];
  mediaNotes: MediaNote[];
  currentUserId: ID | null;
  accountIds: ID[];
  theme: "light" | "dark";
  language: "ar" | "en";
}
