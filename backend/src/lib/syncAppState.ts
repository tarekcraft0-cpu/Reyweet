import type { AppState, Post, User } from "../../../src/lib/types.js";
import {
  createUser,
  getUserById,
  listStories,
  replaceLikesForPost,
  replaceStories,
  updateUser,
  upsertPost,
  upsertMessagesBatch,
  type PostRow,
  type StoryRow,
} from "../db/engine.js";
import { extractMessagesFromChats } from "./chatMessages.js";
import { normalizeUsername, validateUsernameFormat } from "./usernameRules.js";

/** مزامنة جداول users / posts / likes من لقطة التطبيق — المتابعات عبر /v1/social فقط */
export async function syncNormalizedFromAppState(state: AppState, ownerUserId?: string): Promise<void> {
  const now = new Date().toISOString();

  for (const u of state.users || []) {
    if (!u.id || !u.username) continue;
    const existing = await getUserById(u.id);
    if (!existing) {
      const normNew = normalizeUsername(u.username);
      if (validateUsernameFormat(normNew, u.id)) continue;
      await createUser({
        id: u.id,
        email: u.email || `${normNew}@local.retweet`,
        username: normNew,
        passwordHash: "$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG",
        avatar: u.avatar || normNew.slice(0, 2).toUpperCase(),
        bio: u.bio || "",
        isPrivate: u.isPrivate === true,
        appTheme: state.theme === "dark" ? "dark" : "light",
        appLanguage: state.language === "en" ? "en" : "ar",
      });
    } else {
      const patch: Parameters<typeof updateUser>[1] = {
        email: u.email || existing.email,
        bio: u.bio ?? existing.bio,
        profileLink: u.profileLink?.trim() || "",
        phone: u.phone?.trim() || "",
        note: u.note?.trim() || "",
        officialSiteUrl: "",
        isPrivate: u.isPrivate === true,
        appTheme: state.theme === "dark" ? "dark" : "light",
        appLanguage: state.language === "en" ? "en" : "ar",
      };
      /**
       * توثيق/أفتار/يوزر — صاحب الحساب فقط.
       * لا نكتب verified:false لبقية users[] في اللقطة (دليل بحث) وإلا يُلغى توثيق الجميع.
       */
      if (ownerUserId && u.id === ownerUserId) {
        patch.verified = u.verified === true;
        patch.founderVerified = u.founderVerified === true;
        patch.founderOfficialLabel = u.founderOfficialLabel?.trim() || "";
        if (u.avatar != null && String(u.avatar).trim()) patch.avatar = String(u.avatar).trim();
        if (u.displayName !== undefined) {
          patch.displayName = u.displayName?.trim() || undefined;
        }
        const norm = normalizeUsername(u.username);
        if (!validateUsernameFormat(norm, u.id)) patch.username = norm;
      }
      await updateUser(u.id, patch);
    }
  }

  for (const p of state.posts || []) {
    if (!p.id || !p.userId) continue;
    const row: PostRow = {
      id: p.id,
      userId: p.userId,
      type: p.type,
      text: p.text || "",
      image: p.image,
      video: p.video,
      likes: p.likes || [],
      reposts: p.reposts || [],
      createdAt: new Date(p.createdAt || Date.now()).toISOString(),
      updatedAt: now,
    };
    await upsertPost(row);
    await replaceLikesForPost(p.id, p.likes || []);
  }

  const existingStories = await listStories();
  const storyById = new Map<string, StoryRow>();
  for (const s of existingStories) storyById.set(s.id, s);
  for (const s of state.stories || []) {
    if (!s?.id || !s.userId) continue;
    storyById.set(s.id, {
      id: s.id,
      userId: s.userId,
      image: s.image,
      video: s.video,
      createdAt: s.createdAt,
      audience: s.audience === "close" ? "close" : "all",
      stickers: s.stickers,
      likes: s.likes || [],
      viewedByUserIds: s.viewedByUserIds || [],
    });
  }
  await replaceStories([...storyById.values()]);

  const messageRows = extractMessagesFromChats(state.chats || []);
  await upsertMessagesBatch(messageRows);
}

/** بناء حالة أولية من الجداول عند عدم وجود لقطة */
export async function buildMinimalAppState(currentUserId: string): Promise<AppState> {
  const { listUsers, listPosts, listFollows } = await import("../db/engine.js");
  const dbUsers = await listUsers();
  const posts = await listPosts();
  const follows = await listFollows();

  const users: User[] = dbUsers.map(u => {
    const followers = follows.filter(f => f.followeeId === u.id).map(f => f.followerId);
    const following = follows.filter(f => f.followerId === u.id).map(f => f.followeeId);
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName?.trim() || undefined,
      email: u.email,
      password: "",
      bio: u.bio,
      avatar: u.avatar,
      followers,
      following,
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
      verified: u.verified === true,
      founderVerified: u.founderVerified === true,
      founderOfficialLabel: u.founderOfficialLabel,
      note: u.note,
      phone: u.phone || undefined,
      profileLink: u.profileLink || u.officialSiteUrl || undefined,
      isPrivate: u.isPrivate === true,
    };
  });

  const mappedPosts: Post[] = posts.map(p => ({
    id: p.id,
    userId: p.userId,
    type: p.type as Post["type"],
    text: p.text,
    image: p.image,
    video: p.video,
    likes: p.likes,
    reposts: p.reposts,
    comments: [],
    createdAt: new Date(p.createdAt).getTime(),
  }));

  const me = dbUsers.find(u => u.id === currentUserId);
  const dbStories = await listStories();
  const now = Date.now();
  const STORY_TTL_MS = 24 * 60 * 60 * 1000;
  const stories = dbStories
    .filter(s => {
      const createdAt =
        typeof s.createdAt === "number"
          ? s.createdAt
          : Date.parse(String(s.createdAt ?? "")) || 0;
      return createdAt > now - STORY_TTL_MS;
    })
    .map(s => ({
      ...s,
      createdAt:
        typeof s.createdAt === "number"
          ? s.createdAt
          : Date.parse(String(s.createdAt ?? "")) || Date.now(),
      audience: s.audience === "close" ? ("close" as const) : ("all" as const),
      likes: s.likes || [],
      viewedByUserIds: s.viewedByUserIds || [],
    }));

  return {
    users,
    posts: mappedPosts,
    stories,
    chats: [],
    stickers: [],
    notifications: [],
    mediaNotes: [],
    currentUserId,
    accountIds: [currentUserId],
    theme: me?.appTheme === "dark" ? "dark" : "light",
    language: me?.appLanguage === "en" ? "en" : "ar",
  };
}
