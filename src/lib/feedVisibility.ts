import type { AppState, ID, Post, User } from "./types";

/** يُطلق بعد تسجيل الدخول/التسجيل لسحب أحدث المنشورات من الخادم */
export const AUTH_FEED_REFRESH_EVENT = "retweet-auth-feed-refresh";

/** منشور جديد وصل فوراً (Socket/SSE) — الصفحة الرئيسية تتحدّث مباشرة */
export const NEW_FEED_POST_EVENT = "retweet-new-feed-post";

export function requestAuthFeedRefresh(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(AUTH_FEED_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}

export function notifyNewFeedPost(postId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(NEW_FEED_POST_EVENT, { detail: { postId } }));
  } catch {
    /* ignore */
  }
}

/** هل يرى المشاهد منشوراً في الخلاصة الرئيسية؟ */
export function canViewPostInHomeFeed(
  state: AppState,
  meId: ID,
  post: Post,
  me?: User | null,
): boolean {
  if (!post?.id) return false;
  const viewer = me ?? state.users.find(u => u.id === meId);
  if (!viewer) return false;
  const author = state.users.find(u => u.id === post.userId);
  if (!author) return true;
  const authorBlocked = author.blocked ?? [];
  const myBlocked = viewer.blocked ?? [];
  if (authorBlocked.includes(meId)) return false;
  if (myBlocked.includes(author.id)) return false;
  if (author.isPrivate !== true || post.userId === meId) return true;
  if ((author.followers ?? []).includes(meId)) return true;
  if ((viewer.following ?? []).includes(author.id)) return true;
  /** بيانات المتابعة لم تُحمَّل بعد — لا نخفي المنشور خطأً */
  if (!(author.followers?.length) && !(viewer.following?.length)) return true;
  return false;
}
