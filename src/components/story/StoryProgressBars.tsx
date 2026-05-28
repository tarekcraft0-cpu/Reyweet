import { memo } from "react";

type Seg = { id: string };

type Props = {
  segments: Seg[];
  activeIndex: number;
  /** 0..1 للشريط النشط */
  progress: number;
};

export const StoryProgressBars = memo(function StoryProgressBars({
  segments,
  activeIndex,
  progress,
}: Props) {
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <div className="flex gap-1 p-2 shrink-0" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      {segments.map((seg, idx) => (
        <div key={seg.id} className="flex-1 h-[2px] bg-white/35 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full will-change-[width]"
            style={{
              width:
                idx < activeIndex ? "100%" : idx === activeIndex ? `${pct}%` : "0%",
            }}
          />
        </div>
      ))}
    </div>
  );
});
