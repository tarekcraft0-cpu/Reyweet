import type { ID, User } from "./types";
import type { ApiSearchUser } from "./apiBackend";
import { userFromSearchResult } from "./apiBackend";

/** أحرف أولية من السيرفر (مثل "AB") — ليست صورة مرفوعة */
function isPlaceholderAvatar(avatar: string | undefined, username: string): boolean {
  if (!avatar) return true;
  const t = avatar.trim();
  if (t.startsWith("data:") || t.startsWith("/") || t.includes("://")) return false;
  const initials = (username || "U").slice(0, 2).toUpperCase();
  return t.length <= 3 && t.toUpperCase() === initials;
}

function pickAvatar(incoming: string | undefined, prev: string | undefined, username: string): string {
  if (isPlaceholderAvatar(incoming, username) && prev && !isPlaceholderAvatar(prev, username)) {
    return prev;
  }
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
    avatar: pickAvatar(server.avatar, base.avatar, server.username ?? base.username),
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
  });
}

/** دمج حالة السيرفر — المتابعات من الاستجابة دائماً (حتى لو فارغة بعد إلغاء متابعة) */
export function mergeUserFromServer(prev: User | undefined, incoming: User): User {
  if (!prev) return { ...incoming, password: "" };
  return {
    ...prev,
    ...incoming,
    password: "",
    username: mergeProfileScalar(incoming.username, prev.username) ?? prev.username,
    displayName: mergeProfileScalar(incoming.displayName, prev.displayName, { allowClear: true }),
    avatar: pickAvatar(incoming.avatar, prev.avatar, incoming.username ?? prev.username),
    bio: incoming.bio !== undefined ? incoming.bio : prev.bio,
    note: incoming.note !== undefined ? incoming.note : prev.note,
    profileLink: incoming.profileLink !== undefined ? incoming.profileLink : prev.profileLink,
    verified: incoming.verified === true || prev.verified === true,
    founderVerified: incoming.founderVerified === true || prev.founderVerified === true,
    founderOfficialLabel:
      incoming.founderOfficialLabel !== undefined
        ? incoming.founderOfficialLabel
        : prev.founderOfficialLabel,
    following: Array.isArray(incoming.following) ? incoming.following : prev.following,
    followers: Array.isArray(incoming.followers) ? incoming.followers : prev.followers,
    followRequestIn: Array.isArray(incoming.followRequestIn)
      ? incoming.followRequestIn
      : prev.followRequestIn,
    followRequestOut: Array.isArray(incoming.followRequestOut)
      ? incoming.followRequestOut
      : prev.followRequestOut,
  };
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
    avatar: pickAvatar(stub.avatar, prev.avatar, stub.username || prev.username),
    bio: row.bio !== undefined ? (row.bio ?? "") : prev.bio,
    verified: stub.verified === true || prev.verified === true,
    founderVerified: stub.founderVerified === true || prev.founderVerified === true,
    founderOfficialLabel:
      row.founderOfficialLabel !== undefined ? stub.founderOfficialLabel : prev.founderOfficialLabel,
    password: "",
  };
}

/** دمج صف كامل (مثلاً بعد PATCH /v1/me/profile) */
export function mergeUserProfilePatch(prev: User, patch: Partial<User> & { id: ID }): User {
  return {
    ...prev,
    ...patch,
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
    password: "",
  };
}
