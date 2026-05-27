import type { AppState, ID, StoryItem, User } from "./types";

function userInState(state: AppState, id: ID): User | undefined {
  return state.users?.find(u => u.id === id);
}

export type StoryVisibilityGetUser = (state: AppState, id: ID) => User | undefined;

function resolveUser(
  state: AppState,
  id: ID,
  getUser?: StoryVisibilityGetUser,
): User | undefined {
  return (getUser ?? userInState)(state, id);
}

export function isStoryActiveForVisibility(story: StoryItem, now = Date.now()): boolean {
  const hours =
    typeof story.expiryHours === "number" && [24, 48, 72].includes(story.expiryHours)
      ? story.expiryHours
      : 24;
  return story.createdAt + hours * 60 * 60 * 1000 > now;
}

/** حساب خاص: المشاهد في followers أو يتابعه (me.following) */
export function viewerCanSeePrivateAuthorContent(
  state: AppState,
  viewerId: ID | null,
  authorId: ID,
  getUser?: StoryVisibilityGetUser,
): boolean {
  if (!viewerId) return false;
  const viewer = resolveUser(state, viewerId, getUser);
  const author = resolveUser(state, authorId, getUser);
  if (!viewer || !author) {
    if (!viewer) return false;
    return viewer.following.includes(authorId);
  }
  if (!author.isPrivate) return true;
  if (viewerId === authorId) return true;
  return author.followers.includes(viewerId) || viewer.following.includes(authorId);
}

/** ستوريات نشطة يراها المشاهد — للشريط والبروفايل */
export function storiesVisibleToViewer(
  state: AppState,
  viewerId: ID,
  getUser?: StoryVisibilityGetUser,
): StoryItem[] {
  const me = resolveUser(state, viewerId, getUser);
  if (!me) {
    return (state.stories || []).filter(s => s.userId === viewerId && isStoryActiveForVisibility(s));
  }
  return (state.stories || [])
    .filter(s => isStoryActiveForVisibility(s))
    .filter(s => {
      const author = resolveUser(state, s.userId, getUser);
      if (!author) {
        if (s.userId === viewerId) return true;
        return me.following.includes(s.userId);
      }
      const audienceOk =
        s.audience === "all" || s.userId === viewerId || author.closeFriends.includes(viewerId);
      if (!audienceOk) return false;
      if (s.userId === viewerId) return true;
      if (author.blocked.includes(viewerId) || me.blocked.includes(s.userId)) return false;
      if (author.isPrivate && !viewerCanSeePrivateAuthorContent(state, viewerId, s.userId, getUser)) {
        return false;
      }
      return true;
    });
}

/** للحفظ في snapshot — ستوريات الحساب نفسه فقط */
export function storiesOwnedByUser(state: AppState, ownerId: ID): StoryItem[] {
  return (state.stories || []).filter(s => s.userId === ownerId);
}
