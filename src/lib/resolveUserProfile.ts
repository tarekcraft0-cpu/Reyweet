import {
  canonicalOwnedProfileFields,
  getAccountSession,
  loadAccountStateCache,
  stripOtherOwnedAccountsFromUsers,
} from "./accountSessions";
import { isGuestUserId } from "./guestUser";
import { mergeUserProfilePatch, mergeUserFromServer, withUserListDefaults } from "./mergeUserSocial";
import { getPublicProfileOverlay } from "./publicProfileCache";
import { isRenderableMediaUrl } from "./mediaUrl";
import type { AppState, ID, User } from "./types";

/** المعرّف النشط — currentUserId فقط (لا fallback لجلسة أخرى؛ يمنع تسرّب رسائل/ملكية بين حسابات الجهاز) */
export function resolveActiveViewerId(state: AppState): ID | null {
  const id = state.currentUserId;
  if (!id || isGuestUserId(id)) return null;
  return id;
}

/**
 * ملف مستخدم للعرض — للحسابات المسجّلة على الجهاز: جلسة الحساب ثم الكاش ثم state.
 * يمنع عرض أفاتار/يوزر حساب سابق على معرّف مختلف.
 */
export function resolveUserProfile(state: AppState, userId: ID): User | undefined {
  const baseInState = state.users.find(u => u.id === userId);
  const baseFromCache = loadAccountStateCache(userId)?.users.find(u => u.id === userId);
  const publicOverlay = getPublicProfileOverlay(userId);
  const base = baseInState ?? baseFromCache ?? publicOverlay;
  const canon = canonicalOwnedProfileFields(userId);
  const sess = getAccountSession(userId);
  const isActiveOwned = !!sess && state.currentUserId === userId;

  if (!base && !canon && !sess && !publicOverlay) return undefined;

  const stub: User =
    base ??
    ({
      id: userId,
      username: sess?.username ?? canon?.username ?? "?",
      email: sess?.email ?? canon?.email ?? "",
      password: "",
      avatar: sess?.avatar ?? canon?.avatar ?? "?",
      following: publicOverlay?.following ?? [],
      followers: publicOverlay?.followers ?? [],
      displayFollowerCount: publicOverlay?.displayFollowerCount,
      followRequestIn: [],
      followRequestOut: [],
      blocked: [],
      closeFriends: [],
      highlights: [],
      favorites: [],
      publicChannelIds: [],
      favoriteStickerContents: [],
      createdStickerContents: [],
      profileViews: [],
      pinnedChatIds: [],
      mutedChatIds: [],
      isPrivate: publicOverlay?.isPrivate ?? canon?.isPrivate ?? false,
    } as User);

  let resolved = stub;
  if (publicOverlay) {
    resolved = mergeUserFromServer(resolved, { ...publicOverlay, password: "" });
  }

  /** الحساب النشط فقط: يوزر/إيميل/أفتار من الجلسة — لا نطبّق ذلك على حسابات أخرى على الجهاز */
  if (isActiveOwned) {
    const liveAvatar =
      baseInState?.avatar && isRenderableMediaUrl(baseInState.avatar)
        ? baseInState.avatar
        : resolved.avatar;
    return withUserListDefaults(
      mergeUserProfilePatch(resolved, {
        id: userId,
        username: sess!.username,
        email: sess!.email,
        avatar: liveAvatar,
        displayName: baseInState?.displayName ?? resolved.displayName,
      }),
    );
  }
  if (sess && !isActiveOwned) {
    const liveAvatar =
      resolved.avatar && isRenderableMediaUrl(resolved.avatar)
        ? resolved.avatar
        : sess.avatar ?? resolved.avatar;
    return withUserListDefaults(
      mergeUserProfilePatch(resolved, {
        id: userId,
        username: sess.username,
        avatar: liveAvatar,
        displayName: resolved.displayName,
      }),
    );
  }
  if (canon) {
    return withUserListDefaults(mergeUserProfilePatch(resolved, canon));
  }
  return withUserListDefaults(resolved);
}

export function resolveActiveViewer(state: AppState): User | null {
  const id = resolveActiveViewerId(state);
  if (!id) return null;
  return resolveUserProfile(state, id) ?? null;
}

/** تصحيح ملف الحساب النشط فقط */
export function refreshOwnedUsersInState(state: AppState): AppState {
  const cur = state.currentUserId;
  if (!cur || isGuestUserId(cur)) return state;
  const fresh = resolveUserProfile(state, cur);
  if (!fresh) return state;
  return {
    ...state,
    users: stripOtherOwnedAccountsFromUsers(
      cur,
      (state.users || []).map(u => (u.id === cur ? fresh : u)),
    ),
  };
}

/** عند التبديل: إفراغ بيانات الحساب السابق من الذاكرة */
export function purgeStateForAccountSwitch(state: AppState, nextUserId: ID): AppState {
  const refreshed = refreshOwnedUsersInState({
    ...state,
    currentUserId: nextUserId,
    accountIds: [nextUserId],
    chats: [],
    stories: [],
    users: stripOtherOwnedAccountsFromUsers(nextUserId, state.users || []),
  });
  return {
    ...refreshed,
    notifications: (refreshed.notifications || []).filter(n => n.userId === nextUserId),
  };
}
