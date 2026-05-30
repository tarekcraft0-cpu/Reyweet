import type { User } from "./types";

export const SUPPORT_OFFICIAL_ACCOUNT_ID = "u_support_official";
export const SUPPORT_OFFICIAL_USERNAME = "support";
export const SUPPORT_OFFICIAL_EMAIL = "support@retweet.app";
export const SUPPORT_OFFICIAL_PASSWORD = "Support@Retweet2026!";
export const SUPPORT_OFFICIAL_DISPLAY_NAME = "دعم Retweet";

const SUPPORT_LABEL =
  "هذا هو حساب الدعم الرسمي لتطبيق Retweet — للمساعدة، البلاغات، طلبات التوثيق، واستفسارات الحساب. لا تتعامل مع حسابات أخرى تدّعي أنها فريق الدعم.";

export function isSupportOfficialAccount(user: Pick<User, "id" | "username">): boolean {
  const u = user.username?.trim().toLowerCase();
  return user.id === SUPPORT_OFFICIAL_ACCOUNT_ID || u === SUPPORT_OFFICIAL_USERNAME;
}

export function withSupportOfficialProfileFields(user: User): User {
  if (!isSupportOfficialAccount(user)) return user;
  return {
    ...user,
    username: SUPPORT_OFFICIAL_USERNAME,
    displayName: user.displayName?.trim() || SUPPORT_OFFICIAL_DISPLAY_NAME,
    supportOfficialVerified: true,
    verified: user.verified !== false,
    verificationStatus: user.verificationStatus ?? "approved",
    isSubscribed: user.isSubscribed !== false,
    subscriptionPlan: user.subscriptionPlan || "official",
    founderVerified: false,
    appOfficialVerified: false,
    bio:
      user.bio?.trim() ||
      "حساب الدعم الرسمي — مساعدة المستخدمين، متابعة البلاغات، وطلبات التوثيق.",
    note: user.note?.trim() || "🛟 دعم Retweet الرسمي",
    supportOfficialLabel: user.supportOfficialLabel?.trim() || SUPPORT_LABEL,
    avatar: user.avatar?.trim() || "🛟",
    isPrivate: false,
  };
}

export function createSupportOfficialSeedUser(
  mk: (p: Partial<User> & Pick<User, "id" | "username" | "email" | "password" | "avatar" | "bio">) => User,
): User {
  return withSupportOfficialProfileFields(
    mk({
      id: SUPPORT_OFFICIAL_ACCOUNT_ID,
      username: SUPPORT_OFFICIAL_USERNAME,
      displayName: SUPPORT_OFFICIAL_DISPLAY_NAME,
      email: SUPPORT_OFFICIAL_EMAIL,
      password: SUPPORT_OFFICIAL_PASSWORD,
      avatar: "🛟",
      bio: "حساب الدعم الرسمي — مساعدة المستخدمين، متابعة البلاغات، وطلبات التوثيق.",
      note: "🛟 دعم Retweet الرسمي",
      supportOfficialVerified: true,
      supportOfficialLabel: SUPPORT_LABEL,
      verified: true,
      verificationStatus: "approved",
      isSubscribed: true,
      subscriptionPlan: "official",
      verificationBadgeColor: "blue",
      founderVerified: false,
      appOfficialVerified: false,
      isPrivate: false,
    }),
  );
}
