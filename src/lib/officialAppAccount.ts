import type { User } from "./types";

/** معرّف الحساب الرسمي للتطبيق */
export const OFFICIAL_APP_ACCOUNT_ID = "u_official_retweet";

/** بيانات الدخول الافتراضية (تطوير / بذرة محلية) */
export const OFFICIAL_APP_USERNAME = "retweet";
export const OFFICIAL_APP_EMAIL = "official@retweet.app";
export const OFFICIAL_APP_PASSWORD = "Retweet@Official2026!";
export const OFFICIAL_APP_DISPLAY_NAME = "Retweet";

const OFFICIAL_BODY =
  "هذا هو الحساب الرسمي الوحيد لتطبيق Retweet — للإعلانات، التحديثات، الدعم الفني، وسياسات المنصة. أي حساب آخر يدّعي تمثيل التطبيق غير معتمد.";

export function isOfficialAppAccount(user: Pick<User, "id" | "username">): boolean {
  const u = user.username?.trim().toLowerCase();
  return user.id === OFFICIAL_APP_ACCOUNT_ID || u === OFFICIAL_APP_USERNAME;
}

export function withOfficialAppProfileFields(user: User): User {
  if (!isOfficialAppAccount(user)) return user;
  return {
    ...user,
    username: OFFICIAL_APP_USERNAME,
    displayName: user.displayName?.trim() || OFFICIAL_APP_DISPLAY_NAME,
    appOfficialVerified: true,
    verified: false,
    founderVerified: false,
    bio:
      user.bio?.trim() ||
      "الحساب الرسمي الوحيد لتطبيق Retweet — تحديثات، إعلانات، دعم، وإرشادات الاستخدام.",
    note: user.note?.trim() || "✦ حساب التطبيق الرسمي",
    profileLink: user.profileLink?.trim() || "",
    appOfficialLabel: user.appOfficialLabel?.trim() || OFFICIAL_BODY,
    avatar: user.avatar?.trim() || "✦",
  };
}

/** مستخدم البذرة المحلية */
export function createOfficialAppSeedUser(
  mk: (p: Partial<User> & Pick<User, "id" | "username" | "email" | "password" | "avatar" | "bio">) => User,
): User {
  return mk({
    id: OFFICIAL_APP_ACCOUNT_ID,
    username: OFFICIAL_APP_USERNAME,
    displayName: OFFICIAL_APP_DISPLAY_NAME,
    email: OFFICIAL_APP_EMAIL,
    password: OFFICIAL_APP_PASSWORD,
    avatar: "✦",
    bio: "الحساب الرسمي الوحيد لتطبيق Retweet — تحديثات، إعلانات، دعم، وإرشادات الاستخدام.",
    note: "✦ حساب التطبيق الرسمي",
    appOfficialVerified: true,
    appOfficialLabel: OFFICIAL_BODY,
    verified: false,
    founderVerified: false,
    isPrivate: false,
  });
}
