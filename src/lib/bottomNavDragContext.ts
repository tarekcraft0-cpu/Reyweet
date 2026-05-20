import { createContext, useContext } from "react";

export type BottomNavDragContextValue = {
  shouldSuppressTap: () => boolean;
};

export const BottomNavDragContext = createContext<BottomNavDragContextValue>({
  shouldSuppressTap: () => false,
});

export function useBottomNavDragContext() {
  return useContext(BottomNavDragContext);
}
