import { createContext, useContext } from "react";
import type { PagerTab } from "@/components/MainTabPager";

export const TabActiveContext = createContext<PagerTab>("home");

export function useTabActive() {
  return useContext(TabActiveContext);
}

export function useIsTabActive(tab: PagerTab) {
  return useTabActive() === tab;
}
