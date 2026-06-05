import { listFollows } from "../db/engine.js";

export type SocialLists = {
  followers: string[];
  following: string[];
};

let cache: { at: number; byFollower: Map<string, string[]>; byFollowee: Map<string, string[]> } | null =
  null;
const CACHE_MS = 5_000;

async function graphMaps() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return { byFollower: cache.byFollower, byFollowee: cache.byFollowee };
  }
  const follows = await listFollows();
  const byFollower = new Map<string, string[]>();
  const byFollowee = new Map<string, string[]>();
  for (const f of follows) {
    if (!byFollower.has(f.followerId)) byFollower.set(f.followerId, []);
    byFollower.get(f.followerId)!.push(f.followeeId);
    if (!byFollowee.has(f.followeeId)) byFollowee.set(f.followeeId, []);
    byFollowee.get(f.followeeId)!.push(f.followerId);
  }
  cache = { at: now, byFollower, byFollowee };
  return { byFollower, byFollowee };
}

export async function socialListsForUser(userId: string): Promise<SocialLists> {
  const { byFollower, byFollowee } = await graphMaps();
  return {
    followers: [...new Set(byFollowee.get(userId) || [])],
    following: [...new Set(byFollower.get(userId) || [])],
  };
}

export function invalidateSocialGraphCache(): void {
  cache = null;
}

/** أعداد المتابعين/المتابَعين دفعة واحدة — أسرع من استدعاء socialListsForUser لكل مستخدم */
export async function socialCountsBatch(
  userIds: string[],
): Promise<Map<string, { followerCount: number; followingCount: number }>> {
  const { byFollower, byFollowee } = await graphMaps();
  const out = new Map<string, { followerCount: number; followingCount: number }>();
  for (const id of userIds) {
    out.set(id, {
      followerCount: new Set(byFollowee.get(id) || []).size,
      followingCount: new Set(byFollower.get(id) || []).size,
    });
  }
  return out;
}
