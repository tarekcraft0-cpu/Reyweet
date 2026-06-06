import type { AppState, ID, Post, User } from "./types";
import { normalizePostsTimestamps } from "./coerceTimestamp";
import { canViewPostInHomeFeed } from "./feedVisibility";
import { isReelFeedPost } from "./postMedia";

/** بناء Sets للبحث O(1) بدل includes المتكرر */
function buildViewerSets(me: User) {
  return {
    blocked: new Set(me.blocked ?? []),
    following: new Set(me.following ?? []),
  };
}

function authorVisibleToViewer(
  author: User | undefined,
  meId: ID,
  meSets: ReturnType<typeof buildViewerSets>,
): boolean {
  if (!author) return true;
  if ((author.blocked ?? []).includes(meId)) return false;
  if (meSets.blocked.has(author.id)) return false;
  if (author.isPrivate !== true || author.id === meId) return true;
  if ((author.followers ?? []).includes(meId)) return true;
  if (meSets.following.has(author.id)) return true;
  if (!(author.followers?.length) && !(meSets.following.size)) return true;
  return false;
}

function postVisibleInHomeFeed(
  state: AppState,
  meId: ID,
  viewer: User,
  p: Post,
  meSets: ReturnType<typeof buildViewerSets>,
  usersById: Map<ID, User>,
  bannedUserIds?: ReadonlySet<ID>,
): boolean {
  if (!p?.id || isReelFeedPost(p)) return false;
  if (bannedUserIds?.size && p.userId && bannedUserIds.has(p.userId)) return false;
  const author = usersById.get(p.userId);
  if (!authorVisibleToViewer(author, meId, meSets)) return false;
  if (!canViewPostInHomeFeed(state, meId, p, viewer)) return false;
  return true;
}

/**
 * حساب خلاصة الرئيسية من كل المنشورات المحلية (احتياطي قبل أول سحب من الخادم).
 */
export function computeHomeFeedPostIds(
  state: AppState,
  meId: ID,
  me?: User | null,
  bannedUserIds?: ReadonlySet<ID>,
): Post[] {
  const viewer = me ?? state.users.find(u => u.id === meId);
  if (!viewer) return [];
  const meSets = buildViewerSets(viewer);
  const usersById = new Map(state.users.map(u => [u.id, u]));
  const seen = new Set<string>();
  const out: Post[] = [];

  for (const p of state.posts ?? []) {
    if (!p?.id || seen.has(p.id)) continue;
    if (!postVisibleInHomeFeed(state, meId, viewer, p, meSets, usersById, bannedUserIds)) continue;
    seen.add(p.id);
    out.push(p);
  }

  out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return out;
}

/** دمج صفحات فيد الخادم (تحميل المزيد) */
export function mergeServerHomeFeedPosts(existing: Post[], page: Post[]): Post[] {
  if (!page.length) return existing;
  const pageNorm = normalizePostsTimestamps(page);
  const byId = new Map(existing.map(p => [p.id, p]));
  for (const p of pageNorm) {
    if (p?.id) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * عرض الرئيسية: ترتيب الخادم أولاً (كل المنشورات العامة + الجديدة)،
 * ثم أي منشور محلي أحدث من رأس الفيد ولم يصل بعد في الاستجابة.
 */
export function buildHomeFeedDisplayPosts(
  state: AppState,
  meId: ID,
  serverOrdered: Post[],
  me?: User | null,
  bannedUserIds?: ReadonlySet<ID>,
): Post[] {
  const viewer = me ?? state.users.find(u => u.id === meId);
  if (!viewer) return [];
  if (!serverOrdered.length) return computeHomeFeedPostIds(state, meId, viewer, bannedUserIds);

  const meSets = buildViewerSets(viewer);
  const usersById = new Map(state.users.map(u => [u.id, u]));
  const seen = new Set<string>();
  const out: Post[] = [];

  for (const p of serverOrdered) {
    if (!p?.id || seen.has(p.id)) continue;
    if (!postVisibleInHomeFeed(state, meId, viewer, p, meSets, usersById, bannedUserIds)) continue;
    seen.add(p.id);
    out.push(p);
  }

  const headAt = out[0]?.createdAt ?? 0;
  for (const p of state.posts ?? []) {
    if (!p?.id || seen.has(p.id)) continue;
    if (p.userId !== meId) continue;
    if ((p.createdAt ?? 0) < headAt) continue;
    if (!postVisibleInHomeFeed(state, meId, viewer, p, meSets, usersById, bannedUserIds)) continue;
    seen.add(p.id);
    out.push(p);
  }

  out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return out;
}

export function homeFeedSignature(posts: Post[]): string {
  if (!posts.length) return "0";
  const head = posts[0]?.id ?? "";
  const tail = posts[posts.length - 1]?.id ?? "";
  return `${posts.length}:${head}:${tail}:${posts[0]?.createdAt ?? 0}`;
}
