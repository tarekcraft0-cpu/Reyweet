import type { AppState, Post, User } from "../../../src/lib/types.js";
import {
  getSnapshot,
  getUserById,
  listPosts,
  upsertPostPreservingSocial,
  type PostRow,
} from "../db/engine.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { coerceAppStateForClient } from "./coerceAppState.js";
import {
  authorIdsForFounderProfile,
  normalizeFounderPostUserId,
} from "./founderLegacy.js";

function viewerCanSeePost(viewerId: string, post: Post, usersById: Map<string, User>): boolean {
  if (!post?.id || !post.userId) return false;
  const authorId = normalizeFounderPostUserId(post.userId);
  if (authorId === viewerId) return true;
  const author = usersById.get(authorId) ?? usersById.get(post.userId);
  if (!author) return true;
  if (author.isPrivate !== true) return true;
  const viewer = usersById.get(viewerId);
  if ((author.followers ?? []).includes(viewerId)) return true;
  if ((viewer?.following ?? []).includes(author.id)) return true;
  return false;
}

function snapshotPostToRow(p: Post): PostRow {
  return {
    id: p.id,
    userId: normalizeFounderPostUserId(p.userId),
    type: p.type || "post",
    text: p.text ?? "",
    image: p.image,
    video: p.video,
    audio: p.audio,
    likes: p.likes ?? [],
    reposts: p.reposts ?? [],
    comments: [],
    createdAt: new Date(p.createdAt || Date.now()).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** ينقل منشورات موجودة في اللقطة فقط وغير موجودة في posts.json */
async function flushSnapshotPostsToDb(authorIds: string[]): Promise<void> {
  const authorSet = new Set(authorIds);
  const dbRows = await listPosts();
  const dbIds = new Set(dbRows.map(r => r.id));
  for (const ownerId of authorIds) {
    const snap = (await getSnapshot(ownerId)) as AppState | null;
    if (!snap?.posts?.length) continue;
    for (const p of snap.posts) {
      if (!p?.id || !p.userId) continue;
      const uid = normalizeFounderPostUserId(p.userId);
      if (!authorSet.has(p.userId) && !authorSet.has(uid) && uid !== normalizeFounderPostUserId(ownerId)) continue;
      if (dbIds.has(p.id)) continue;
      await upsertPostPreservingSocial(snapshotPostToRow({ ...p, userId: uid }));
      dbIds.add(p.id);
    }
  }
}

/** منشورات بروفايل مستخدم من posts.json + لقطة المؤلف — للمشاهد الحالي */
export async function buildUserPostsForViewer(
  profileUserId: string,
  viewerId: string,
): Promise<{ posts: Post[]; users: User[] }> {
  const authorIds = authorIdsForFounderProfile(profileUserId) ?? [profileUserId];
  const authorSet = new Set(authorIds);

  let state = (await getSnapshot(viewerId)) as AppState | null;
  if (!state) state = await buildMinimalAppState(viewerId);
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state = coerceAppStateForClient(state);

  const rows = await listPosts();
  const usersById = new Map((state.users || []).map(u => [u.id, u]));
  const byId = new Map<string, Post>();

  for (const row of rows) {
    if (!row.id || !row.userId || !authorSet.has(row.userId)) continue;
    const post: Post = {
      id: row.id,
      userId: normalizeFounderPostUserId(row.userId),
      type: (row.type || "post") as Post["type"],
      text: row.text ?? "",
      image: row.image,
      video: row.video,
      audio: row.audio,
      likes: row.likes ?? [],
      reposts: row.reposts ?? [],
      comments: (row as { comments?: Post["comments"] }).comments ?? [],
      createdAt: new Date(row.createdAt).getTime() || Date.now(),
    };
    if (!viewerCanSeePost(viewerId, post, usersById)) continue;
    byId.set(post.id, post);
  }

  for (const ownerId of authorIds) {
    const snap = (await getSnapshot(ownerId)) as AppState | null;
    for (const p of snap?.posts || []) {
      if (!p?.id || !p.userId) continue;
      const uid = normalizeFounderPostUserId(p.userId);
      if (!authorSet.has(p.userId) && !authorSet.has(uid)) continue;
      const post: Post = {
        ...p,
        userId: normalizeFounderPostUserId(p.userId),
        likes: p.likes ?? [],
        reposts: p.reposts ?? [],
        comments: p.comments ?? [],
        createdAt: p.createdAt || Date.now(),
      };
      if (!viewerCanSeePost(viewerId, post, usersById)) continue;
      byId.set(post.id, byId.get(post.id) ? { ...byId.get(post.id)!, ...post } : post);
    }
  }

  const posts = [...byId.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const needIds = new Set<string>(authorIds);
  for (const p of posts) needIds.add(p.userId);
  const users = (state.users || []).filter(u => needIds.has(u.id));

  for (const id of authorIds) {
    if (users.some(u => u.id === id)) continue;
    const row = await getUserById(id);
    if (!row) continue;
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

  return { posts, users };
}
