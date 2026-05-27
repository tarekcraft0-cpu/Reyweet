import { useCallback, useRef, type ReactNode } from "react";
import { useBottomNavSheet } from "@/hooks/useBottomNavSheet";
import { BottomNavDragContext } from "@/lib/bottomNavDragContext";
import { BOTTOM_NAV_TAB_COUNT } from "@/lib/bottomNavConfig";
import { BottomNavTabRow } from "./BottomNavTabRow";

type Props = {
  progressIndex: number;
  onSelectTabIndex: (index: number) => void;
  /** أثناء سحب خروج المحادثة — التقدّم يُكتب في NAV_HIDE_PROGRESS_CSS_VAR */
  externalHideDrive?: boolean;
  children: ReactNode;
};

/** كبسولة زجاجية عائمة */
const IG_GLASS_PILL =
  "pointer-events-auto isolate w-full overflow-hidden rounded-[22px] " +
  "border border-white/12 bg-[rgba(30,30,30,0.48)] shadow-[0_6px_28px_rgba(0,0,0,0.2)] " +
  "backdrop-blur-[24px] backdrop-saturate-[1.5] [-webkit-backdrop-filter:blur(24px)_saturate(1.5)] " +
  "supports-[backdrop-filter]:bg-[rgba(30,30,30,0.3)]";

export function BottomNavSheet({
  progressIndex,
  onSelectTabIndex,
  externalHideDrive = false,
  children,
}: Props) {
  const tabSuppressRef = useRef<() => boolean>(() => false);

  const { navRef, navStyle, shouldSuppressTap } = useBottomNavSheet({
    externalHideDrive,
  });

  const combinedSuppress = useCallback(
    () => shouldSuppressTap() || tabSuppressRef.current(),
    [shouldSuppressTap],
  );

  return (
    <BottomNavDragContext.Provider value={{ shouldSuppressTap: combinedSuppress }}>
      <div
        data-floating-nav-host
        dir="ltr"
        role="navigation"
        aria-label="شريط التنقل"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] mx-auto flex w-full max-w-md justify-center px-4"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div ref={navRef} data-no-tab-swipe className={IG_GLASS_PILL} style={navStyle}>
          <BottomNavTabRow
            progressIndex={progressIndex}
            tabCount={BOTTOM_NAV_TAB_COUNT}
            onSelectIndex={onSelectTabIndex}
            shouldSuppressTap={shouldSuppressTap}
            onSuppressTapChange={fn => {
              tabSuppressRef.current = fn;
            }}
          >
            {children}
          </BottomNavTabRow>
        </div>
      </div>
    </BottomNavDragContext.Provider>
  );
}
