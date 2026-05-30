import type { ID, User } from "./types";

/** معرّف حساب المؤسس في users.json على القرص D */
export const FOUNDER_ACCOUNT_ID = "u_founder_tareqf";

/** حساب @t القديم قبل الدمج — منشوراته تُعرَض مع البروفايل الرسمي */
export const LEGACY_FOUNDER_USER_ID = "u_t_account";

const FOUNDER_BODY =
  "هذا الحساب (@t) هو حساب صاحب التطبيق ومؤسسه؛ يُعرض المحتوى والتوجيه الرسمي لـ Retweet من هنا.";

export function isFounderAccount(user: Pick<User, "id" | "username">): boolean {
  return (
    user.id === FOUNDER_ACCOUNT_ID ||
    user.id === LEGACY_FOUNDER_USER_ID ||
    user.username?.trim().toLowerCase() === "t"
  );
}

/** معرّفات المؤلف عند عرض شبكة منشورات @t */
export function profilePostAuthorIds(
  userId: ID,
  user?: Pick<User, "id" | "username"> | null,
): ID[] {
  if (isFounderAccount(user ?? { id: userId, username: "" })) {
    return [FOUNDER_ACCOUNT_ID, LEGACY_FOUNDER_USER_ID];
  }
  return [userId];
}

/** يضمن ظهور الملاحظة والتوثيق حتى مع لقطة محلية قديمة */
export function withFounderProfileFields(user: User): User {
  if (!isFounderAccount(user)) return user;
  return {
    ...user,
    username: user.username?.trim() || "t",
    founderVerified: true,
    verified: false,
    bio: user.bio ?? "",
    profileLink: "",
    founderOfficialLabel: user.founderOfficialLabel?.trim() || FOUNDER_BODY,
  };
}
