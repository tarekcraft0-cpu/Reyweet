import type { User } from "./types";
import { searchVerifiedBoostRank } from "./verificationEntitlements";

/** ترتيب نتائج البحث — المطابقة أولاً ثم أولوية الموثّقين */
export function rankUsersBySearchQuery(users: User[], query: string): User[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  const rank = (u: User) => {
    const un = u.username.toLowerCase();
    const em = (u.email || "").toLowerCase();
    const dn = (u.displayName || "").toLowerCase();
    if (un === q) return 0;
    if (un.startsWith(q)) return 1;
    if (dn === q || dn.startsWith(q)) return 2;
    if (em === q || em.startsWith(q)) return 3;
    if (un.includes(q)) return 4;
    if (dn.includes(q)) return 5;
    if (em.includes(q)) return 6;
    return 7;
  };
  return [...users].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const vb = searchVerifiedBoostRank(b) - searchVerifiedBoostRank(a);
    if (vb !== 0) return vb;
    return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  });
}

/** ترتيب موجز لقائمة موثّقين */
export function sortUsersVerifiedFirst(users: User[]): User[] {
  return [...users].sort(
    (a, b) => searchVerifiedBoostRank(b) - searchVerifiedBoostRank(a),
  );
}
