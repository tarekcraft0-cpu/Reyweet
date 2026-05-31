import type { AppState, Post, User } from "../../../src/lib/types.js";
import { getSnapshot } from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeDbPostsIntoAppState } from "./mergeDbPosts.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { coerceAppStateForClient } from "./coerceAppState.js";
import { normalizeFounderPostUserId } from "./founderLegacy.js";
import { listPostsPaginated } from "../db/engine.js";
import type { PostRow } from "../db/engine.js";

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

function postRowToClient(row: PostRow): Post {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as Post["type"],
    text: row.text ?? "",
    image: row.image,
    video: row.video,
    audio: row.audio,
    likes: row.likes ?? [],
    reposts: row.reposts ?? [],
    comments: (row.comments ?? []).map(c => ({
      id: c.id,
      userId: c.userId,
      text: c.text,
      createdAt: c.createdAt,
    })),
    createdAt: Date.parse(row.createdAt) || 0,
  };
}

/** خلاصة الرئيسية — pagination على مستوى DB + فلتر خصوصية */
export async function buildHomeFeedForViewer(
  viewerId: string,
  opts?: { limit?: number; before?: number },
): Promise<{
  posts: Post[];
  users: User[];
  hasMore: boolean;
  nextCursor?: number;
}> {
  const pageLimit = Math.min(50, Math.max(1, opts?.limit ?? 30));
  const fetchLimit = pageLimit * 3;
  const { rows, hasMore: dbHasMore } = await listPostsPaginated({
    limit: fetchLimit,
    before: opts?.before,
  });

  let state = (await getSnapshot(viewerId)) as AppState | null;
  if (!state) state = await buildMinimalAppState(viewerId);
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state = coerceAppStateForClient(state);

  const usersById = new Map((state.users || []).map(u => [u.id, u]));
  const posts: Post[] = [];
  for (const row of rows) {
    const p = postRowToClient(row);
    if (viewerCanSeePost(viewerId, p, usersById)) posts.push(p);
    if (posts.length >= pageLimit) break;
  }

  const hasMore = dbHasMore || posts.length >= pageLimit;
  const authorIds = new Set<string>([viewerId]);
  for (const p of posts) authorIds.add(p.userId);
  const users = (state.users || []).filter(u => authorIds.has(u.id));

  return {
    posts,
    users,
    hasMore,
    nextCursor: posts.length ? posts[posts.length - 1]!.createdAt : undefined,
  };
}
