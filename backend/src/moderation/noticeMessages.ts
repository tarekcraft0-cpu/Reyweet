import { REPORT_CATEGORIES, type ReportCategoryId } from "../../../src/lib/moderationTypes.js";

export function resolveGuidelineLabelAr(guideline?: string): string | undefined {
  const key = (guideline || "").trim();
  if (!key) return undefined;
  const byId = REPORT_CATEGORIES.find(c => c.id === key);
  if (byId) return byId.labelAr;
  const byLoose = REPORT_CATEGORIES.find(c => c.id === key.toLowerCase());
  return byLoose?.labelAr ?? key;
}

export function buildWarningNoticePayload(opts: {
  reason?: string;
  guideline?: string;
}): { titleAr: string; messageAr: string; guidelineAr?: string; reasonDetail: string } {
  const guidelineAr = resolveGuidelineLabelAr(opts.guideline);
  const reasonDetail = opts.reason?.trim() || "مخالفة إرشادات المجتمع";
  const messageAr = guidelineAr
    ? `تم تسجيل مخالفة بسبب: ${guidelineAr}. راجع التفاصيل أدناه وتجنّب تكرار السلوك لتفادي تعطيل حسابك.`
    : `لقد تلقيت تحذيراً بسبب مخالفة إرشادات المجتمع. راجع التفاصيل أدناه.`;
  return {
    titleAr: "تحذير — مخالفة إرشادات المجتمع",
    messageAr,
    guidelineAr,
    reasonDetail,
  };
}
