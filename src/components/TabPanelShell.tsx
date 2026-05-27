import { useRef, type ReactNode } from "react";
import { TabPanelScrollContext } from "@/lib/tabPanelScrollContext";

/** منطقة تمرير التبويب — تمتد حتى أسفل الشاشة (المحتوى يمر تحت الشريط العائم) */
export function TabPanelShell({
  children,
  lockScroll = false,
  fullHeight = false,
  /** ريلز: الخلفية السوداء من الشاشة نفسها */
  chrome = "app",
}: {
  children: ReactNode;
  lockScroll?: boolean;
  fullHeight?: boolean;
  chrome?: "app" | "reels";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chromeClass =
    chrome === "reels" ? "min-h-full" : "min-h-full bg-background";

  return (
    <TabPanelScrollContext.Provider value={scrollRef}>
      <div
        ref={scrollRef}
        className={
          "retweet-no-select-pane select-none tab-panel-scroll tab-panel-immersive flex h-full min-h-0 w-full flex-1 flex-col overflow-x-hidden " +
          chromeClass +
          " " +
          (lockScroll
            ? "overflow-hidden"
            : "no-scrollbar overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]")
        }
        style={fullHeight ? { height: "100%", minHeight: 0 } : undefined}
      >
        {children}
      </div>
    </TabPanelScrollContext.Provider>
  );
}
