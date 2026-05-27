import { dmChatId } from "./dmChatId";

import { isGuestUserId } from "./guestUser";

import type { AppState, Chat, ID, Post, StoryItem, User } from "./types";



/** حسابات العينة المدمجة في وضع التطوير */

export const DEV_DEMO_USER_IDS = ["u_tariq_bot"] as const;



export type DevSeedBundle = {

  users: User[];

  posts: Post[];

  stories: StoryItem[];

  stickers: NonNullable<AppState["stickers"]>;

  quranChat: Chat;

};



function devRestoreEnabled(): boolean {

  return import.meta.env.DEV && typeof window !== "undefined";

}



/** لا نستخدم العينة المحلية إذا كان الخادم وقاعدة البيانات متصلين */

export async function isDevApiDatabaseReachable(): Promise<boolean> {

  if (!devRestoreEnabled()) return false;

  try {

    const { probeHealth } = await import("./apiConfig");

    return probeHealth();

  } catch {

    return false;

  }

}



function countDemoUsers(users: User[]): number {

  return users.filter(u => (DEV_DEMO_USER_IDS as readonly string[]).includes(u.id)).length;

}



function wireDevFeedFollowing(state: AppState): AppState {

  const ownerId = state.currentUserId;

  if (!ownerId || isGuestUserId(ownerId)) return state;

  const followIds = [...DEV_DEMO_USER_IDS];

  let changed = false;

  const users = (state.users || []).map(u => {

    if (u.id === ownerId) {

      const following = new Set([...(u.following || []), ...followIds]);

      if (following.size === (u.following || []).length) return u;

      changed = true;

      return { ...u, following: [...following] };

    }

    if ((followIds as readonly string[]).includes(u.id)) {

      const followers = new Set([...(u.followers || []), ownerId]);

      if (followers.size === (u.followers || []).length) return u;

      changed = true;

      return { ...u, followers: [...followers] };

    }

    return u;

  });

  return changed ? { ...state, users } : state;

}



function buildDevDmChats(_ownerId: ID): Chat[] {

  return [];

}



/**

 * في وضع التطوير فقط: يدمج بيانات العينة إذا كانت الحالة فارغة أو ناقصة

 * (مثلاً بعد مزامنة API فارغة أو عزل حساب أزال المستخدمين المرجعيين).

 */

export function mergeDevSeedIfNeeded(

  state: AppState,

  seed: DevSeedBundle,

  opts?: { skipWhenApiHealthy?: boolean },

): AppState {

  if (!devRestoreEnabled()) return state;

  if (opts?.skipWhenApiHealthy) return state;



  const posts = state.posts ?? [];

  const users = state.users ?? [];

  const stories = state.stories ?? [];

  const chats = state.chats ?? [];

  const needsPosts = posts.length < 1;

  const needsUsers = countDemoUsers(users) < 1;

  const ownerId = state.currentUserId;

  const dmCount = ownerId

    ? chats.filter(c => !c.isGroup && !c.isChannel && c.members.includes(ownerId)).length

    : 0;

  const needsDm = false;



  if (!needsPosts && !needsUsers && !needsDm) {

    return wireDevFeedFollowing(state);

  }



  const usersById = new Map<ID, User>(users.map(u => [u.id, u]));

  if (needsUsers) {

    for (const u of seed.users) {

      if (!usersById.has(u.id)) usersById.set(u.id, { ...u, password: "" });

    }

  }



  const postsById = new Map(posts.map(p => [p.id, p]));

  if (needsPosts) {

    for (const p of seed.posts) postsById.set(p.id, p);

  }



  const storiesById = new Map(stories.map(s => [s.id, s]));

  if (needsPosts && stories.length < 1) {

    for (const s of seed.stories) storiesById.set(s.id, s);

  }



  const stickersById = new Map((state.stickers || []).map(s => [s.id, s]));

  for (const s of seed.stickers) {

    if (!stickersById.has(s.id)) stickersById.set(s.id, s);

  }



  const chatsById = new Map(chats.map(c => [c.id, c]));

  if (!chatsById.has(seed.quranChat.id)) {

    chatsById.set(seed.quranChat.id, seed.quranChat);

  }



  const next: AppState = {

    ...state,

    users: [...usersById.values()],

    posts: [...postsById.values()],

    stories: [...storiesById.values()],

    stickers: [...stickersById.values()],

    chats: [...chatsById.values()],

  };



  if (needsPosts || needsUsers) {

    console.info("[Retweet dev] تمت استعادة بيانات العينة (بوت / رسمي)");

  }



  return wireDevFeedFollowing(next);

}



/** إصلاح localStorage المحلي مرة عند التحميل إذا كانت الحالة فارغة */

export function repairDevLocalStorageOnce(

  storageKey: string,

  seed: DevSeedBundle,

  normalize: (s: AppState) => AppState,

  base: AppState,

): void {

  if (!devRestoreEnabled()) return;

  const flag = "retweet_dev_seed_restored_v2";

  try {

    const raw = localStorage.getItem(storageKey);

    if (!raw) return;

    const parsed = JSON.parse(raw) as AppState;

    const posts = parsed.posts ?? [];

    if (posts.length >= 1 && countDemoUsers(parsed.users ?? []) >= 1) {

      if (!localStorage.getItem(flag)) localStorage.setItem(flag, "1");

      return;

    }

    const merged = mergeDevSeedIfNeeded(normalize({ ...base, ...parsed }), seed);

    localStorage.setItem(storageKey, JSON.stringify(merged));

    localStorage.setItem(flag, "1");

    console.info("[Retweet dev] أُصلح التخزين المحلي — أُعيدت بيانات العينة");

  } catch {

    /* ignore */

  }

}


