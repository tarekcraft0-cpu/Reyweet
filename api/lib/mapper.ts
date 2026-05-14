import type { PrismaClient } from "@prisma/client";
import type {
  AppState,
  User,
  Post,
  Chat,
  Message,
  StoryItem,
  Sticker,
  Notification,
  MediaNote,
  Comment,
} from "../../src/lib/types";

function asArr<T>(v: unknown, fallback: T[]): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** يبني حالة التطبيق من قاعدة البيانات (نسخة أولية — تحميل كامل للمجال الصغير) */
export async function buildAppState(prisma: PrismaClient, currentUserId: string): Promise<AppState> {
  const [
    dbUsers,
    follows,
    blocks,
    closeFriends,
    favoritePosts,
    posts,
    comments,
    stories,
    chats,
    chatMembers,
    messages,
    notifications,
    stickers,
    mediaNotes,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.follow.findMany(),
    prisma.block.findMany(),
    prisma.closeFriend.findMany(),
    prisma.favoritePost.findMany(),
    prisma.post.findMany(),
    prisma.comment.findMany(),
    prisma.story.findMany(),
    prisma.chat.findMany(),
    prisma.chatMember.findMany(),
    prisma.message.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.sticker.findMany(),
    prisma.mediaNote.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);

  const commentsByPost = new Map<string, Comment[]>();
  for (const c of comments) {
    const row: Comment = {
      id: c.id,
      userId: c.userId,
      text: c.text,
      createdAt: c.createdAt.getTime(),
    };
    const list = commentsByPost.get(c.postId) ?? [];
    list.push(row);
    commentsByPost.set(c.postId, list);
  }

  const membersByChat = new Map<string, { userId: string; isAdmin: boolean; isHost: boolean }[]>();
  for (const m of chatMembers) {
    const list = membersByChat.get(m.chatId) ?? [];
    list.push({ userId: m.userId, isAdmin: m.isAdmin, isHost: m.isHost });
    membersByChat.set(m.chatId, list);
  }

  const messagesByChat = new Map<string, Message[]>();
  for (const m of messages) {
    const ex = asRecord(m.extrasJson);
    const msg: Message = {
      id: m.id,
      senderId: m.senderId,
      type: m.type as Message["type"],
      content: m.content,
      createdAt: m.createdAt.getTime(),
      durationSec: typeof ex.durationSec === "number" ? ex.durationSec : undefined,
      shareText: typeof ex.shareText === "string" ? ex.shareText : undefined,
      viewOnce: ex.viewOnce === true,
      viewOnceOpenedByUserIds: asArr<string>(ex.viewOnceOpenedByUserIds, []),
      replyTo: ex.replyTo as Message["replyTo"],
      reactions: ex.reactions as Message["reactions"],
      forwardedFrom: ex.forwardedFrom as Message["forwardedFrom"],
    };
    const list = messagesByChat.get(m.chatId) ?? [];
    list.push(msg);
    messagesByChat.set(m.chatId, list);
  }

  const users: User[] = dbUsers.map(u => {
    const followers = follows.filter(f => f.followeeId === u.id).map(f => f.followerId);
    const following = follows.filter(f => f.followerId === u.id).map(f => f.followeeId);
    const blocked = blocks.filter(b => b.blockerId === u.id).map(b => b.blockedId);
    const closeFriendsList = closeFriends.filter(c => c.ownerId === u.id).map(c => c.friendId);
    const favorites = favoritePosts.filter(f => f.userId === u.id).map(f => f.postId);

    return {
      id: u.id,
      username: u.username,
      email: u.email,
      password: "",
      bio: u.bio,
      avatar: u.avatar,
      profileLink: u.profileLink || undefined,
      allowStoryReplies: u.allowStoryReplies,
      isPrivate: u.isPrivate,
      verified: u.verified,
      displayFollowerCount: u.displayFollowerCount ?? undefined,
      followers,
      following,
      highlights: asArr(u.highlightsJson, []),
      followRequestIn: asArr(u.followRequestInJson, []),
      followRequestOut: asArr(u.followRequestOutJson, []),
      publicChannelIds: asArr(u.publicChannelIdsJson, []),
      showLikesAndFavoritesOnProfile: u.showLikesAndFavoritesOnProfile,
      hideFollowListsFromOthers: u.hideFollowListsFromOthers,
      note: u.note ?? undefined,
      noteAt: u.noteAt != null ? Number(u.noteAt) : undefined,
      blocked,
      closeFriends: closeFriendsList,
      favorites,
      profileViews: asArr(u.profileViewsJson, []),
      shareProfileVisitActivity: u.shareProfileVisitActivity,
      favoriteStickerContents: asArr(u.favoriteStickerContentsJson, []),
      createdStickerContents: asArr(u.createdStickerContentsJson, []),
      pinnedChatIds: asArr(u.pinnedChatIdsJson, []),
      mutedChatIds: asArr(u.mutedChatIdsJson, []),
    };
  });

  const me = dbUsers.find(u => u.id === currentUserId);
  const theme = me?.appTheme === "dark" ? "dark" : "light";
  const language = me?.appLanguage === "en" ? "en" : "ar";

  const mappedPosts: Post[] = posts.map(p => ({
    id: p.id,
    userId: p.userId,
    type: p.type as Post["type"],
    text: p.text,
    image: p.image ?? undefined,
    video: p.video ?? undefined,
    likes: asArr<string>(p.likesJson, []),
    reposts: asArr<string>(p.repostsJson, []),
    comments: commentsByPost.get(p.id) ?? [],
    createdAt: p.createdAt.getTime(),
  }));

  const mappedChats: Chat[] = chats.map(c => {
    const mems = membersByChat.get(c.id) ?? [];
    return {
      id: c.id,
      isGroup: c.isGroup,
      isChannel: c.isChannel || undefined,
      createdByUserId: c.createdByUserId ?? undefined,
      name: c.name ?? undefined,
      avatar: c.avatar ?? undefined,
      request: c.request || undefined,
      theme: c.theme ?? undefined,
      members: mems.map(x => x.userId),
      admins: mems.filter(x => x.isAdmin).map(x => x.userId),
      hosts: mems.filter(x => x.isHost).map(x => x.userId),
      messages: messagesByChat.get(c.id) ?? [],
      lastOpenAtByUser: asRecord(c.lastOpenAtByUserJson) as Chat["lastOpenAtByUser"],
      lastReadMessageIdByUser: asRecord(c.lastReadMessageIdByUserJson) as Chat["lastReadMessageIdByUser"],
      hiddenMessageIdsByUser: asRecord(c.hiddenMessageIdsByUserJson) as Chat["hiddenMessageIdsByUser"],
      pinnedMessageIds: asArr<string>(c.pinnedMessageIdsJson, []),
    };
  });

  const mappedStories: StoryItem[] = stories.map(s => ({
    id: s.id,
    userId: s.userId,
    image: s.image,
    video: s.video ?? undefined,
    createdAt: s.createdAt.getTime(),
    audience: s.audience as StoryItem["audience"],
    stickers: asArr(s.stickersJson, []),
    likes: asArr<string>(s.likesJson, []),
  }));

  const mappedNotifs: Notification[] = notifications.map(n => ({
    id: n.id,
    userId: n.userId,
    fromId: n.fromId,
    type: n.type as Notification["type"],
    postId: n.postId ?? undefined,
    storyId: n.storyId ?? undefined,
    chatId: n.chatId ?? undefined,
    text: n.text ?? undefined,
    createdAt: n.createdAt.getTime(),
    read: n.read,
    followRequestStatus: n.followRequestStatus as Notification["followRequestStatus"],
  }));

  const mappedStickers: Sticker[] = stickers.map(s => ({
    id: s.id,
    userId: s.userId,
    emoji: s.emoji,
    label: s.label,
  }));

  const mappedMediaNotes: MediaNote[] = mediaNotes.map(m => ({
    id: m.id,
    kind: m.kind as MediaNote["kind"],
    targetId: m.targetId,
    authorId: m.authorId,
    text: m.text,
    createdAt: m.createdAt.getTime(),
  }));

  return {
    users,
    posts: mappedPosts,
    stories: mappedStories,
    chats: mappedChats,
    stickers: mappedStickers,
    notifications: mappedNotifs,
    mediaNotes: mappedMediaNotes,
    currentUserId,
    accountIds: [currentUserId],
    theme,
    language,
  };
}
