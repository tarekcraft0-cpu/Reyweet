/** باقات اشتراك التوثيق — الأسعار بالدولار شهرياً */
export type VerificationTierId = "verified_starter" | "verified_plus" | "verified_max";

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
      "شارة توثيق بعد الموافقة",
      "ستوري حتى 45 ثانية",
      "منشورات حتى 500 حرف",
      "مدة ستوري 24 ساعة",
    ],
    storyMaxDuration: 45,
    postCharacterLimit: 500,
    storyExpiryHours: [24],
    canUseAnimatedAvatar: false,
    canPickBadgeColor: false,
  },
  {
    id: "verified_plus",
    plan: "verified_plus",
    priceUsd: 2,
    nameAr: "توثيق بلس",
    badgeAr: "الأكثر اختياراً",
    perksAr: [
      "كل مزايا التوثيق الأساسي",
      "افتار متحرك (GIF)",
      "اختيار لون شارة التوثيق",
      "ستوري حتى 60 ثانية",
      "مدة ستوري حتى 48 ساعة",
      "منشورات حتى 750 حرف",
    ],
    storyMaxDuration: 60,
    postCharacterLimit: 750,
    storyExpiryHours: [24, 48],
    canUseAnimatedAvatar: true,
    canPickBadgeColor: true,
  },
  {
    id: "verified_max",
    plan: "verified_max",
    priceUsd: 3,
    nameAr: "توثيق ماكس",
    badgeAr: "أقصى مزايا",
    perksAr: [
      "كل مزايا توثيق بلس",
      "ستوري حتى 60 ثانية",
      "مدة ستوري حتى 72 ساعة",
      "منشورات حتى 1000 حرف",
      "أولوية في مراجعة الطلب",
      "دعم أسرع من فريق التوثيق",
    ],
    storyMaxDuration: 60,
    postCharacterLimit: 1000,
    storyExpiryHours: [24, 48, 72],
    canUseAnimatedAvatar: true,
    canPickBadgeColor: true,
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
  "storyMaxDuration" | "postCharacterLimit" | "storyExpiryHours" | "canUseAnimatedAvatar" | "canPickBadgeColor"
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
