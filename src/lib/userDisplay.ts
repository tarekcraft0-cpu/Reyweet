import type { User } from "./types";
import { displayNameFromUsername } from "./rsocialUi";

/** الاسم المعروض (مثل إنستغرام) — يختلف عن @username */
export function userDisplayName(u: Pick<User, "username" | "displayName">): string {
  const dn = u.displayName?.trim();
  if (dn) return dn;
  return displayNameFromUsername(u.username);
}
