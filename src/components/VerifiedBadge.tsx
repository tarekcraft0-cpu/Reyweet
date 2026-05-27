import { useId } from "react";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";
import { isVerifiedBadgeActive } from "@/lib/verificationEntitlements";

/**
 * شارة توثيق إنستغرام: شكل وردة بثماني زوايا، زرقاء صلبة.
 */
const IG_BLUE = "#0095F6";
const IG_PINK = "#FF2D55";

export function verificationBadgeHex(color?: "blue" | "pink"): string {
  return color === "pink" ? IG_PINK : IG_BLUE;
}

const SEAL_PATH =
  "M 12 1 Q 15.444 3.685 19.778 4.222 Q 20.315 8.556 23 12 Q 20.315 15.444 19.778 19.778 Q 15.444 20.315 12 23 Q 8.556 20.315 4.222 19.778 Q 3.685 15.444 1 12 Q 3.685 8.556 4.222 4.222 Q 8.556 3.685 12 1 Z";

export function VerifiedBadge({
  size = 16,
  className = "",
  title = "موثّق",
  color = "blue",
}: {
  size?: number;
  className?: string;
  title?: string;
  color?: "blue" | "pink";
}) {
  const fill = verificationBadgeHex(color);
  const { state } = useApp();
  const isDark = state.theme === "dark";
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
      <path d={SEAL_PATH} fill={fill} />
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

/** شارة مؤسس التطبيق (@t) — ذهبية فاخرة مع تدرج وحلقة خارجية */
export function FounderVerifiedBadge({
  size = 16,
  className = "",
  title = "حساب رسمي — مؤسس التطبيق",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gMain = `founder-g-${uid}`;
  const gRing = `founder-r-${uid}`;
  const gShine = `founder-s-${uid}`;
  const fGlow = `founder-f-${uid}`;

  const seal =
    "M12 1.8 L14.9 3.1 L17.8 2.4 L19.1 5.3 L22 6.6 L21.3 9.5 L23.2 12 L21.3 14.5 L22 17.4 L19.1 18.7 L17.8 21.6 L14.9 20.9 L12 22.2 L9.1 20.9 L6.2 21.6 L4.9 18.7 L2 17.4 L2.7 14.5 L0.8 12 L2.7 9.5 L2 6.6 L4.9 5.3 L6.2 2.4 L9.1 3.1 Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={"shrink-0 inline-block align-middle drop-shadow-sm " + className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={gMain} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF8DC" />
          <stop offset="28%" stopColor="#F7D774" />
          <stop offset="55%" stopColor="#E8B020" />
          <stop offset="82%" stopColor="#C8860A" />
          <stop offset="100%" stopColor="#8B5E00" />
        </linearGradient>
        <linearGradient id={gRing} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE9A8" />
          <stop offset="100%" stopColor="#6B4500" />
        </linearGradient>
        <linearGradient id={gShine} x1="6" y1="4" x2="14" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={fGlow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.65" floodColor="#E8B020" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter={`url(#${fGlow})`}>
        <path d={seal} fill={`url(#${gRing})`} opacity="0.95" transform="scale(1.06) translate(-0.72 -0.72)" />
        <path d={seal} fill={`url(#${gMain})`} stroke="#5C3D00" strokeWidth="0.35" />
        <path d={seal} fill={`url(#${gShine})`} />
        <circle cx="12" cy="12" r="5.15" fill="#1a1408" fillOpacity="0.22" />
        <path
          d="M8.1 12.15 L10.85 14.75 L15.95 9.25"
          fill="none"
          stroke="#FFFBF0"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.1 12.15 L10.85 14.75 L15.95 9.25"
          fill="none"
          stroke="#5C3D00"
          strokeWidth="0.45"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.35"
        />
      </g>
    </svg>
  );
}

/** شارة حساب التطبيق الرسمي — بنفسجي متدرج */
export function AppOfficialVerifiedBadge({
  size = 16,
  className = "",
  title = "حساب التطبيق الرسمي",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const g = `app-official-g-${uid}`;

  const seal =
    "M12 1.8 L14.9 3.1 L17.8 2.4 L19.1 5.3 L22 6.6 L21.3 9.5 L23.2 12 L21.3 14.5 L22 17.4 L19.1 18.7 L17.8 21.6 L14.9 20.9 L12 22.2 L9.1 20.9 L6.2 21.6 L4.9 18.7 L2 17.4 L2.7 14.5 L0.8 12 L2.7 9.5 L2 6.6 L4.9 5.3 L6.2 2.4 L9.1 3.1 Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={"shrink-0 inline-block align-middle drop-shadow-sm " + className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={g} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="45%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <path d={seal} fill={`url(#${g})`} stroke="#312E81" strokeWidth="0.35" />
      <path
        d="M8.1 12.15 L10.85 14.75 L15.95 9.25"
        fill="none"
        stroke="#EEF2FF"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** شارة التوثيق — مؤسس → تطبيق رسمي → توثيق أزرق */
export function VerifiedMarkForUser({
  user,
  size = 16,
  className,
}: {
  user: Pick<
    User,
    "id" | "verified" | "founderVerified" | "appOfficialVerified" | "verificationBadgeColor"
  >;
  size?: number;
  className?: string;
}) {
  if (user.founderVerified) {
    return <FounderVerifiedBadge size={size} className={className} title="منشئ التطبيق — الحساب الرسمي" />;
  }
  if (user.appOfficialVerified) {
    return <AppOfficialVerifiedBadge size={size} className={className} title="حساب التطبيق الرسمي" />;
  }
  if (!isVerifiedBadgeActive(user)) return null;
  const color = user.verificationBadgeColor === "pink" ? "pink" : "blue";
  return <VerifiedBadge size={size} className={className} color={color} />;
}
