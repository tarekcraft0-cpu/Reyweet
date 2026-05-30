import type { BanInfo } from "./moderationBanTypes";
import { REPORT_CATEGORIES, type ReportCategoryId } from "./moderationTypes";

/** فئات البلاغ التي تعرض رسالة السلوك الخطير على شاشة الحظر */
const SEVERE_BAN_CATEGORY_IDS = new Set<ReportCategoryId>([
  "nudity",
  "terrorism",
  "child_exploitation",
]);

const SEVERE_TEXT_NEEDLES = [
  "nudity",
  "sexual",
  "terrorism",
  "child_exploitation",
  "child exploitation",
  "عري",
  "نشاط جنسي",
  "إرهاب",
  "ارهاب",
  "استغلال أطفال",
  "استغلال اطفال",
] as const;

export const SEVERE_BAN_CONDUCT_LINE = "لعن الله ابو هالشوارب";

const DEFAULT_BAN_TYPE_LABEL = "مخالفة إرشادات المجتمع";

/** تسمية نوع الحظر المعروضة للمستخدم (فئة البلاغ أو السبب) */
export function resolveBanTypeLabel(banInfo: BanInfo): string {
  const guidelineKey = (banInfo.banGuideline || "").trim();
  if (guidelineKey) {
    const byId = REPORT_CATEGORIES.find(c => c.id === guidelineKey);
    if (byId) return byId.labelAr;
    const byIdLoose = REPORT_CATEGORIES.find(c => c.id === guidelineKey.toLowerCase());
    if (byIdLoose) return byIdLoose.labelAr;
  }
  const blob = `${banInfo.banReason} ${banInfo.banGuideline}`.toLowerCase();
  for (const cat of REPORT_CATEGORIES) {
    if (blob.includes(cat.id.replace(/_/g, " ")) || blob.includes(cat.labelAr.toLowerCase())) {
      return cat.labelAr;
    }
  }
  const reason = banInfo.banReason?.trim();
  if (reason && reason !== DEFAULT_BAN_TYPE_LABEL) return reason;
  return DEFAULT_BAN_TYPE_LABEL;
}

export function banShowsSevereConductLine(banInfo: BanInfo): boolean {
  const guidelineKey = (banInfo.banGuideline || "").trim().toLowerCase();
  if (guidelineKey && SEVERE_BAN_CATEGORY_IDS.has(guidelineKey as ReportCategoryId)) {
    return true;
  }
  const blob = `${banInfo.banReason} ${banInfo.banGuideline}`.toLowerCase();
  return SEVERE_TEXT_NEEDLES.some(n => blob.includes(n));
}
