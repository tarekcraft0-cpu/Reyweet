import type { Comment, Post } from "./types";
import { apiBackendEnabled, apiFetch, ensureApiRuntimeConfig, getApiToken } from "./apiBackend";
import { resolveMediaUrl } from "./mediaUrl";

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

export type ReelsFeedResponse = {
  reels: ReelPublic[];
  users: Array<{
    id: string;
    username: string;
    avatar: string;
    bio?: string;
    verified?: boolean;
    isPrivate?: boolean;
  }>;
  hasMore: boolean;
  nextCursor?: string;
};

export type ReelMeta = {
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  likedByMe: boolean;
};

export function reelsApiEnabled(): boolean {
  return apiBackendEnabled() && !!getApiToken();
}

export function reelPublicToPost(reel: ReelPublic, meId: string): Post {
  return {
    id: reel.postId || reel.id,
    userId: reel.userId,
    type: "reel",
    text: reel.caption,
    image: reel.thumbnailUrl || "🎬",
    video: reel.videoUrl,
    likes: reel.likedByMe ? [meId] : [],
    reposts: [],
    comments: [],
    createdAt: Date.parse(reel.createdAt) || Date.now(),
  };
}

export function reelMetaFromPublic(reel: ReelPublic): ReelMeta {
  return {
    likesCount: reel.likesCount,
    commentsCount: reel.commentsCount,
    viewsCount: reel.viewsCount,
    likedByMe: reel.likedByMe,
  };
}

export async function apiFetchReelsFeed(opts?: {
  limit?: number;
  cursor?: string;
  scope?: "all" | "friends";
}): Promise<{ ok: true; data: ReelsFeedResponse } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "غير مسجّل" };
  await ensureApiRuntimeConfig();
  const qs = new URLSearchParams();
  qs.set("limit", String(opts?.limit ?? 15));
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  if (opts?.scope === "friends") qs.set("scope", "friends");
  const res = await apiFetch(`/v1/reels?${qs}`, { method: "GET", token });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: err.error || `HTTP ${res.status}` };
  }
  const data = (await res.json()) as ReelsFeedResponse;
  return { ok: true, data };
}

export async function apiUploadReel(
  file: File,
  caption: string,
): Promise<{ ok: true; reel: ReelPublic } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "غير مسجّل" };
  await ensureApiRuntimeConfig();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("caption", caption);
  const res = await apiFetch("/v1/reels/upload", {
    method: "POST",
    token,
    body: fd,
    timeoutMs: 600_000,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: err.error || `HTTP ${res.status}` };
  }
  const json = (await res.json()) as { reel: ReelPublic };
  return { ok: true, reel: json.reel };
}

export async function apiRecordReelView(
  reelId: string,
): Promise<{ ok: boolean; viewsCount?: number }> {
  const token = getApiToken();
  if (!token) return { ok: false };
  const res = await apiFetch(`/v1/reels/${encodeURIComponent(reelId)}/view`, {
    method: "POST",
    token,
  });
  if (!res.ok) return { ok: false };
  const json = (await res.json()) as { viewsCount: number };
  return { ok: true, viewsCount: json.viewsCount };
}

export async function apiToggleReelLike(
  reelId: string,
): Promise<{ ok: true; liked: boolean; likesCount: number } | { ok: false }> {
  const token = getApiToken();
  if (!token) return { ok: false };
  const res = await apiFetch(`/v1/reels/${encodeURIComponent(reelId)}/like`, {
    method: "POST",
    token,
  });
  if (!res.ok) return { ok: false };
  const json = (await res.json()) as { liked: boolean; likesCount: number };
  return { ok: true, liked: json.liked, likesCount: json.likesCount };
}

export async function apiAddReelComment(
  reelId: string,
  text: string,
): Promise<
  | { ok: true; comment: Comment; commentsCount: number }
  | { ok: false; error: string }
> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch(`/v1/reels/${encodeURIComponent(reelId)}/comment`, {
    method: "POST",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: err.error || `HTTP ${res.status}` };
  }
  const json = (await res.json()) as {
    comment: Comment & { username?: string; avatar?: string };
    commentsCount: number;
  };
  return { ok: true, comment: json.comment, commentsCount: json.commentsCount };
}

export async function apiFetchReelComments(
  reelId: string,
  opts?: { limit?: number; cursor?: string },
): Promise<
  | {
      ok: true;
      comments: Comment[];
      hasMore: boolean;
      nextCursor?: string;
    }
  | { ok: false; error: string }
> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "غير مسجّل" };
  const qs = new URLSearchParams();
  qs.set("limit", String(opts?.limit ?? 30));
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  const res = await apiFetch(
    `/v1/reels/${encodeURIComponent(reelId)}/comments?${qs}`,
    { method: "GET", token },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: err.error || `HTTP ${res.status}` };
  }
  const json = (await res.json()) as {
    comments: Comment[];
    hasMore: boolean;
    nextCursor?: string;
  };
  return { ok: true, ...json };
}

/** يحوّل روابط الريلز المطلقة إلى مسارات قابلة للعرض عبر resolveMediaUrl */
export async function apiDeleteReel(
  reelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch(`/v1/reels/${encodeURIComponent(reelId)}`, {
    method: "DELETE",
    token,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: err.error || `HTTP ${res.status}` };
  }
  return { ok: true };
}

export function normalizeReelMediaUrls(reel: ReelPublic): ReelPublic {
  return {
    ...reel,
    videoUrl: resolveMediaUrl(reel.videoUrl) || reel.videoUrl,
    thumbnailUrl: resolveMediaUrl(reel.thumbnailUrl) || reel.thumbnailUrl,
  };
}
