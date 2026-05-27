import { createContext } from "react";

/** سياق لغة الواجهة — منفصل عن store لتجنب Vite HMR invalidation */
export const AppLanguageCtx = createContext<"ar" | "en">("ar");
