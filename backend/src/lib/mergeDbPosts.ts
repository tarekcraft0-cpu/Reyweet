import type { AppState, Post, User } from "../../../src/lib/types.js";
import { getUserById, listPosts, type PostRow } from "../db/engine.js";
import { normalizeFounderPostUserId } from "./founderLegacy.js";
import { getBannedUserIdSet } from "./bannedUserCache.js";

function rowToPost(row: PostRow, prev?: Post): Post {
  return {
    id: row.id,
    userId: normalizeFounderPostUserId(row.userId),
    type: (row.type || "post") as Post["type"],
    text: row.text ?? "",
    image: row.image,
    video: row.video,
    audio: row.audio,
    likes: row.likes ?? [],
    reposts: row.reposts ?? [],
    comments:
      (row as { comments?: Post["comments"] }).comments ??
      prev?.comments ??
      [],
    createdAt: (() => {
      const parsed = new Date(row.createdAt).getTime();
      const updated = new Date(row.updatedAt).getTime();
      let at =
        Number.isFinite(parsed) && parsed > 0
          ? parsed
          : prev?.createdAt && prev.createdAt > 0
            ? prev.createdAt
            : 0;
      if (Number.isFinite(updated) && updated > 0 && at > updated + 60_000) {
        at = updated;
      }
      return at;
    })(),
  };
}

/** يدمج كل المنشورات من posts.json — حتى منشورات حسابات أخرى غير موجودة في لقطة المستخدم */
export async function mergeDbPostsIntoAppState(state: AppState): Promise<AppState> {
  const rows = await listPosts();
  const bannedIds = await getBannedUserIdSet();
  const byId = new Map(
    (state.posts ?? []).filter(p => !bannedIds.has(p.userId)).map(p => [p.id, p]),
  );

  for (const row of rows) {
    if (!row.id || !row.userId || bannedIds.has(row.userId)) continue;
    const prev = byId.get(row.id);
    const fromDb = rowToPost(row, prev);
    byId.set(
      row.id,
      prev
        ? {
            ...prev,
            ...fromDb,
            likes: fromDb.likes,
            reposts: fromDb.reposts,
            comments:
              fromDb.comments.length > 0 ? fromDb.comments : prev.comments ?? [],
          }
        : fromDb,
    );
  }

  const posts = [...byId.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const users = [...(state.users || [])];
  const known = new Set(users.map(u => u.id));
  for (const p of posts) {
    if (!p.userId || known.has(p.userId) || bannedIds.has(p.userId)) continue;
    const row = await getUserById(p.userId);
    if (!row) continue;
    known.add(row.id);
    users.push({
      id: row.id,
      username: row.username,
      email: row.email,
      password: "",
      displayName: row.displayName?.trim() || undefined,
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
      appOfficialLabel: row.appOfficialLabel,
    } as User);
  }

  return { ...state, posts, users };
}
