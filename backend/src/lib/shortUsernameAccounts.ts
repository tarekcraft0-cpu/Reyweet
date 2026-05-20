const FOUNDER_ACCOUNT_ID = "u_founder_tareqf";

function envUserId(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export const SHORT_USERNAME_BY_USER_ID: Record<string, string> = {
  [FOUNDER_ACCOUNT_ID]: "t",
  "5d658fe5-bd19-4b4d-be92-a1e0e755215b": "7",
  "65b49544-03f5-46dc-8697-eb08c4cc9fcd": "l",
  "863b808b-0c26-4d9f-b1c5-b9b586e31d44": "1",
  "beb31b7a-1aa8-4268-b299-35aaf1d0de5f": "m",
  ...(envUserId("SHORT_USERNAME_1_USER_ID") ? { [envUserId("SHORT_USERNAME_1_USER_ID")!]: "1" } : {}),
  ...(envUserId("SHORT_USERNAME_M_USER_ID") ? { [envUserId("SHORT_USERNAME_M_USER_ID")!]: "m" } : {}),
};

export const RESERVED_SHORT_USERNAMES = new Set(
  Object.values(SHORT_USERNAME_BY_USER_ID).map(s => s.toLowerCase()),
);

export const PRIVILEGED_AVATAR_USER_IDS = new Set<string>([
  ...Object.keys(SHORT_USERNAME_BY_USER_ID),
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isShortUsernameException(username: string, userId?: string): boolean {
  if (!userId) return false;
  const allowed = SHORT_USERNAME_BY_USER_ID[userId];
  const norm = username.trim().toLowerCase();
  return !!allowed && norm === allowed;
}

export function isReservedShortUsername(username: string, exceptUserId?: string): boolean {
  const norm = normalizeUsername(username);
  if (!RESERVED_SHORT_USERNAMES.has(norm)) return false;
  for (const [id, allowed] of Object.entries(SHORT_USERNAME_BY_USER_ID)) {
    if (allowed === norm) return exceptUserId !== id;
  }
  return true;
}

export function getUserIdForReservedShortUsername(username: string): string | undefined {
  const norm = normalizeUsername(username);
  for (const [id, allowed] of Object.entries(SHORT_USERNAME_BY_USER_ID)) {
    if (allowed === norm) return id;
  }
  return undefined;
}
