/** حالة طلب التوثيق اليدوي */
export type VerificationStatus = "none" | "pending" | "approved" | "rejected";

export type VerificationBadgeColor = "blue" | "pink";

export const VERIFICATION_SUBSCRIPTION_PLAN = "verified_monthly";
export const VERIFICATION_SUBSCRIPTION_PRICE_USD = 4;

export interface VerificationUserFields {
  verified?: boolean;
  founderVerified?: boolean;
  appOfficialVerified?: boolean;
  supportOfficialVerified?: boolean;
  isSubscribed?: boolean;
  subscriptionPlan?: string;
  subscriptionExpiresAt?: string;
  verificationStatus?: VerificationStatus;
  verificationBadgeColor?: VerificationBadgeColor;
  canUseAnimatedAvatar?: boolean;
  storyMaxDuration?: number;
  storyExpiryOptions?: number[];
  postCharacterLimit?: number;
}

export interface UserEntitlements {
  isVerified: boolean;
  isSubscribed: boolean;
  verificationStatus: VerificationStatus;
  verificationBadgeColor: VerificationBadgeColor;
  canUseAnimatedAvatar: boolean;
  storyMaxDurationSec: number;
  storyExpiryHoursOptions: number[];
  postCharacterLimit: number;
  canRequestVerification: boolean;
}

function isExemptAccount(user: VerificationUserFields): boolean {
  return (
    user.founderVerified === true ||
    user.appOfficialVerified === true ||
    user.supportOfficialVerified === true
  );
}

/** حساب موثّق يعرض الشارة الزرقاء (بعد موافقة الإدارة) */
export function isVerifiedBadgeActive(user: VerificationUserFields): boolean {
  if (user.verificationStatus === "rejected") return false;
  if (user.verificationStatus === "approved" && user.verified === true) return true;
  /** ترحيل العملاء القدامى: موثّق + مشترك قبل نظام الطلبات */
  if (user.verified === true && user.isSubscribed === true) return true;
  return false;
}

export function hasActiveSubscription(user: VerificationUserFields, now = Date.now()): boolean {
  if (isExemptAccount(user)) return true;
  if (user.isSubscribed !== true) return false;
  const exp = user.subscriptionExpiresAt?.trim();
  if (!exp) return true;
  const t = Date.parse(exp);
  return Number.isFinite(t) && t > now;
}

export function getUserEntitlements(user: VerificationUserFields, now = Date.now()): UserEntitlements {
  const exempt = isExemptAccount(user);
  const status: VerificationStatus =
    user.verificationStatus === "pending" ||
    user.verificationStatus === "approved" ||
    user.verificationStatus === "rejected"
      ? user.verificationStatus
      : user.verified
        ? "approved"
        : "none";

  const isVerified = exempt || isVerifiedBadgeActive(user) || user.founderVerified === true;
  const isSubscribed = exempt || hasActiveSubscription(user, now);
  const storyMax = user.storyMaxDuration ?? (isVerified ? 60 : 30);
  const postLimit = user.postCharacterLimit ?? (isVerified ? 1000 : 300);
  const rawExpiry = Array.isArray(user.storyExpiryOptions) ? user.storyExpiryOptions : [];
  const expiryOpts =
    rawExpiry.length && isVerified
      ? rawExpiry.filter(h => [24, 48, 72].includes(h))
      : isVerified
        ? [24, 48, 72]
        : [24];

  return {
    isVerified,
    isSubscribed,
    verificationStatus: status,
    verificationBadgeColor: user.verificationBadgeColor === "pink" ? "pink" : "blue",
    canUseAnimatedAvatar: exempt || (isVerified && (user.canUseAnimatedAvatar !== false)),
    storyMaxDurationSec: Math.min(60, Math.max(30, storyMax)),
    storyExpiryHoursOptions: expiryOpts.length ? expiryOpts : [24],
    postCharacterLimit: postLimit,
    canRequestVerification:
      isSubscribed && !isVerified && status !== "pending" && status !== "rejected",
  };
}

export function storyExpiryMs(story: { createdAt: number; expiryHours?: number }, ent?: UserEntitlements): number {
  const hours = story.expiryHours ?? 24;
  const allowed = ent?.storyExpiryHoursOptions ?? [24];
  const h = allowed.includes(hours) ? hours : allowed[allowed.length - 1] ?? 24;
  return h * 60 * 60 * 1000;
}

export function isStoryStillActive(
  story: { createdAt: number; expiryHours?: number },
  ent?: UserEntitlements,
  now = Date.now(),
): boolean {
  return story.createdAt + storyExpiryMs(story, ent) > now;
}

export function isAnimatedAvatarUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.endsWith(".gif") || u.startsWith("data:image/gif") || u.includes("image/gif");
}

export const DEFAULT_USER_VERIFICATION_FIELDS = {
  verified: false,
  isSubscribed: false,
  subscriptionPlan: "",
  verificationStatus: "none" as VerificationStatus,
  verificationBadgeColor: "blue" as VerificationBadgeColor,
  canUseAnimatedAvatar: false,
  storyMaxDuration: 30,
  storyExpiryOptions: [24],
  postCharacterLimit: 300,
};
