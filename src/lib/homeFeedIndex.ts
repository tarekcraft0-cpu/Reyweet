import type { AppState, ID, Post, User } from "./types";
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

/**
 * حساب IDs خلاصة الرئيسية — O(n log n) sort فقط، بدون allocations زائدة.
 * يُستدعى من store (idle) أو worker.
 */
export function computeHomeFeedPostIds(state: AppState, meId: ID, me?: User | null): Post[] {
  const viewer = me ?? state.users.find(u => u.id === meId);
  if (!viewer) return [];
  const meSets = buildViewerSets(viewer);
  const usersById = new Map(state.users.map(u => [u.id, u]));
  const seen = new Set<string>();
  const out: Post[] = [];

  for (const p of state.posts ?? []) {
    if (!p?.id || seen.has(p.id) || isReelFeedPost(p)) continue;
    const author = usersById.get(p.userId);
    if (!authorVisibleToViewer(author, meId, meSets)) continue;
    if (!canViewPostInHomeFeed(state, meId, p, viewer)) continue;
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
