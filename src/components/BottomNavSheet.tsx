import type { ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { useBottomNavSheet } from "@/hooks/useBottomNavSheet";
import { BottomNavDragContext } from "@/lib/bottomNavDragContext";

type Props = {
  initialHidden: boolean;
  onPersistHidden: (hidden: boolean) => void;
  children: ReactNode;
};

export function BottomNavSheet({ initialHidden, onPersistHidden, children }: Props) {
  const { navRef, navStyle, hideProgress, isMostlyHidden, shouldSuppressTap, dragHandlers } =
    useBottomNavSheet(initialHidden, onPersistHidden);

  return (
    <BottomNavDragContext.Provider value={{ shouldSuppressTap }}>
      <nav
        dir="ltr"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
      >
        <div
          ref={navRef}
          className="pointer-events-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-zinc-200/90 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.12)] dark:border-zinc-700 dark:bg-zinc-900"
          style={navStyle}
          aria-label={isMostlyHidden ? "شريط التنقل — اسحب للأعلى" : "شريط التنقل — اسحب للأسفل للإخفاء"}
        >
          <div
            className="flex touch-none select-none cursor-grab flex-col items-center justify-center gap-0.5 px-2 pt-2.5 pb-1 active:cursor-grabbing"
            {...dragHandlers}
          >
            <span
              role="presentation"
              className="h-1 w-10 shrink-0 rounded-full bg-zinc-300/90 dark:bg-zinc-600"
              style={{ opacity: 1 - hideProgress * 0.25 }}
            />
            <ChevronUp
              size={16}
              strokeWidth={2.25}
              className={
                "text-zinc-500 transition-all duration-200 dark:text-zinc-400 " +
                (isMostlyHidden ? "opacity-100" : "h-0 opacity-0")
              }
              aria-hidden={!isMostlyHidden}
            />
          </div>
          <div className="flex h-[4.25rem] flex-row items-center justify-around px-1 pb-0.5">
            {children}
          </div>
        </div>
      </nav>
    </BottomNavDragContext.Provider>
  );
}
