import { memo, useId } from "react";

const TRIANGLE =
  "M 6.25 4.75 H 17.75 C 20.75 4.75 21.35 5.5 19.85 8.25 L 13.75 19.25 C 12.5 21.25 11.5 21.25 10.25 19.25 L 4.15 8.25 C 2.65 5.5 3.25 4.75 6.25 4.75 Z";

/**
 * أيقونة المراسلة — مثلث مقلوب + خط قطري داخل الحدود
 */
export const DirectMessagesNavIcon = memo(function DirectMessagesNavIcon({
  className = "h-[26px] w-[26px] shrink-0",
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  const clipId = useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <path d={TRIANGLE} />
        </clipPath>
      </defs>

      <path
        d={TRIANGLE}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <g clipPath={`url(#${clipId})`}>
        <path
          d="M 7.75 13.75 L 18.1 7.15"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
});
