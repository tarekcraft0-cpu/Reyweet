import type { AppState, User } from "./types";

/** مستخدم محلي للتصفّح بدون تسجيل — لا يُرفع للخادم ولا يُحفظ في localStorage كحساب نشط */
export const GUEST_LOCAL_USER_ID = "__retweet_guest_local__";

export function isGuestUserId(id: string | null | undefined): boolean {
  return id === GUEST_LOCAL_USER_ID;
}

export function mkGuestUser(): User {
  return {
    id: GUEST_LOCAL_USER_ID,
    username: "زائر",
    email: "",
    password: "",
    bio: "",
    avatar: "👀",
    isPrivate: false,
    verified: false,
    followers: [],
    following: [],
    highlights: [],
    blocked: [],
    closeFriends: [],
    favorites: [],
    followRequestIn: [],
    followRequestOut: [],
    isGuest: true,
  };
}

/** يمنع حفظ جلسة الزائر كمستخدم مسجّل في التخزين المحلي */
export function stripGuestFromPersistedState(s: AppState): AppState {
  if (!isGuestUserId(s.currentUserId)) return s;
  return {
    ...s,
    currentUserId: null,
    accountIds: s.accountIds.filter((id) => !isGuestUserId(id)),
    users: s.users.filter((u) => !isGuestUserId(u.id)),
  };
}
