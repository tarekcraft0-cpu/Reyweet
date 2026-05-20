import {
  canonicalOwnedProfileFields,
  getAccountSession,
  getLastActiveUserId,
  listAccountSessions,
} from "./accountSessions";
import { isGuestUserId } from "./guestUser";
import { mergeUserProfilePatch } from "./mergeUserSocial";
import type { AppState, ID, User } from "./types";

/** المعرّف النشط — currentUserId ثم آخر جلسة محفوظة */
export function resolveActiveViewerId(state: AppState): ID | null {
  const id = state.currentUserId;
  if (id && !isGuestUserId(id)) return id;
  const fallback = getLastActiveUserId();
  return fallback && !isGuestUserId(fallback) ? fallback : null;
}

/**
 * ملف مستخدم للعرض — للحسابات المسجّلة على الجهاز: جلسة الحساب ثم الكاش ثم state.
 * يمنع عرض أفاتار/يوزر حساب سابق على معرّف مختلف.
 */
export function resolveUserProfile(state: AppState, userId: ID): User | undefined {
  const base = state.users.find(u => u.id === userId);
  const canon = canonicalOwnedProfileFields(userId);
  const sess = getAccountSession(userId);

  if (!base && !canon && !sess) return undefined;

  const stub: User =
    base ??
    ({
      id: userId,
      username: sess?.username ?? canon?.username ?? "?",
      email: sess?.email ?? canon?.email ?? "",
      password: "",
      avatar: sess?.avatar ?? canon?.avatar ?? "?",
      following: [],
      followers: [],
      followRequestIn: [],
      followRequestOut: [],
      blocked: [],
      closeFriends: [],
      isPrivate: canon?.isPrivate ?? false,
    } as User);

  if (sess) {
    return mergeUserProfilePatch(stub, {
      id: userId,
      username: sess.username,
      email: sess.email,
      avatar: sess.avatar ?? stub.avatar,
      displayName: canon?.displayName ?? stub.displayName,
    });
  }
  if (canon) {
    return mergeUserProfilePatch(stub, canon);
  }
  return stub;
}

export function resolveActiveViewer(state: AppState): User | null {
  const id = resolveActiveViewerId(state);
  if (!id) return null;
  return resolveUserProfile(state, id) ?? null;
}

/** إعادة كتابة ملفات الحسابات المملوكة من الجلسة/الكاش فقط */
export function refreshOwnedUsersInState(state: AppState): AppState {
  const owned = new Set(listAccountSessions().map(s => s.userId));
  if (!owned.size) return state;
  return {
    ...state,
    users: (state.users || []).map(u => {
      if (!owned.has(u.id)) return u;
      const fresh = resolveUserProfile({ ...state, users: state.users }, u.id);
      return fresh ?? u;
    }),
  };
}

/** عند التبديل: إفراغ المحادثات المؤقتة وتحديث ملفات الحسابات المملوكة */
export function purgeStateForAccountSwitch(state: AppState, nextUserId: ID): AppState {
  const refreshed = refreshOwnedUsersInState({
    ...state,
    currentUserId: nextUserId,
    chats: [],
  });
  return {
    ...refreshed,
    notifications: (refreshed.notifications || []).filter(n => n.userId === nextUserId),
  };
}
