import fs from "node:fs/promises";
import path from "node:path";
import { DB_DIR } from "../config.js";

export type PushPlatform = "ios" | "android" | "web";

export type PushTokenRow = {
  token: string;
  userId: string;
  platform: PushPlatform;
  updatedAt: string;
};

const FILE = path.join(DB_DIR, "push_tokens.json");
const MAX_TOKENS_PER_USER = 8;

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

async function readAll(): Promise<PushTokenRow[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as PushTokenRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(rows: PushTokenRow[]): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

export async function upsertPushToken(
  userId: string,
  token: string,
  platform: PushPlatform,
): Promise<void> {
  const t = token.trim();
  if (!t || t.length > 4096) return;
  const now = new Date().toISOString();
  await withLock(async () => {
    const all = await readAll();
    const withoutDup = all.filter(row => row.token !== t);
    const forUser = withoutDup.filter(row => row.userId === userId);
    const others = withoutDup.filter(row => row.userId !== userId);
    const nextForUser: PushTokenRow[] = [
      { token: t, userId, platform, updatedAt: now },
      ...forUser,
    ].slice(0, MAX_TOKENS_PER_USER);
    await writeAll([...others, ...nextForUser]);
  });
}

export async function removePushToken(token: string): Promise<void> {
  const t = token.trim();
  if (!t) return;
  await withLock(async () => {
    const all = await readAll();
    const next = all.filter(row => row.token !== t);
    if (next.length !== all.length) await writeAll(next);
  });
}

export async function listPushTokensForUser(userId: string): Promise<PushTokenRow[]> {
  const all = await readAll();
  return all.filter(row => row.userId === userId);
}

export async function removePushTokens(tokens: string[]): Promise<void> {
  const set = new Set(tokens.map(t => t.trim()).filter(Boolean));
  if (!set.size) return;
  await withLock(async () => {
    const all = await readAll();
    const next = all.filter(row => !set.has(row.token));
    if (next.length !== all.length) await writeAll(next);
  });
}
