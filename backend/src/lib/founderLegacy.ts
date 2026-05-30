import { FOUNDER_ACCOUNT_ID } from "./usernameRules.js";

/** معرّف الحساب المدمج القديم — منشوراته تُعرَض تحت @t */
export const LEGACY_FOUNDER_USER_ID = "u_t_account";

export function normalizeFounderPostUserId(userId: string): string {
  return userId === LEGACY_FOUNDER_USER_ID ? FOUNDER_ACCOUNT_ID : userId;
}

/** معرّفات المؤلف عند عرض بروفايل @t */
export function authorIdsForFounderProfile(profileUserId: string): string[] | null {
  if (profileUserId === FOUNDER_ACCOUNT_ID || profileUserId === LEGACY_FOUNDER_USER_ID) {
    return [FOUNDER_ACCOUNT_ID, LEGACY_FOUNDER_USER_ID];
  }
  return null;
}

/** توكن قديم قد يحمل u_t_account — نحفظ المنشورات تحت الحساب الرسمي */
export function resolveCanonicalPostOwnerId(ownerId: string): string {
  return normalizeFounderPostUserId(ownerId);
}
