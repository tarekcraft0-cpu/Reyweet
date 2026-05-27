import type { AppState, ID, StoryItem } from "./types";
import { storiesForUser, userById, visibleStoryUserIds } from "./store";

/** هل للمشاهد ستوريات غير مشاهَدة عند هذا الحساب؟ */
export function authorHasUnseenStories(
  state: AppState,
  viewerId: ID,
  authorId: ID,
): boolean {
  const stories = storiesForUser(state, authorId, viewerId);
  if (stories.length === 0) return false;
  return stories.some(s => !storyViewedBy(s, viewerId));
}

export function storyViewedBy(story: StoryItem, viewerId: ID): boolean {
  return (story.viewedByUserIds || []).includes(viewerId);
}

/** أول شريحة غير مشاهَدة (للاستئناف مثل Instagram) */
export function firstUnseenStoryIndex(
  stories: StoryItem[],
  viewerId: ID,
): number {
  const i = stories.findIndex(s => !storyViewedBy(s, viewerId));
  return i >= 0 ? i : 0;
}

/** ترتيب شريط الستوري: غير المشاهَدين أولاً ثم المشاهَدين (الأحدث داخل كل مجموعة) */
export function orderStoryTrayUserIds(
  state: AppState,
  viewerId: ID,
  userIds: ID[],
): ID[] {
  const latest = new Map<ID, number>();
  for (const s of state.stories) {
    if (!userIds.includes(s.userId)) continue;
    latest.set(s.userId, Math.max(latest.get(s.userId) ?? 0, s.createdAt));
  }
  const unseen: ID[] = [];
  const seen: ID[] = [];
  for (const id of userIds) {
    if (authorHasUnseenStories(state, viewerId, id)) unseen.push(id);
    else seen.push(id);
  }
  const byLatest = (a: ID, b: ID) => (latest.get(b) ?? 0) - (latest.get(a) ?? 0);
  unseen.sort(byLatest);
  seen.sort(byLatest);
  return [...unseen, ...seen];
}

/** حلقة العارض الكاملة (أنا + الأصدقاء) */
export function storyViewerTrayRing(state: AppState, viewerId: ID): ID[] {
  const friends = visibleStoryUserIds(state, viewerId).filter(id => id !== viewerId);
  const me = userById(state, viewerId);
  const hasMe = storiesForUser(state, viewerId, viewerId).length > 0;
  const orderedFriends = orderStoryTrayUserIds(state, viewerId, friends);
  if (hasMe && me) return [viewerId, ...orderedFriends];
  return orderedFriends;
}

export function nextAuthorInTray(ring: ID[], current: ID): ID | null {
  const i = ring.indexOf(current);
  if (i < 0 || i >= ring.length - 1) return null;
  return ring[i + 1] ?? null;
}

export function prevAuthorInTray(ring: ID[], current: ID): ID | null {
  const i = ring.indexOf(current);
  if (i <= 0) return null;
  return ring[i - 1] ?? null;
}

/** وقت مشاهدة للعرض في قائمة المشاهدين */
export function storyViewerSeenAt(
  story: StoryItem,
  viewerId: ID,
): number | undefined {
  return story.viewedAtByUserIds?.[viewerId];
}

export function formatStoryViewTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "الآن";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} س`;
  return new Date(ts).toLocaleDateString("ar", { day: "numeric", month: "short" });
}
