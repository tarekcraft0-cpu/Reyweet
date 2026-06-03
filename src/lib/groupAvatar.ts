import type { ID, User } from "./types";

/** لا يوجد أفتار مرفوع — نعرض الافتراضي المقسّم */
export function isCustomGroupAvatar(avatar?: string): boolean {
  const a = (avatar || "").trim();
  if (!a || a === "👥" || a === "📢") return false;
  if (a.startsWith("data:") || a.startsWith("/") || /^https?:\/\//i.test(a)) return true;
  if (a.length > 4) return true;
  return false;
}

function hashChatId(chatId: string): number {
  let h = 0;
  for (let i = 0; i < chatId.length; i++) h = (h * 31 + chatId.charCodeAt(i)) >>> 0;
  return h;
}

/** يمين: أول عضو (ثابت) — يسار: عضو آخر ثابت حسب معرّف القروب */
export function pickGroupSplitMembers(
  chatId: string,
  memberUsers: Pick<User, "id" | "username" | "avatar">[],
  viewerId?: ID,
): [Pick<User, "id" | "username" | "avatar">, Pick<User, "id" | "username" | "avatar">] | null {
  const pool = memberUsers.filter(u => u?.id && u.id !== viewerId);
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const right = sorted[0]!;
  if (sorted.length === 1) return [right, right];
  const others = sorted.filter(u => u.id !== right.id);
  const left = others[hashChatId(chatId) % others.length]!;
  return [right, left];
}
