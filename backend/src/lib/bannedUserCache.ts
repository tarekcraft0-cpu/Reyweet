import path from "node:path";
import fs from "node:fs/promises";
import { DATA_ROOT } from "../config.js";
import type { AccountStatus } from "../../../src/lib/moderationTypes.js";

function isBannedStatus(status: AccountStatus): boolean {
  return status === "BANNED" || status === "TEMP_BANNED" || status === "PERMANENTLY_BANNED";
}

const USER_STATES_FILE = path.join(DATA_ROOT, "moderation", "user_states.json");

type UserStatesDb = {
  users: Record<
    string,
    {
      userId: string;
      accountStatus: AccountStatus;
    }
  >;
};

const bannedIds = new Set<string>();
let loadedAt = 0;
const TTL_MS = 30_000;

async function refresh(): Promise<void> {
  const now = Date.now();
  if (loadedAt && now - loadedAt < TTL_MS) return;
  bannedIds.clear();
  try {
    const raw = (await fs.readFile(USER_STATES_FILE, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!raw) {
      loadedAt = now;
      return;
    }
    const db = JSON.parse(raw) as UserStatesDb;
    for (const st of Object.values(db.users ?? {})) {
      if (st?.userId && isBannedStatus(st.accountStatus)) bannedIds.add(st.userId);
    }
  } catch {
    /* ignore */
  }
  loadedAt = now;
}

export function invalidateBannedUserCache(): void {
  loadedAt = 0;
}

export async function ensureBannedUserCacheLoaded(): Promise<void> {
  await refresh();
}

export async function isUserIdBanned(userId: string): Promise<boolean> {
  await refresh();
  return bannedIds.has(userId);
}

export async function getBannedUserIdSet(): Promise<Set<string>> {
  await refresh();
  return new Set(bannedIds);
}

export function isUserIdBannedSync(userId: string): boolean {
  return bannedIds.has(userId);
}
