import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { AppState, Comment, Notification, Post, StoryItem } from "../../../src/lib/types.js";
import { SNAPSHOTS_DIR } from "../config.js";
import {
  getSnapshot,
  getUserById,
  listPosts,
  listStories,
  replaceLikesForPost,
  replaceStories,
  setSnapshot,
  upsertPost,
  type PostRow,
} from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { deliverNotification } from "./socialActions.js";
import { broadcastSseExcept, broadcastSseEvent, broadcastSseToUser } from "./realtimeHub.js";
import { broadcastSocketEvent } from "./realtimeSocket.js";

type PostCommentRow = { id: string; userId: string; text: string; createdAt: number };

function stripPasswords(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

async function loadUserState(userId: string): Promise<AppState> {
  let state = (await getSnapshot(userId)) as AppState | null;
  if (!state) state = await buildMinimalAppState(userId);
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state.currentUserId = userId;
  return state;
}

async function saveUserState(userId: string, state: AppState): Promise<void> {
  await setSnapshot(userId, stripPasswords({ ...state, currentUserId: userId }));
}

function clientPostToRow(p: Post): PostRow {
  const now = new Date().toISOString();
  return {
    id: p.id,
    userId: p.userId,
    type: p.type,
    text: p.text ?? "",
    image: p.image,
    video: p.video,
    audio: p.audio,
    likes: p.likes ?? [],
    reposts: p.reposts ?? [],
    comments: (p.comments || []).map(c => ({
      id: c.id,
      userId: c.userId,
      text: c.text,
      createdAt: c.createdAt,
    })),
    createdAt: new Date(p.createdAt || Date.now()).toISOString(),
    updatedAt: now,
  };
}

/** يبحث في posts.json ثم في لقطات المستخدمين (منشورات لم تُزامَن بعد) */
async function resolvePostRow(postId: string): Promise<PostRow | null> {
  const posts = await listPosts();
  const inDb = posts.find(p => p.id === postId);
  if (inDb) return inDb;

  try {
    const names = await fs.readdir(SNAPSHOTS_DIR);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const userId = name.slice(0, -5);
      const snap = (await getSnapshot(userId)) as AppState | null;
      const hit = snap?.posts?.find(p => p.id === postId);
      if (hit) {
        const row = clientPostToRow(hit);
        await upsertPost(row);
        await replaceLikesForPost(row.id, row.likes ?? []);
        return row;
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[postSocial] snapshot scan failed", e);
  }
  return null;
}

async function patchOwnerSnapshotPost(ownerId: string, post: Post): Promise<void> {
  try {
    const state = await loadUserState(ownerId);
    const posts = [...(state.posts || [])];
    const i = posts.findIndex(p => p.id === post.id);
    if (i >= 0) posts[i] = { ...posts[i], ...post };
    else posts.unshift(post);
    state.posts = posts.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    await saveUserState(ownerId, state);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[postSocial] owner snapshot patch failed", e);
  }
}

function broadcastPostUpdate(post: Post, actorId: string): void {
  const payload = { post };
  broadcastSocketEvent("post_update", payload);
  broadcastSseExcept(actorId, "post_update", payload);
  if (post.userId !== actorId) {
    broadcastSseToUser(post.userId, "post_update", payload);
  }
  broadcastSseExcept(actorId, "sync_hint", { kind: "feed", postId: post.id });
}

export async function upsertPostOnServer(ownerId: string, post: Post): Promise<Post> {
  if (post.userId !== ownerId) throw new Error("غير مسموح");
  const row = clientPostToRow(post);
  const comments = rowComments(row);
  const saved = await persistPostRow(row, comments);
  await patchOwnerSnapshotPost(ownerId, saved);
  broadcastPostUpdate(saved, ownerId);
  broadcastSseEvent("sync_hint", { kind: "feed", postId: saved.id, fromUserId: ownerId });
  return saved;
}

function rowComments(row: PostRow): PostCommentRow[] {
  const raw = (row as PostRow & { comments?: PostCommentRow[] }).comments;
  return Array.isArray(raw) ? raw : [];
}

function rowToClientPost(row: PostRow, comments: PostCommentRow[]): Post {
  return {
    id: row.id,
    userId: row.userId,
    type: (row.type || "post") as Post["type"],
    text: row.text ?? "",
    image: row.image,
    video: row.video,
    audio: row.audio,
    likes: row.likes ?? [],
    reposts: row.reposts ?? [],
    comments: comments.map(c => ({
      id: c.id,
      userId: c.userId,
      text: c.text,
      createdAt: c.createdAt,
    })),
    createdAt: new Date(row.createdAt).getTime() || Date.now(),
  };
}

async function persistPostRow(row: PostRow, comments: PostCommentRow[]): Promise<Post> {
  const withComments = { ...row, comments } as PostRow & { comments: PostCommentRow[] };
  await upsertPost(withComments as PostRow);
  await replaceLikesForPost(row.id, row.likes ?? []);
  return rowToClientPost(row, comments);
}

async function notifyPostOwner(
  ownerId: string,
  actorId: string,
  notif: Omit<Notification, "id" | "createdAt" | "read" | "userId" | "fromId">,
): Promise<void> {
  if (ownerId === actorId) return;
  await deliverNotification(ownerId, {
    userId: ownerId,
    fromId: actorId,
    ...notif,
  });
}

export async function togglePostLikeOnServer(
  actorId: string,
  postId: string,
): Promise<{ liked: boolean; likes: string[] }> {
  const row = await resolvePostRow(postId);
  if (!row) throw new Error("المنشور غير موجود");
  const likes = row.likes ?? [];
  const liked = likes.includes(actorId);
  const nextLikes = liked ? likes.filter(id => id !== actorId) : [...likes, actorId];
  const comments = rowComments(row);
  const saved = await persistPostRow({ ...row, likes: nextLikes }, comments);

  if (!liked) {
    const actor = await getUserById(actorId);
    const label =
      saved.type === "reel" ? "أعجب بمقطعك" : saved.type === "tweet" ? "أعجب بتغريدتك" : "وضع ❤️ على منشورك";
    await notifyPostOwner(row.userId, actorId, {
      type: "like",
      postId,
      text: label,
    });
  }

  await patchOwnerSnapshotPost(row.userId, saved);
  broadcastPostUpdate(saved, actorId);
  return { liked: !liked, likes: nextLikes };
}

export async function togglePostRepostOnServer(
  actorId: string,
  postId: string,
): Promise<{ reposted: boolean; reposts: string[] }> {
  const row = await resolvePostRow(postId);
  if (!row) throw new Error("المنشور غير موجود");
  const reposts = row.reposts ?? [];
  const had = reposts.includes(actorId);
  const nextReposts = had ? reposts.filter(id => id !== actorId) : [...reposts, actorId];
  const comments = rowComments(row);
  const saved = await persistPostRow({ ...row, reposts: nextReposts }, comments);

  if (!had) {
    await notifyPostOwner(row.userId, actorId, {
      type: "repost",
      postId,
      text: "أعاد نشر منشورك",
    });
  }

  await patchOwnerSnapshotPost(row.userId, saved);
  broadcastPostUpdate(saved, actorId);
  return { reposted: !had, reposts: nextReposts };
}

export async function addPostCommentOnServer(
  actorId: string,
  postId: string,
  text: string,
): Promise<Comment> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("التعليق فارغ");
  const row = await resolvePostRow(postId);
  if (!row) throw new Error("المنشور غير موجود");
  const comment: PostCommentRow = {
    id: randomUUID(),
    userId: actorId,
    text: trimmed,
    createdAt: Date.now(),
  };
  const comments = [...rowComments(row), comment];
  const saved = await persistPostRow(row, comments);

  const preview =
    trimmed.length > 120 ? `علّق على منشورك: ${trimmed.slice(0, 120)}…` : `علّق على منشورك: ${trimmed}`;
  await notifyPostOwner(row.userId, actorId, {
    type: "comment",
    postId,
    text: preview,
  });

  await patchOwnerSnapshotPost(row.userId, saved);
  broadcastPostUpdate(saved, actorId);
  return comment;
}

export async function recordStoryViewOnServer(viewerId: string, storyId: string): Promise<void> {
  const all = await listStories();
  const story = all.find(s => s.id === storyId);
  if (!story || story.userId === viewerId) return;
  const viewed = story.viewedByUserIds ?? [];
  if (viewed.includes(viewerId)) return;

  const at = Date.now();
  const updated: StoryItem = {
    ...(story as StoryItem),
    viewedByUserIds: [...viewed, viewerId],
    viewedAtByUserIds: {
      ...((story as StoryItem).viewedAtByUserIds || {}),
      [viewerId]: at,
    },
  };

  const nextStories = all.map(s => (s.id === storyId ? { ...s, ...updated } : s));
  await replaceStories(nextStories);

  try {
    const authorState = await loadUserState(story.userId);
    const snapStories = authorState.stories || [];
    authorState.stories = snapStories.some(s => s.id === storyId)
      ? snapStories.map(s => (s.id === storyId ? { ...s, ...updated } : s))
      : [updated, ...snapStories];
    await saveUserState(story.userId, authorState);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[story-view] author snapshot patch failed", e);
  }

  broadcastSseToUser(story.userId, "sync_hint", { kind: "story", storyId });
}

export async function recordProfileVisitOnServer(visitorId: string, targetId: string): Promise<void> {
  if (!targetId || targetId === visitorId) return;
  const snap = (await getSnapshot(targetId)) as AppState | null;
  if (!snap) return;
  const now = Date.now();
  const users = (snap.users || []).map(u => {
    if (u.id !== targetId) return u;
    const views = [
      { userId: visitorId, at: now },
      ...(u.profileViews || []).filter(v => v.userId !== visitorId),
    ].slice(0, 60);
    return { ...u, profileViews: views };
  });
  await setSnapshot(targetId, { ...snap, users });

  const visitor = await getUserById(visitorId);
  await deliverNotification(targetId, {
    userId: targetId,
    fromId: visitorId,
    type: "follow",
    text: `@${visitor?.username || "user"} زار ملفك الشخصي`,
  });

  broadcastSseToUser(targetId, "sync_hint", { kind: "profile", fromUserId: visitorId });
}
