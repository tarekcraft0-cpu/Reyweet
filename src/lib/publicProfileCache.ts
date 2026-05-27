import type { ApiSearchUser } from "./apiBackend";
import { userFromSearchResult } from "./apiBackend";
import { mergeDirectoryUser, mergeUserFromServer } from "./mergeUserSocial";
import type { ID, User } from "./types";

/**
 * ملفات عامة مُجلبة من API — لا تُمسح عند عزل حسابات أخرى مسجّلة على الجهاز.
 * يصلح عرض متابعين/ستوريات حساب مثل @t عند فتحه من حساب @512 على نفس الجهاز.
 */
const overlayById = new Map<ID, User>();

export function getPublicProfileOverlay(userId: ID): User | undefined {
  return overlayById.get(userId);
}

export function cachePublicProfileFromApi(row: ApiSearchUser): User {
  const stub = userFromSearchResult(row);
  const prev = overlayById.get(row.id);
  const next = prev ? mergeDirectoryUser(prev, row) : stub;
  overlayById.set(row.id, next);
  return next;
}

export function cachePublicProfileFromUser(user: User): User {
  const prev = overlayById.get(user.id);
  const next = prev ? mergeUserFromServer(prev, { ...user, password: "" }) : { ...user, password: "" };
  overlayById.set(user.id, next);
  return next;
}

export function patchPublicProfileSocial(
  userId: ID,
  patch: Partial<Pick<User, "followers" | "following" | "displayFollowerCount" | "isPrivate">>,
): void {
  const prev = overlayById.get(userId);
  if (!prev) return;
  overlayById.set(userId, { ...prev, ...patch });
}

/** عدد المتابعين للعرض — يفضّل العدد من الخادم على طول قائمة ناقصة محلياً */
export function resolveDisplayFollowerCount(user: Pick<User, "displayFollowerCount" | "followers">): number {
  if (typeof user.displayFollowerCount === "number") return user.displayFollowerCount;
  return user.followers?.length ?? 0;
}
