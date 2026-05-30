import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatTimelineRow } from "@/lib/chatDmTheme";

type Props = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  rows: ChatTimelineRow[];
  visible: boolean;
  chromeOnWallpaper?: boolean;
  dayPillBg?: string;
  dayPillText?: string;
};

/**
 * شارة تاريخ عائمة أثناء التمرير — نمط Instagram Direct.
 */
export function ChatFloatingDatePill({
  scrollRef,
  rows,
  visible,
  chromeOnWallpaper,
  dayPillBg,
  dayPillText,
}: Props) {
  const [label, setLabel] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const hideTimerRef = useRef(0);
  const scrollingRef = useRef(false);

  const dayRows = useRef<{ key: string; label: string }[]>([]);
  dayRows.current = rows
    .filter((r): r is Extract<ChatTimelineRow, { kind: "day" }> => r.kind === "day")
    .map(r => ({ key: r.key, label: r.label }));

  const refreshLabel = useCallback(() => {
    const root = scrollRef.current;
    if (!root || !visible) return;
    const tops = dayRows.current
      .map(d => {
        const el = root.querySelector(`[data-chat-day="${d.key}"]`);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        return { label: d.label, top: rect.top - rootRect.top };
      })
      .filter((x): x is { label: string; top: number } => x != null)
      .sort((a, b) => a.top - b.top);

    if (!tops.length) return;
    const anchor = 72;
    let picked = tops[0]!.label;
    for (const t of tops) {
      if (t.top <= anchor) picked = t.label;
      else break;
    }
    setLabel(picked);
    setShow(true);
    scrollingRef.current = true;
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      scrollingRef.current = false;
      setShow(false);
    }, 900);
  }, [scrollRef, visible]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !visible) return;
    const onScroll = () => refreshLabel();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [scrollRef, visible, refreshLabel]);

  if (!visible || !label) return null;

  return (
    <div
      className={
        "pointer-events-none absolute start-0 end-0 top-2 z-30 flex justify-center transition-opacity duration-300 " +
        (show || scrollingRef.current ? "opacity-100" : "opacity-0")
      }
      aria-hidden
    >
      <span
        className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold shadow-md backdrop-blur-md"
        style={
          chromeOnWallpaper
            ? { backgroundColor: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.92)" }
            : dayPillBg
              ? { backgroundColor: dayPillBg, color: dayPillText }
              : { backgroundColor: "var(--secondary)", color: "var(--foreground)" }
        }
      >
        {label}
      </span>
    </div>
  );
}
