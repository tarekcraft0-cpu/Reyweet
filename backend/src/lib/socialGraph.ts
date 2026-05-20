import type { AppState } from "../../../src/lib/types.js";
import {
  getSnapshot,
  listFollowRequests,
  listFollows,
  setSnapshot,
} from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { broadcastSseToUser } from "./realtimeHub.js";
import { emitToUsers } from "./realtimeSocket.js";

export type SocialRelation = {
  isFollowing: boolean;
  isFollowedBy: boolean;
  pendingOut: boolean;
  pendingIn: boolean;
};

function stripPasswords(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

export async function getSocialRelation(viewerId: string, targetId: string): Promise<SocialRelation> {
  const follows = await listFollows();
  const reqs = await listFollowRequests();
  return {
    isFollowing: follows.some(f => f.followerId === viewerId && f.followeeId === targetId),
    isFollowedBy: follows.some(f => f.followerId === targetId && f.followeeId === viewerId),
    pendingOut: reqs.some(r => r.fromId === viewerId && r.toId === targetId),
    pendingIn: reqs.some(r => r.fromId === targetId && r.toId === viewerId),
  };
}

/** يحدّث snapshots/{userId}.json على D: من follows.json و follow_requests.json */
export async function persistSnapshotsForUsers(userIds: string[]): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const uid of ids) {
    let state = (await getSnapshot(uid)) as AppState | null;
    if (!state) state = await buildMinimalAppState(uid);
    state = await mergeDbUsersIntoAppState(state);
    state = await mergeSocialGraphIntoAppState(state);
    await setSnapshot(uid, stripPasswords({ ...state, currentUserId: uid }));
  }
}

/** إشعار فوري (SSE) + حفظ اللقطات للطرفين */
export async function broadcastSocialGraphPair(
  actorId: string,
  targetId: string,
  mode?: string,
): Promise<void> {
  await persistSnapshotsForUsers([actorId, targetId]);
  for (const viewerId of [actorId, targetId]) {
    const peerId = viewerId === actorId ? targetId : actorId;
    const relation = await getSocialRelation(viewerId, peerId);
    const payload = { peerId, relation, mode, fromUserId: actorId };
    broadcastSseToUser(viewerId, "social_graph_update", payload);
    emitToUsers([viewerId], "social_graph_update", payload);
  }
}
