import { memo } from "react";

/** أيقونة الريلز — مربع مستدير + مثلث تشغيل */
export const InstagramReelsIcon = memo(function InstagramReelsIcon({
  className = "h-6 w-6 shrink-0",
  strokeWidth = 2,
  size,
}: {
  className?: string;
  strokeWidth?: number;
  size?: number;
}) {
  const dim = size != null ? { width: size, height: size } : {};

  return (
    <svg
      {...dim}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="5.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <path
        d="M 9.5 8.5 L 9.5 15.5 L 15.5 12 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
});
