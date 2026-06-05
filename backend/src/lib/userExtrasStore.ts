import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DB_DIR } from "../config.js";

export type ScheduledPostRow = {
  id: string;
  text: string;
  image?: string;
  type: "post" | "tweet";
  publishAt: string;
  createdAt: string;
  published?: boolean;
};

export type LoginHistoryRow = {
  at: string;
  success: boolean;
  ip?: string;
  userAgent?: string;
  deviceLabel?: string;
};

export type TimeManagementPrefs = {
  dailyLimitMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type UserExtrasRow = {
  savedPostIds: string[];
  scheduledPosts: ScheduledPostRow[];
  loginHistory: LoginHistoryRow[];
  timeManagement: TimeManagementPrefs;
};

const FILE = path.join(DB_DIR, "user_extras.json");
const MAX_SAVED = 500;
const MAX_HISTORY = 40;
const MAX_SCHEDULED = 50;

const DEFAULT_TIME: TimeManagementPrefs = {
  dailyLimitMinutes: 0,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};

type Store = Record<string, UserExtrasRow>;

let lock: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  lock = new Promise<void>(r => {
    release = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim() || "{}") as unknown;
    const { decodeStoredJson } = await import("./encryptedStorage.js");
    const store = decodeStoredJson<Store>(parsed, FILE);
    return store && typeof store === "object" ? store : {};
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeStore(data: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const { encodeStoredJson } = await import("./encryptedStorage.js");
  const tmp = `${FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(encodeStoredJson(FILE, data)), "utf8");
  await fs.rename(tmp, FILE);
}

function defaultRow(): UserExtrasRow {
  return {
    savedPostIds: [],
    scheduledPosts: [],
    loginHistory: [],
    timeManagement: { ...DEFAULT_TIME },
  };
}

export async function getUserExtras(userId: string): Promise<UserExtrasRow> {
  const store = await readStore();
  return store[userId] ?? defaultRow();
}

async function updateUserExtras(
  userId: string,
  fn: (row: UserExtrasRow) => UserExtrasRow,
): Promise<UserExtrasRow> {
  return withLock(async () => {
    const store = await readStore();
    const prev = store[userId] ?? defaultRow();
    const next = fn(prev);
    store[userId] = next;
    await writeStore(store);
    return next;
  });
}

export async function toggleSavedPost(
  userId: string,
  postId: string,
): Promise<{ saved: boolean; savedPostIds: string[] }> {
  const row = await updateUserExtras(userId, prev => {
    const set = new Set(prev.savedPostIds);
    let saved: boolean;
    if (set.has(postId)) {
      set.delete(postId);
      saved = false;
    } else {
      set.add(postId);
      saved = true;
    }
    return {
      ...prev,
      savedPostIds: [...set].slice(-MAX_SAVED),
    };
  });
  return {
    saved: row.savedPostIds.includes(postId),
    savedPostIds: row.savedPostIds,
  };
}

export async function listSavedPostIds(userId: string): Promise<string[]> {
  return (await getUserExtras(userId)).savedPostIds;
}

export async function setScheduledPosts(
  userId: string,
  items: ScheduledPostRow[],
): Promise<ScheduledPostRow[]> {
  const row = await updateUserExtras(userId, prev => ({
    ...prev,
    scheduledPosts: items.slice(0, MAX_SCHEDULED),
  }));
  return row.scheduledPosts;
}

export async function upsertScheduledPost(
  userId: string,
  draft: Omit<ScheduledPostRow, "id" | "createdAt" | "published"> & { id?: string },
): Promise<ScheduledPostRow> {
  const item: ScheduledPostRow = {
    id: draft.id || `sched-${randomUUID()}`,
    text: draft.text,
    image: draft.image,
    type: draft.type,
    publishAt: draft.publishAt,
    createdAt: new Date().toISOString(),
    published: false,
  };
  await updateUserExtras(userId, prev => {
    const list = prev.scheduledPosts.filter(p => p.id !== item.id);
    list.push(item);
    list.sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    return { ...prev, scheduledPosts: list.slice(0, MAX_SCHEDULED) };
  });
  return item;
}

export async function removeScheduledPost(userId: string, id: string): Promise<void> {
  await updateUserExtras(userId, prev => ({
    ...prev,
    scheduledPosts: prev.scheduledPosts.filter(p => p.id !== id),
  }));
}

export async function appendLoginHistory(
  userId: string,
  entry: Omit<LoginHistoryRow, "at"> & { at?: string },
): Promise<void> {
  await updateUserExtras(userId, prev => {
    const row: LoginHistoryRow = {
      at: entry.at ?? new Date().toISOString(),
      success: entry.success,
      ip: entry.ip,
      userAgent: entry.userAgent?.slice(0, 280),
      deviceLabel: entry.deviceLabel?.slice(0, 120),
    };
    return {
      ...prev,
      loginHistory: [row, ...prev.loginHistory].slice(0, MAX_HISTORY),
    };
  });
}

export async function setTimeManagement(
  userId: string,
  prefs: Partial<TimeManagementPrefs>,
): Promise<TimeManagementPrefs> {
  const row = await updateUserExtras(userId, prev => ({
    ...prev,
    timeManagement: {
      ...prev.timeManagement,
      ...prefs,
      dailyLimitMinutes: Math.max(0, Math.min(24 * 60, Number(prefs.dailyLimitMinutes ?? prev.timeManagement.dailyLimitMinutes) || 0)),
    },
  }));
  return row.timeManagement;
}

export async function listDueScheduledPosts(now = Date.now()): Promise<
  Array<{ userId: string; post: ScheduledPostRow }>
> {
  const store = await readStore();
  const due: Array<{ userId: string; post: ScheduledPostRow }> = [];
  const isoNow = new Date(now).toISOString();
  for (const [userId, row] of Object.entries(store)) {
    for (const p of row.scheduledPosts) {
      if (!p.published && p.publishAt <= isoNow) {
        due.push({ userId, post: p });
      }
    }
  }
  return due;
}

export async function markScheduledPublished(userId: string, id: string): Promise<void> {
  await updateUserExtras(userId, prev => ({
    ...prev,
    scheduledPosts: prev.scheduledPosts.map(p =>
      p.id === id ? { ...p, published: true } : p,
    ),
  }));
}
