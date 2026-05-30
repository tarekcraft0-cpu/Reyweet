import type { ID, User } from "./types";
import type { ApiSearchUser } from "./apiBackend";
import { userFromSearchResult } from "./apiBackend";
import { isRenderableMediaUrl } from "./mediaUrl";

/** يمنع crash عند حقول مصفوفة ناقصة (حساب جديد / stub / لقطة قديمة) */
export function withUserListDefaults(u: User): User {
  return {
    ...u,
    highlights: u.highlights ?? [],
    followers: u.followers ?? [],
    following: u.following ?? [],
    blocked: u.blocked ?? [],
    closeFriends: u.closeFriends ?? [],
    favorites: u.favorites ?? [],
    followRequestIn: u.followRequestIn ?? [],
    followRequestOut: u.followRequestOut ?? [],
    publicChannelIds: u.publicChannelIds ?? [],
    favoriteStickerContents: u.favoriteStickerContents ?? [],
    createdStickerContents: u.createdStickerContents ?? [],
    profileViews: u.profileViews ?? [],
    pinnedChatIds: u.pinnedChatIds ?? [],
    mutedChatIds: u.mutedChatIds ?? [],
  };
}

/** أحرف أولية من السيرفر (مثل "AB") — ليست صورة مرفوعة */
function isPlaceholderAvatar(avatar: string | undefined, username: string): boolean {
  if (!avatar) return true;
  const t = avatar.trim();
  if (t.startsWith("data:") || t.startsWith("/") || t.includes("://")) return false;
  const initials = (username || "U").slice(0, 2).toUpperCase();
  return t.length <= 3 && t.toUpperCase() === initials;
}

function pickAvatar(incoming: string | undefined, prev: string | undefined, username: string): string {
  if (incoming && isRenderableMediaUrl(incoming)) return incoming;
  if (isPlaceholderAvatar(incoming, username) && prev && !isPlaceholderAvatar(prev, username)) {
    return prev;
  }
  if (prev && isRenderableMediaUrl(prev) && isPlaceholderAvatar(incoming, username)) return prev;
  return mergeProfileScalar(incoming, prev) ?? prev ?? incoming ?? "";
}

/** لا نستبدل حقول الملف بقيم فارغة من دليل قديم أو لقطة متأخرة */
function mergeProfileScalar<T extends string | undefined>(
  incoming: T,
  prev: T,
  opts?: { allowClear?: boolean },
): T {
  if (incoming === undefined) return prev;
  if (opts?.allowClear) return incoming;
  const inc = typeof incoming === "string" ? incoming.trim() : incoming;
  if (!inc) return prev;
  return incoming;
}

/** دمج ملف شخصي من users.json / PATCH — يفضّل قيم السيرفر عند وجودها */
export function applyAuthoritativeProfile(base: User, server: Partial<User> & { id: ID }): User {
  return mergeUserProfilePatch(base, {
    id: base.id,
    username: server.username ?? base.username,
    displayName: server.displayName !== undefined ? server.displayName : base.displayName,
    avatar:
      server.avatar && isRenderableMediaUrl(server.avatar)
        ? server.avatar
        : pickAvatar(server.avatar, base.avatar, server.username ?? base.username),
    bio: server.bio !== undefined ? server.bio : base.bio,
    note: server.note !== undefined ? server.note : base.note,
    profileLink: server.profileLink !== undefined ? server.profileLink : base.profileLink,
    verified: server.verified !== undefined ? server.verified : base.verified,
    founderVerified:
      server.founderVerified !== undefined ? server.founderVerified : base.founderVerified,
    founderOfficialLabel:
      server.founderOfficialLabel !== undefined
        ? server.founderOfficialLabel
        : base.founderOfficialLabel,
    appOfficialVerified:
      server.appOfficialVerified !== undefined
        ? server.appOfficialVerified
        : base.appOfficialVerified,
    appOfficialLabel:
      server.appOfficialLabel !== undefined ? server.appOfficialLabel : base.appOfficialLabel,
  });
}

/** لا نمسح قائمة الحظر المحلية بلقطة سيرفر قديمة بلا blocked */
export function mergeBlockedFromServer(prev?: ID[], incoming?: ID[]): ID[] {
  const p = prev ?? [];
  const i = incoming ?? [];
  if (p.length > i.length) return p;
  if (i.length > p.length) return i;
  return i;
}

/** دمج حالة السيرفر — المتابعات من الاستجابة دائماً (حتى لو فارغة بعد إلغاء متابعة) */
export function mergeUserFromServer(prev: User | undefined, incoming: User): User {
  if (!prev) return withUserListDefaults({ ...incoming, password: "" });
  return withUserListDefaults({
    ...prev,
    ...incoming,
    password: "",
    username: mergeProfileScalar(incoming.username, prev.username) ?? prev.username,
    displayName: mergeProfileScalar(incoming.displayName, prev.displayName, { allowClear: true }),
    avatar:
      incoming.avatar && isRenderableMediaUrl(incoming.avatar)
        ? incoming.avatar
        : pickAvatar(incoming.avatar, prev.avatar, incoming.username ?? prev.username),
    bio: incoming.bio !== undefined ? incoming.bio : prev.bio,
    note: incoming.note !== undefined ? incoming.note : prev.note,
    profileLink: incoming.profileLink !== undefined ? incoming.profileLink : prev.profileLink,
    verified: incoming.verified === true || prev.verified === true,
    founderVerified: incoming.founderVerified === true || prev.founderVerified === true,
    founderOfficialLabel:
      incoming.founderOfficialLabel !== undefined
        ? incoming.founderOfficialLabel
        : prev.founderOfficialLabel,
    appOfficialVerified:
      incoming.appOfficialVerified === true || prev.appOfficialVerified === true,
    appOfficialLabel:
      incoming.appOfficialLabel !== undefined ? incoming.appOfficialLabel : prev.appOfficialLabel,
    following: Array.isArray(incoming.following) ? incoming.following : prev.following,
    followers: Array.isArray(incoming.followers) ? incoming.followers : prev.followers,
    followRequestIn: Array.isArray(incoming.followRequestIn)
      ? incoming.followRequestIn
      : prev.followRequestIn,
    followRequestOut: Array.isArray(incoming.followRequestOut)
      ? incoming.followRequestOut
      : prev.followRequestOut,
    blocked: mergeBlockedFromServer(prev.blocked, incoming.blocked),
    closeFriends: Array.isArray(incoming.closeFriends) ? incoming.closeFriends : prev.closeFriends,
    highlights: Array.isArray(incoming.highlights) ? incoming.highlights : (prev.highlights ?? []),
  });
}

/** دليل البحث / recent — حقول الملف الشخصي فقط، لا يمسح المتابعات */
export function mergeDirectoryUser(prev: User | undefined, row: ApiSearchUser): User {
  const stub = userFromSearchResult(row);
  if (!prev) return stub;
  return {
    ...prev,
    username: stub.username || prev.username,
    displayName:
      row.displayName !== undefined
        ? row.displayName?.trim() || undefined
        : prev.displayName,
    avatar:
      stub.avatar && isRenderableMediaUrl(stub.avatar) ? stub.avatar : prev.avatar,
    bio: row.bio !== undefined ? (row.bio ?? "") : prev.bio,
    verified: stub.verified === true || prev.verified === true,
    founderVerified: stub.founderVerified === true || prev.founderVerified === true,
    founderOfficialLabel:
      row.founderOfficialLabel !== undefined ? stub.founderOfficialLabel : prev.founderOfficialLabel,
    appOfficialVerified: stub.appOfficialVerified === true || prev.appOfficialVerified === true,
    appOfficialLabel:
      row.appOfficialLabel !== undefined ? stub.appOfficialLabel : prev.appOfficialLabel,
    isPrivate: row.isPrivate === true ? true : row.isPrivate === false ? false : prev.isPrivate,
    followers:
      Array.isArray(row.followers) && row.followers.length
        ? row.followers
        : prev.followers,
    following:
      Array.isArray(row.following) && row.following.length
        ? row.following
        : prev.following,
    displayFollowerCount:
      typeof row.followerCount === "number" ? row.followerCount : prev.displayFollowerCount,
    password: "",
  };
}

/** دمج صف كامل (مثلاً بعد PATCH /v1/me/profile) */
export function mergeUserProfilePatch(prev: User, patch: Partial<User> & { id: ID }): User {
  const {
    following: _f,
    followers: _fo,
    blocked: _b,
    closeFriends: _c,
    favorites: _fa,
    highlights: _h,
    followRequestIn: _in,
    followRequestOut: _out,
    publicChannelIds: _pc,
    profileViews: _pv,
    pinnedChatIds: _pin,
    mutedChatIds: _mut,
    ...profilePatch
  } = patch;
  return {
    ...prev,
    ...profilePatch,
    username: patch.username != null ? patch.username : prev.username,
    displayName:
      patch.displayName !== undefined ? patch.displayName?.trim() || undefined : prev.displayName,
    avatar:
      patch.avatar != null && String(patch.avatar).trim().length > 0
        ? patch.avatar
        : prev.avatar,
    bio: patch.bio !== undefined ? patch.bio : prev.bio,
    note: patch.note !== undefined ? patch.note : prev.note,
    profileLink: patch.profileLink !== undefined ? patch.profileLink : prev.profileLink,
    verified: patch.verified === true ? true : patch.verified === false ? false : prev.verified,
    founderVerified:
      patch.founderVerified === true
        ? true
        : patch.founderVerified === false
          ? false
          : prev.founderVerified,
    founderOfficialLabel:
      patch.founderOfficialLabel !== undefined ? patch.founderOfficialLabel : prev.founderOfficialLabel,
    appOfficialVerified:
      patch.appOfficialVerified === true
        ? true
        : patch.appOfficialVerified === false
          ? false
          : prev.appOfficialVerified,
    appOfficialLabel:
      patch.appOfficialLabel !== undefined ? patch.appOfficialLabel : prev.appOfficialLabel,
    isSubscribed: patch.isSubscribed !== undefined ? patch.isSubscribed === true : prev.isSubscribed,
    subscriptionPlan:
      patch.subscriptionPlan !== undefined ? patch.subscriptionPlan : prev.subscriptionPlan,
    subscriptionExpiresAt:
      patch.subscriptionExpiresAt !== undefined
        ? patch.subscriptionExpiresAt
        : prev.subscriptionExpiresAt,
    verificationStatus:
      patch.verificationStatus !== undefined ? patch.verificationStatus : prev.verificationStatus,
    verificationBadgeColor:
      patch.verificationBadgeColor !== undefined
        ? patch.verificationBadgeColor
        : prev.verificationBadgeColor,
    canUseAnimatedAvatar:
      patch.canUseAnimatedAvatar !== undefined
        ? patch.canUseAnimatedAvatar === true
        : prev.canUseAnimatedAvatar,
    storyMaxDuration:
      patch.storyMaxDuration !== undefined ? patch.storyMaxDuration : prev.storyMaxDuration,
    storyExpiryOptions:
      patch.storyExpiryOptions !== undefined ? patch.storyExpiryOptions : prev.storyExpiryOptions,
    postCharacterLimit:
      patch.postCharacterLimit !== undefined ? patch.postCharacterLimit : prev.postCharacterLimit,
    password: "",
  };
}
