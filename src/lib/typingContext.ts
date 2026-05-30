import { createContext, useContext } from "react";
import type { ID } from "./types";

/** مؤشرات «يكتب الآن» — سياق منفصل لتجنّب إعادة رسم التطبيق كله */
export const TypingCtx = createContext<Record<ID, ID>>({});

export function useTypingUsers(): Record<ID, ID> {
  return useContext(TypingCtx);
}
