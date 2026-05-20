import { PAGER_TAB_CHAIN, type PagerTab } from "@/components/MainTabPager";

/** @deprecated استخدم MainTabPager — يُبقى للتوافق */
export const SWIPE_TAB_CHAIN = PAGER_TAB_CHAIN;
export type SwipeTab = PagerTab;

/** @deprecated التنقل التفاعلي عبر MainTabPager في App.tsx */
export function useMainTabSwipe(_activeTab: string, _enabled: boolean, _onTab: (tab: SwipeTab) => void) {
  /* no-op */
}
