import fs from "node:fs/promises";
import path from "node:path";
import type { Post, User } from "../../../src/lib/types.js";
import { DATA_ROOT, PUBLIC_BASE_URL } from "../config.js";
import {
  createReel,
  getReelById,
  type ReelRow,
  userLikedReel,
} from "../db/reels.js";
import { listPosts, listUsers, type PostRow } from "../db/engine.js";
import { upsertPostOnServer } from "./postSocial.js";

export type ReelPublic = {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
  postId: string;
};

export function absoluteMediaUrl(relativePath: string): string {
  if (!relativePath) return "";
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  const base = PUBLIC_BASE_URL.replace(/\/$/, "");
  const p = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}${p}`;
}

export function reelRowToPublic(row: ReelRow, likedByMe: boolean): ReelPublic {
  return {
    id: row.id,
    userId: row.userId,
    videoUrl: absoluteMediaUrl(row.videoUrl),
    thumbnailUrl: absoluteMediaUrl(row.thumbnailUrl),
    caption: row.caption,
    likesCount: row.likesCount,
    commentsCount: row.commentsCount,
    viewsCount: row.viewsCount,
    likedByMe,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    postId: row.postId ?? row.id,
  };
}

export function reelToClientPost(row: ReelRow, likedByMe: boolean): Post {
  return {
    id: row.postId ?? row.id,
    userId: row.userId,
    type: "reel",
    text: row.caption,
    image: row.thumbnailUrl || "🎬",
    video: row.videoUrl,
    likes: likedByMe ? ["__me__"] : [],
    reposts: [],
    comments: [],
    createdAt: Date.parse(row.createdAt) || Date.now(),
  };
}

/** استيراد ريلز قديمة من posts.json (مرة واحدة، idempotent) */
export async function migratePostsToReelsStore(): Promise<{ imported: number }> {
  const posts = await listPosts();
  let imported = 0;
  for (const p of posts) {
    if (!p || typeof p !== "object") continue;
    if (p.type !== "reel" || !p.video) continue;
    const existing = await getReelById(p.id);
    if (existing) continue;
    await createReel({
      id: p.id,
      userId: p.userId,
      videoUrl: p.video,
      thumbnailUrl: p.image && p.image !== "🎬" ? p.image : "",
      caption: p.text ?? "",
      likesCount: (p.likes ?? []).length,
      commentsCount: (p.comments ?? []).length,
      viewsCount: 0,
      postId: p.id,
    });
    imported += 1;
  }
  if (imported > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reels] migrated ${imported} reel(s) from posts.json`);
  }
  return { imported };
}

export async function syncReelPostMirror(row: ReelRow): Promise<void> {
  const post: Post = {
    id: row.postId ?? row.id,
    userId: row.userId,
    type: "reel",
    text: row.caption,
    image: row.thumbnailUrl || "🎬",
    video: row.videoUrl,
    likes: [],
    reposts: [],
    comments: [],
    createdAt: Date.parse(row.createdAt) || Date.now(),
  };
  await upsertPostOnServer(row.userId, post);
}

export async function deleteReelFiles(row: ReelRow): Promise<void> {
  const tryUnlink = async (rel: string) => {
    if (!rel || rel.startsWith("http")) return;
    const abs = rel.startsWith("/")
      ? path.join(DATA_ROOT, rel.replace(/^\//, "").replace(/^uploads\//, "uploads/"))
      : path.join(DATA_ROOT, rel);
    const normalized = path.normalize(abs);
    if (!normalized.startsWith(path.normalize(DATA_ROOT))) return;
    await fs.unlink(normalized).catch(() => undefined);
  };
  await tryUnlink(row.videoUrl);
  await tryUnlink(row.thumbnailUrl);
  /** ملفات قديمة تحت /media/ */
  if (row.videoUrl.startsWith("/media/")) {
    await tryUnlink(row.videoUrl);
  }
}

export async function buildReelsFeedForViewer(
  viewerId: string,
  opts: { limit?: number; cursor?: string; followingOnly?: boolean },
): Promise<{
  reels: ReelPublic[];
  users: User[];
  hasMore: boolean;
  nextCursor?: string;
}> {
  const limit = Math.min(30, Math.max(1, opts.limit ?? 15));
  let userIds: Set<string> | undefined;
  if (opts.followingOnly) {
    const users = await listUsers();
    const me = users.find(u => u.id === viewerId);
    const following = new Set(me ? await resolveFollowingIds(viewerId) : []);
    following.add(viewerId);
    userIds = following;
  }

  const { listReelsPaginated } = await import("../db/reels.js");
  const { rows, hasMore, nextCursor } = await listReelsPaginated({
    limit,
    before: opts.cursor,
    userIds,
  });

  const likedFlags = await Promise.all(rows.map(r => userLikedReel(r.id, viewerId)));

  const reels = rows.map((r, i) => reelRowToPublic(r, likedFlags[i] ?? false));
  const authorIds = new Set(reels.map(r => r.userId));
  const allUsers = await listUsers();
  const users = allUsers
    .filter(u => authorIds.has(u.id))
    .map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio,
      verified: u.verified,
      isPrivate: u.isPrivate,
      followers: [],
      following: [],
      blocked: [],
      password: "",
    })) as User[];

  return {
    reels,
    users,
    hasMore,
    nextCursor,
  };
}

async function resolveFollowingIds(viewerId: string): Promise<string[]> {
  const { listFollows, getSnapshot } = await import("../db/engine.js");
  const fromDb = (await listFollows())
    .filter(f => f.followerId === viewerId)
    .map(f => f.followeeId);
  if (fromDb.length > 0) return fromDb;
  const snap = (await getSnapshot(viewerId)) as { users?: User[] } | null;
  const me = snap?.users?.find(u => u.id === viewerId);
  return me?.following ?? [];
}

export function postRowLooksLikeReel(p: PostRow): boolean {
  return p.type === "reel" || !!p.video;
}

export { isVisibleReelRow } from "../db/reels.js";
