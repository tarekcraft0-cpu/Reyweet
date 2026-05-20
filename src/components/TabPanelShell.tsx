import type { ReactNode } from "react";

/** يضمن ارتفاعاً فعلياً للتبويب — يمنع الشاشة البيضاء عند flex-1 بدون ارتفاع أب */
export function TabPanelShell({
  children,
  lockScroll = false,
}: {
  children: ReactNode;
  lockScroll?: boolean;
}) {
  return (
    <div
      className={
        "flex w-full min-h-0 flex-1 flex-col overflow-x-hidden " +
        (lockScroll
          ? "overflow-hidden"
          : "overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]")
      }
      style={{
        minHeight:
          "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 5.25rem)",
      }}
    >
      {children}
    </div>
  );
}
