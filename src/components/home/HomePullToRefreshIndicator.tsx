import { memo } from "react";

type Props = {
  pullPx: number;
  refreshing: boolean;
};

/** مؤشر سحب للتحديث — دائرة دوّارة بأسلوب iOS */
export const HomePullToRefreshIndicator = memo(function HomePullToRefreshIndicator({
  pullPx,
  refreshing,
}: Props) {
  const visible = refreshing || pullPx > 6;
  if (!visible) return null;

  const progress = refreshing ? 1 : Math.min(1, pullPx / 56);
  const height = refreshing ? 44 : Math.max(28, pullPx * 0.55);
  const spinDeg = refreshing ? undefined : pullPx * 3.2;

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden transition-[height] duration-150 ease-out"
      style={{ height }}
      role="status"
      aria-live="polite"
      aria-busy={refreshing}
      aria-label={refreshing ? "جاري تحديث الخلاصة" : "اسحب للتحديث"}
    >
      <div
        className={
          "retweet-ios-pull-spinner h-7 w-7 rounded-full border-[2.5px] border-muted-foreground/20 border-t-primary " +
          (refreshing ? "opacity-100" : "")
        }
        style={
          refreshing
            ? undefined
            : {
                transform: `rotate(${spinDeg}deg) scale(${0.35 + progress * 0.65})`,
                opacity: 0.35 + progress * 0.65,
              }
        }
      />
    </div>
  );
});
