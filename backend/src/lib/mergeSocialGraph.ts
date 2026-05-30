import type { AppState, StoryItem } from "../../../src/lib/types.js";
import { listFollowRequests, listFollows, listStories } from "../db/engine.js";

function isStoryActive(createdAt: number, now = Date.now(), expiryHours?: number): boolean {
  const hours = typeof expiryHours === "number" && [24, 48, 72].includes(expiryHours) ? expiryHours : 24;
  return createdAt > now - hours * 60 * 60 * 1000;
}

/** يدمج المتابعات وطلبات المتابعة والستوريات من القرص D في لقطة المستخدم */
export async function mergeSocialGraphIntoAppState(state: AppState): Promise<AppState> {
  const follows = await listFollows();
  const followingByUser = new Map<string, string[]>();
  const followersByUser = new Map<string, string[]>();
  for (const f of follows) {
    if (!followingByUser.has(f.followerId)) followingByUser.set(f.followerId, []);
    followingByUser.get(f.followerId)!.push(f.followeeId);
    if (!followersByUser.has(f.followeeId)) followersByUser.set(f.followeeId, []);
    followersByUser.get(f.followeeId)!.push(f.followerId);
  }

  const requests = await listFollowRequests();
  const requestOut = new Map<string, string[]>();
  const requestIn = new Map<string, string[]>();
  for (const r of requests) {
    if (!requestOut.has(r.fromId)) requestOut.set(r.fromId, []);
    if (!requestOut.get(r.fromId)!.includes(r.toId)) requestOut.get(r.fromId)!.push(r.toId);
    if (!requestIn.has(r.toId)) requestIn.set(r.toId, []);
    if (!requestIn.get(r.toId)!.includes(r.fromId)) requestIn.get(r.toId)!.push(r.fromId);
  }

  const dbStories = (await listStories()).filter(s => isStoryActive(s.createdAt, Date.now(), s.expiryHours));
  const storyById = new Map<string, StoryItem>();
  for (const s of state.stories || []) {
    if (isStoryActive(s.createdAt, Date.now(), s.expiryHours)) storyById.set(s.id, s);
  }
  for (const s of dbStories) {
    const item = s as StoryItem;
    const prev = storyById.get(item.id);
    if (!prev || item.createdAt >= prev.createdAt) storyById.set(item.id, item);
  }

  let users = (state.users || []).map(u => ({
    ...u,
    following: [...new Set(followingByUser.get(u.id) || [])],
    followers: [...new Set(followersByUser.get(u.id) || [])],
    followRequestOut: [...new Set(requestOut.get(u.id) || [])],
    followRequestIn: [...new Set(requestIn.get(u.id) || [])],
  }));

  users = applyBlockedSocialFilters(users);

  return {
    ...state,
    users,
    stories: [...storyById.values()].sort((a, b) => b.createdAt - a.createdAt),
  };
}

/** يزيل أي متابعة أو طلب بين محظور ومحظور — الحظر لا يُلغى المتابعة تلقائياً عند فك الحظر */
function applyBlockedSocialFilters(
  users: AppState["users"],
): AppState["users"] {
  const byId = new Map(users.map(u => [u.id, { ...u }]));
  for (const u of users) {
    const blocked = u.blocked || [];
    for (const bid of blocked) {
      const me = byId.get(u.id);
      const other = byId.get(bid);
      if (!me) continue;
      me.following = (me.following || []).filter(id => id !== bid);
      me.followers = (me.followers || []).filter(id => id !== bid);
      me.followRequestOut = (me.followRequestOut || []).filter(id => id !== bid);
      me.followRequestIn = (me.followRequestIn || []).filter(id => id !== bid);
      if (other) {
        other.following = (other.following || []).filter(id => id !== u.id);
        other.followers = (other.followers || []).filter(id => id !== u.id);
        other.followRequestOut = (other.followRequestOut || []).filter(id => id !== u.id);
        other.followRequestIn = (other.followRequestIn || []).filter(id => id !== u.id);
      }
    }
  }
  return [...byId.values()];
}
