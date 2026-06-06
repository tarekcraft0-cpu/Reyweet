import { createContext, useContext } from "react";

export type AppUiState = {
  accountSwitching: boolean;
  accountSessionKey: string;
  unreadMessageCount: number;
  /** جلب أولي من الخادم قيد التنفيذ — لعرض هيكل تحميل بدل فراغ */
  remoteHydrating: boolean;
};

export const AppUiCtx = createContext<AppUiState | null>(null);

export function useAppUi(): AppUiState {
  const ctx = useContext(AppUiCtx);
  if (!ctx) throw new Error("useAppUi داخل AppProvider فقط");
  return ctx;
}

export function useAccountSwitching(): boolean {
  return useContext(AppUiCtx)?.accountSwitching ?? false;
}

export function useAccountSessionKey(): string {
  return useContext(AppUiCtx)?.accountSessionKey ?? "sess-guest-0";
}

export function useUnreadMessageCount(): number {
  return useContext(AppUiCtx)?.unreadMessageCount ?? 0;
}

export function useRemoteHydrating(): boolean {
  return useContext(AppUiCtx)?.remoteHydrating ?? false;
}
