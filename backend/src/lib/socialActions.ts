import { randomUUID } from "node:crypto";
import type { AppState, Notification } from "../../../src/lib/types.js";
import {
  getSnapshot,
  getUserById,
  listFollowRequests,
  listFollows,
  replaceFollowRequests,
  replaceFollows,
  setSnapshot,
  type FollowRequestRow,
  type FollowRow,
} from "../db/engine.js";
import { buildMinimalAppState } from "./syncAppState.js";
import { mergeDbUsersIntoAppState } from "./mergeDbUsers.js";
import { mergeSocialGraphIntoAppState } from "./mergeSocialGraph.js";
import { broadcastSseToUser } from "./realtimeHub.js";
import {
  broadcastSocialGraphPair,
  getSocialRelation,
  type SocialRelation,
} from "./socialGraph.js";

export type { SocialRelation };

function stripPasswords(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

async function loadUserState(userId: string): Promise<AppState> {
  let state = (await getSnapshot(userId)) as AppState | null;
  if (!state) state = await buildMinimalAppState(userId);
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state.currentUserId = userId;
  return state;
}

async function saveUserState(userId: string, state: AppState): Promise<void> {
  await setSnapshot(userId, stripPasswords({ ...state, currentUserId: userId }));
}

async function deliverNotification(
  recipientId: string,
  notif: Omit<Notification, "id" | "createdAt" | "read">,
): Promise<Notification | null> {
  try {
    const row: Notification = {
      id: randomUUID(),
      createdAt: Date.now(),
      read: false,
      ...notif,
    };
    const state = await loadUserState(recipientId);
    const exists = (state.notifications || []).some(
      n =>
        n.type === row.type &&
        n.fromId === row.fromId &&
        n.userId === row.userId &&
        Date.now() - n.createdAt < 60_000,
    );
    if (!exists) {
      state.notifications = [row, ...(state.notifications || [])].slice(0, 200);
      await saveUserState(recipientId, state);
    }
    broadcastSseToUser(recipientId, "social_update", { notification: row });
    return row;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[social] deliverNotification failed", e);
    return null;
  }
}

function removeRequestPair(rows: FollowRequestRow[], a: string, b: string): FollowRequestRow[] {
  return rows.filter(r => !((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)));
}

export async function syncFollowsForOwner(ownerUserId: string, followingIds: string[]): Promise<void> {
  const existing = await listFollows();
  const rest = existing.filter(f => f.followerId !== ownerUserId);
  const now = new Date().toISOString();
  const mine: FollowRow[] = [...new Set(followingIds)].map(followeeId => ({
    followerId: ownerUserId,
    followeeId,
    createdAt: now,
  }));
  await replaceFollows([...rest, ...mine]);
}

export async function syncFollowRequestsForOwner(ownerUserId: string, state: AppState): Promise<void> {
  const owner = (state.users || []).find(u => u.id === ownerUserId);
  const existing = await listFollowRequests();
  const rest = existing.filter(r => r.fromId !== ownerUserId && r.toId !== ownerUserId);
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const mine: FollowRequestRow[] = [];
  for (const toId of owner?.followRequestOut || []) {
    const key = `${ownerUserId}\t${toId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mine.push({ fromId: ownerUserId, toId, createdAt: now });
  }
  for (const fromId of owner?.followRequestIn || []) {
    const key = `${fromId}\t${ownerUserId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mine.push({ fromId, toId: ownerUserId, createdAt: now });
  }
  await replaceFollowRequests([...rest, ...mine]);
}

export async function addFollow(
  followerId: string,
  targetId: string,
  opts?: { notify?: boolean },
): Promise<void> {
  if (followerId === targetId) return;
  const follows = await listFollows();
  if (!follows.some(f => f.followerId === followerId && f.followeeId === targetId)) {
    const now = new Date().toISOString();
    await replaceFollows([
      ...follows,
      { followerId, followeeId: targetId, createdAt: now },
    ]);
  }
  let reqs = await listFollowRequests();
  reqs = removeRequestPair(reqs, followerId, targetId);
  await replaceFollowRequests(reqs);

  if (opts?.notify !== false) {
    const follower = await getUserById(followerId);
    await deliverNotification(targetId, {
      userId: targetId,
      fromId: followerId,
      type: "follow",
      text: `@${follower?.username || "user"} بدأ بمتابعتك`,
    });
  }
  await broadcastSocialGraphPair(followerId, targetId, "following");
}

export async function removeFollowEdge(followerId: string, targetId: string): Promise<void> {
  const follows = await listFollows();
  const next = follows.filter(f => !(f.followerId === followerId && f.followeeId === targetId));
  if (next.length !== follows.length) await replaceFollows(next);
  let reqs = await listFollowRequests();
  reqs = removeRequestPair(reqs, followerId, targetId);
  await replaceFollowRequests(reqs);
  await broadcastSocialGraphPair(followerId, targetId, "unfollowed");
}

export async function sendFollowRequest(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return;
  let reqs = await listFollowRequests();
  if (!reqs.some(r => r.fromId === fromId && r.toId === toId)) {
    const now = new Date().toISOString();
    reqs = [...reqs, { fromId, toId, createdAt: now }];
    await replaceFollowRequests(reqs);
  }
  const sender = await getUserById(fromId);
  await deliverNotification(toId, {
    userId: toId,
    fromId,
    type: "friend_request",
    text: `@${sender?.username || "user"} أرسل لك طلب متابعة`,
    followRequestStatus: "pending",
  });
  await broadcastSocialGraphPair(fromId, toId, "requested");
}

export async function cancelFollowRequest(fromId: string, toId: string): Promise<void> {
  let reqs = await listFollowRequests();
  reqs = removeRequestPair(reqs, fromId, toId);
  await replaceFollowRequests(reqs);
  await broadcastSocialGraphPair(fromId, toId, "request_cancelled");
}

export async function acceptFollowRequest(accepterId: string, fromId: string): Promise<void> {
  if (fromId === accepterId) return;
  const target = await getUserById(accepterId);
  if (!target) throw new Error("الحساب غير موجود");
  const follower = await getUserById(fromId);
  if (!follower) throw new Error("طالب المتابعة غير موجود");

  let reqs = await listFollowRequests();
  reqs = removeRequestPair(reqs, fromId, accepterId);
  await replaceFollowRequests(reqs);

  const follows = await listFollows();
  const already = follows.some(f => f.followerId === fromId && f.followeeId === accepterId);
  if (!already) {
    await addFollow(fromId, accepterId, { notify: false });
  }

  try {
    const state = await loadUserState(accepterId);
    state.notifications = (state.notifications || []).map(n =>
      n.userId === accepterId && n.fromId === fromId && n.type === "friend_request"
        ? {
            ...n,
            read: true,
            followRequestStatus: "accepted" as const,
            text: "لقد قبلت طلب المتابعة من هذا الحساب ✓",
          }
        : n,
    );
    await saveUserState(accepterId, state);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[social] patch accept notification failed", e);
  }

  const accepter = await getUserById(accepterId);
  await deliverNotification(fromId, {
    userId: fromId,
    fromId: accepterId,
    type: "follow",
    text: `@${accepter?.username || "user"} قبل طلب المتابعة`,
  });
}

export async function declineFollowRequest(accepterId: string, fromId: string): Promise<void> {
  let reqs = await listFollowRequests();
  reqs = removeRequestPair(reqs, fromId, accepterId);
  await replaceFollowRequests(reqs);

  try {
    const state = await loadUserState(accepterId);
    state.notifications = (state.notifications || []).map(n =>
      n.userId === accepterId && n.fromId === fromId && n.type === "friend_request"
        ? {
            ...n,
            read: true,
            followRequestStatus: "declined" as const,
            text: "لقد رفضت طلب المتابعة من هذا الحساب",
          }
        : n,
    );
    await saveUserState(accepterId, state);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[social] patch decline notification failed", e);
  }

  await broadcastSocialGraphPair(fromId, accepterId, "declined");
}

export type FollowToggleResult = {
  ok: true;
  mode: "following" | "unfollowed" | "requested" | "request_cancelled";
  relation: SocialRelation;
};

export async function toggleFollowOnServer(
  actorId: string,
  targetId: string,
): Promise<FollowToggleResult> {
  const target = await getUserById(targetId);
  if (!target) throw new Error("المستخدم غير موجود");

  const follows = await listFollows();
  const isFollowing = follows.some(f => f.followerId === actorId && f.followeeId === targetId);

  if (isFollowing) {
    await removeFollowEdge(actorId, targetId);
    return { ok: true, mode: "unfollowed", relation: await getSocialRelation(actorId, targetId) };
  }

  const reqs = await listFollowRequests();
  const pendingOut = reqs.some(r => r.fromId === actorId && r.toId === targetId);
  if (pendingOut) {
    await cancelFollowRequest(actorId, targetId);
    return {
      ok: true,
      mode: "request_cancelled",
      relation: await getSocialRelation(actorId, targetId),
    };
  }

  if (target.isPrivate) {
    await sendFollowRequest(actorId, targetId);
    return { ok: true, mode: "requested", relation: await getSocialRelation(actorId, targetId) };
  }

  await addFollow(actorId, targetId);
  return { ok: true, mode: "following", relation: await getSocialRelation(actorId, targetId) };
}
