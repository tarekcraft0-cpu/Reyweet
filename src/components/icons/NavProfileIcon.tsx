import { memo } from "react";

/** أيقونة الملف — عند التفعيل: دائرة بيضاء + صورة ظل (كما في الشريط المرجعي) */
export const NavProfileIcon = memo(function NavProfileIcon({
  active = false,
  size = 24,
  strokeWidth = 2,
  className = "",
}: {
  active?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const cls = ("shrink-0 " + className).trim();

  if (!active) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={cls}
        aria-hidden
      >
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth={strokeWidth} />
        <path
          d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cls}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" fill="currentColor" />
      <circle cx="12" cy="9.5" r="3.25" fill="rgba(120,120,120,0.95)" />
      <path
        d="M7.5 18.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"
        fill="rgba(120,120,120,0.95)"
      />
    </svg>
  );
});
