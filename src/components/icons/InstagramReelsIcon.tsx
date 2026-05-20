import { memo } from "react";

/** أيقونة ريلز مطابقة لشكل Instagram Reels */
export const InstagramReelsIcon = memo(function InstagramReelsIcon({
  size = 24,
  className = "",
  strokeWidth = 2,
}: {
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M7.5 4.5h9A3 3 0 0 1 19.5 7.5v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M9.75 8.25v7.5l6.75-3.75-6.75-3.75Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.5}
        strokeLinejoin="round"
      />
      <path
        d="M16.5 6.75v3.75M18 7.5h-3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
});
