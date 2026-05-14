import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";

/**
 * شارة توثيق إنستغرام: شكل وردة بثماني زوايا، زرقاء صلبة.
 * علامة الص داخل الشارة: بيضاء في الوضع الصباحي/الفاتح، داكنة في الوضع الليلي/الداكن لقراءة أوضح.
 */
const IG_BLUE = "#0095F6";

const SEAL_PATH =
  "M 12 1 Q 15.444 3.685 19.778 4.222 Q 20.315 8.556 23 12 Q 20.315 15.444 19.778 19.778 Q 15.444 20.315 12 23 Q 8.556 20.315 4.222 19.778 Q 3.685 15.444 1 12 Q 3.685 8.556 4.222 4.222 Q 8.556 3.685 12 1 Z";

export function VerifiedBadge({
  size = 16,
  className = "",
  title = "موثّق",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const { state } = useApp();
  const isDark = state.theme === "dark";
  /** فاتح: أبيض على الأزرق — داكن: تقريباً أسود للتباين مع الواجهة الداكنة */
  const checkStroke = isDark ? "#0d0d0d" : "#ffffff";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={"shrink-0 inline-block align-middle " + className}
      role="img"
      aria-label={title}
    >
      <path d={SEAL_PATH} fill={IG_BLUE} />
      <path
        d="M7.15 12.05 L10.55 15.35 L16.85 8.65"
        fill="none"
        stroke={checkStroke}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** يعرض شارة التوثيق الزرقاء للحسابات الموثّقة */
export function VerifiedMarkForUser({
  user,
  size = 16,
  className,
}: {
  user: Pick<User, "id" | "verified">;
  size?: number;
  className?: string;
}) {
  if (!user.verified) return null;
  return <VerifiedBadge size={size} className={className} />;
}
