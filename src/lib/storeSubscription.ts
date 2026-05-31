import { createContext } from "react";
import type { AppState } from "./types";

export type StoreApi = {
  getState: () => AppState;
  subscribe: (listener: () => void) => () => void;
  /** للـ profiling — يزداد مع كل commit لـ state */
  getRevision: () => number;
};

export const StoreApiCtx = createContext<StoreApi | null>(null);
