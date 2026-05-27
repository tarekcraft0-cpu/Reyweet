/** ترتيب التبويبات في الشريط السفلي — يطابق App.tsx */
export const BOTTOM_NAV_TAB_ORDER = ["home", "search", "reels", "chat", "profile"] as const;

export type BottomNavTabId = (typeof BOTTOM_NAV_TAB_ORDER)[number];

export const BOTTOM_NAV_TAB_COUNT = BOTTOM_NAV_TAB_ORDER.length;

export function tabToNavIndex(tab: string): number {
  const i = (BOTTOM_NAV_TAB_ORDER as readonly string[]).indexOf(tab);
  return i >= 0 ? i : 0;
}

export function navIndexToTab(index: number): BottomNavTabId {
  const i = Math.max(0, Math.min(BOTTOM_NAV_TAB_COUNT - 1, Math.round(index)));
  return BOTTOM_NAV_TAB_ORDER[i]!;
}

/** لوحة المؤشر النشط — كبسولة مستطيلة خلف التبويب المحدد */
export const BOTTOM_NAV_INDICATOR_WIDTH = 56;
export const BOTTOM_NAV_INDICATOR_HEIGHT = 38;
/** @deprecated استخدم العرض للمحاذاة الأفقية */
export const BOTTOM_NAV_INDICATOR_SIZE = BOTTOM_NAV_INDICATOR_WIDTH;

/** مسافة اختيارية لآخر عنصر عند التمرير — لا تُقصّ منطقة المحتوى */
export const NAV_SCROLL_PADDING_CSS_VAR = "--retweet-nav-scroll-padding";
export const NAV_SCROLL_PADDING_DEFAULT =
  "calc(4.75rem + max(12px, env(safe-area-inset-bottom, 0px)))";

export const NAV_FLOAT_INSET_CSS_VAR = "--retweet-nav-float-inset";
export const NAV_FLOAT_INSET_DEFAULT =
  "calc(3.5rem + max(12px, env(safe-area-inset-bottom, 0px)))";
