/** باقات اشتراك التوثيق — الأسعار بالدولار شهرياً */
export type VerificationTierId = "verified_starter" | "verified_plus" | "verified_max";

export type ExclusiveStickerPack = "none" | "basic" | "full";

export type VerificationTier = {
  id: VerificationTierId;
  plan: string;
  priceUsd: number;
  nameAr: string;
  badgeAr: string;
  perksAr: string[];
  storyMaxDuration: number;
  postCharacterLimit: number;
  storyExpiryHours: number[];
  canUseAnimatedAvatar: boolean;
  canPickBadgeColor: boolean;
  /** 0–3 — أعلى = أولوية في البحث */
  searchRankBoost: number;
  exclusiveStickers: ExclusiveStickerPack;
  hasStoryLinkSticker: boolean;
  hasStoryAnalytics: boolean;
  hasScheduledPosts: boolean;
  hasQuickReplies: boolean;
  maxQuickReplies: number;
  canPinPost: boolean;
  canRestrictComments: boolean;
  canRestrictDm: boolean;
  /** ساعات مراجعة الطلب (وعد تسويقي) */
  reviewPriorityHours: number;
  canResubmitOnReject: boolean;
  showPendingReviewBadge: boolean;
  hasVerifiedAvatarFrame: boolean;
  hasExclusiveChatTheme: boolean;
  reelsPriorityBoost: boolean;
  hasUnlimitedDrafts: boolean;
};

export const VERIFICATION_TIERS: VerificationTier[] = [
  {
    id: "verified_starter",
    plan: "verified_starter",
    priceUsd: 1,
    nameAr: "توثيق أساسي",
    badgeAr: "للبدء",
    perksAr: [
      "طلب توثيق يُرسل لفريق الدعم",
      "شارة توثيق بعد الموافقة (بحث، شات، تعليقات، ريلز)",
      "افتار متحرك (GIF)",
      "إطار ذهبي حول الصورة في الستوري والنوت",
      "شارة «قيد المراجعة» بعد الدفع",
      "ستيكرز حصرية للموثّقين (حزمة أساسية)",
      "ردود سريعة جاهزة في الرسائل (٣ قوالب)",
      "أولوية خفيفة في نتائج البحث",
      "ستوري حتى 45 ثانية · منشورات 500 حرف · 24 ساعة",
      "مراجعة خلال 72 ساعة · إعادة طلب مجانية عند الرفض",
    ],
    storyMaxDuration: 45,
    postCharacterLimit: 500,
    storyExpiryHours: [24],
    canUseAnimatedAvatar: true,
    canPickBadgeColor: false,
    searchRankBoost: 1,
    exclusiveStickers: "basic",
    hasStoryLinkSticker: false,
    hasStoryAnalytics: false,
    hasScheduledPosts: false,
    hasQuickReplies: true,
    maxQuickReplies: 3,
    canPinPost: false,
    canRestrictComments: false,
    canRestrictDm: false,
    reviewPriorityHours: 72,
    canResubmitOnReject: true,
    showPendingReviewBadge: true,
    hasVerifiedAvatarFrame: true,
    hasExclusiveChatTheme: false,
    reelsPriorityBoost: false,
    hasUnlimitedDrafts: false,
  },
  {
    id: "verified_plus",
    plan: "verified_plus",
    priceUsd: 2,
    nameAr: "توثيق بلس",
    badgeAr: "الأكثر اختياراً",
    perksAr: [
      "كل مزايا التوثيق الأساسي",
      "اختيار لون شارة التوثيق (أزرق / وردي)",
      "تثبيت منشور واحد في البروفايل",
      "رابط قابل للنقر في الستوري",
      "إحصائيات مشاهدات الستوري",
      "ستيكرز حصرية كاملة + مسودات غير محدودة",
      "ثيم شات ذهبي حصري",
      "تقييد التعليقات على منشوراتك",
      "ردود سريعة حتى 8 قوالب",
      "أولوية أعلى في البحث والريلز",
      "ستوري 60 ث · 48 ساعة · منشورات 750 حرف",
      "مراجعة خلال 48 ساعة",
    ],
    storyMaxDuration: 60,
    postCharacterLimit: 750,
    storyExpiryHours: [24, 48],
    canUseAnimatedAvatar: true,
    canPickBadgeColor: true,
    searchRankBoost: 2,
    exclusiveStickers: "full",
    hasStoryLinkSticker: true,
    hasStoryAnalytics: true,
    hasScheduledPosts: false,
    hasQuickReplies: true,
    maxQuickReplies: 8,
    canPinPost: true,
    canRestrictComments: true,
    canRestrictDm: false,
    reviewPriorityHours: 48,
    canResubmitOnReject: true,
    showPendingReviewBadge: true,
    hasVerifiedAvatarFrame: true,
    hasExclusiveChatTheme: true,
    reelsPriorityBoost: true,
    hasUnlimitedDrafts: true,
  },
  {
    id: "verified_max",
    plan: "verified_max",
    priceUsd: 3,
    nameAr: "توثيق ماكس",
    badgeAr: "أقصى مزايا",
    perksAr: [
      "كل مزايا توثيق بلس",
      "جدولة نشر المنشورات والستوري",
      "تقييد الرسائل من غير المتابعين",
      "ردود سريعة حتى 15 قالباً",
      "أقصى أولوية في البحث والريلز ومراجعة الطلب",
      "ستوري 60 ث · 72 ساعة · منشورات 1000 حرف",
      "مراجعة خلال 24 ساعة",
      "دعم أسرع من فريق التوثيق",
    ],
    storyMaxDuration: 60,
    postCharacterLimit: 1000,
    storyExpiryHours: [24, 48, 72],
    canUseAnimatedAvatar: true,
    canPickBadgeColor: true,
    searchRankBoost: 3,
    exclusiveStickers: "full",
    hasStoryLinkSticker: true,
    hasStoryAnalytics: true,
    hasScheduledPosts: true,
    hasQuickReplies: true,
    maxQuickReplies: 15,
    canPinPost: true,
    canRestrictComments: true,
    canRestrictDm: true,
    reviewPriorityHours: 24,
    canResubmitOnReject: true,
    showPendingReviewBadge: true,
    hasVerifiedAvatarFrame: true,
    hasExclusiveChatTheme: true,
    reelsPriorityBoost: true,
    hasUnlimitedDrafts: true,
  },
];

export const DEFAULT_VERIFICATION_TIER_ID: VerificationTierId = "verified_plus";

const LEGACY_MAX_PLANS = new Set(["verified_monthly", "verified"]);

export function getVerificationTier(plan?: string | null): VerificationTier {
  const id = plan?.trim();
  if (id && LEGACY_MAX_PLANS.has(id)) {
    return VERIFICATION_TIERS.find(t => t.id === "verified_max")!;
  }
  const found = VERIFICATION_TIERS.find(t => t.plan === id || t.id === id);
  return found ?? VERIFICATION_TIERS.find(t => t.id === DEFAULT_VERIFICATION_TIER_ID)!;
}

export function tierLimitsFromPlan(plan?: string | null): Pick<
  VerificationTier,
  | "storyMaxDuration"
  | "postCharacterLimit"
  | "storyExpiryHours"
  | "canUseAnimatedAvatar"
  | "canPickBadgeColor"
> {
  const t = getVerificationTier(plan);
  return {
    storyMaxDuration: t.storyMaxDuration,
    postCharacterLimit: t.postCharacterLimit,
    storyExpiryHours: t.storyExpiryHours,
    canUseAnimatedAvatar: t.canUseAnimatedAvatar,
    canPickBadgeColor: t.canPickBadgeColor,
  };
}

/** مزايا الباقة كاملة — للصلاحيات في الواجهة */
export function tierFeaturesFromPlan(plan?: string | null): VerificationTier {
  return getVerificationTier(plan);
}
