/** ألوان ومساعدات واجهة R Social (مطابقة للموكب) */
export const RS_ACCENT = "#5AC8D8";
export const RS_BADGE = "#0A84FF";
export const RS_PAGE_BG = "#F2F2F7";

const PASTEL_AVATARS: { bg: string; color: string }[] = [
  { bg: "#F3E8FF", color: "#7C3AED" },
  { bg: "#E0F2FE", color: "#0284C7" },
  { bg: "#FCE7F3", color: "#DB2777" },
  { bg: "#D1FAE5", color: "#059669" },
  { bg: "#FEF3C7", color: "#D97706" },
  { bg: "#EDE9FE", color: "#6D28D9" },
];

export function displayNameFromUsername(username: string): string {
  const base = username.replace(/^@/, "").trim();
  if (!base) return "?";
  return base
    .split(/[._-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function pastelAvatarColors(seed: string): { bg: string; color: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 31) | 0;
  return PASTEL_AVATARS[Math.abs(h) % PASTEL_AVATARS.length]!;
}

export function formatChatListTime(createdAt: number): string {
  const diff = Math.max(0, Date.now() - createdAt);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try {
    return new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function formatTrendPostCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M posts`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K posts`;
  return `${n} posts`;
}
