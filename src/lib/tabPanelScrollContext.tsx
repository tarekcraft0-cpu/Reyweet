import { createContext, useContext, type RefObject } from "react";

export const TabPanelScrollContext = createContext<RefObject<HTMLElement | null> | null>(
  null,
);

export function useTabPanelScrollRef() {
  return useContext(TabPanelScrollContext);
}
