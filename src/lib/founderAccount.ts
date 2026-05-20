import type { User } from "./types";

/** معرّف حساب المؤسس في users.json على القرص D */
export const FOUNDER_ACCOUNT_ID = "u_founder_tareqf";

const FOUNDER_BODY =
  "هذا الحساب (@t) هو حساب صاحب التطبيق ومؤسسه؛ يُعرض المحتوى والتوجيه الرسمي لـ Retweet من هنا.";

export function isFounderAccount(user: Pick<User, "id" | "username">): boolean {
  return user.id === FOUNDER_ACCOUNT_ID || user.username?.trim().toLowerCase() === "t";
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
