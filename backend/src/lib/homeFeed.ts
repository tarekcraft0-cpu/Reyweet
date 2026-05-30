import type { AppState, Post, User } from "../../../src/lib/types.js";
import { getSnapshot } from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeDbPostsIntoAppState } from "./mergeDbPosts.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { coerceAppStateForClient } from "./coerceAppState.js";
import { normalizeFounderPostUserId } from "./founderLegacy.js";

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

/** خلاصة الرئيسية من posts.json + المتابعات الحية — لا تعتمد على لقطة العميل القديمة */
export async function buildHomeFeedForViewer(viewerId: string): Promise<{
  posts: Post[];
  users: User[];
}> {
  let state = (await getSnapshot(viewerId)) as AppState | null;
  if (!state) state = await buildMinimalAppState(viewerId);
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeDbPostsIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state = coerceAppStateForClient(state);

  const usersById = new Map((state.users || []).map(u => [u.id, u]));
  const posts = (state.posts || [])
    .filter(p => viewerCanSeePost(viewerId, p, usersById))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const authorIds = new Set<string>([viewerId]);
  for (const p of posts) authorIds.add(p.userId);

  const users = (state.users || []).filter(u => authorIds.has(u.id));

  return { posts, users };
}
