import type { Post } from "./types";

/** يحوّل createdAt من رقم/نص ISO/ثوانٍ إلى milliseconds — بدون استبدال بـ Date.now() */
export function coerceTimestamp(raw: unknown, fallback = 0): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    if (raw < 1_000_000_000_000) return Math.round(raw * 1000);
    return Math.round(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Date.parse(raw.trim());
    if (Number.isFinite(n) && n > 0) return n;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 1_000_000_000_000 ? Math.round(asNum * 1000) : Math.round(asNum);
    }
  }
  return fallback;
}

export function normalizePostTimestamps<T extends Post>(post: T): T {
  const prevAt = typeof post.createdAt === "number" ? post.createdAt : 0;
  return {
    ...post,
    createdAt: coerceTimestamp(post.createdAt, prevAt),
    comments: (post.comments || []).map(c => ({
      ...c,
      createdAt: coerceTimestamp(c.createdAt, typeof c.createdAt === "number" ? c.createdAt : 0),
    })),
  };
}

export function normalizePostsTimestamps(posts: Post[]): Post[] {
  return posts.map(normalizePostTimestamps);
}
