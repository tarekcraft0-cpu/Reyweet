import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DB_DIR, SNAPSHOTS_DIR } from "../config.js";

/** مستخدم في قاعدة البيانات المحلية */
export type UserRow = {
  id: string;
  email: string;
  phone?: string;
  username: string;
  displayName?: string;
  passwordHash: string;
  googleId?: string;
  avatar: string;
  bio: string;
  appTheme: "light" | "dark";
  appLanguage: "ar" | "en";
  createdAt: string;
  updatedAt: string;
  verified?: boolean;
  founderVerified?: boolean;
  founderOfficialLabel?: string;
  profileLink?: string;
  note?: string;
  officialSiteUrl?: string;
  /** حساب خاص — يؤثر على طلبات المراسلة */
  isPrivate?: boolean;
};

export type PostRow = {
  id: string;
  userId: string;
  type: string;
  text: string;
  image?: string;
  video?: string;
  likes: string[];
  reposts: string[];
  createdAt: string;
  updatedAt: string;
};

export type LikeRow = { postId: string; userId: string; createdAt: string };
export type FollowRow = { followerId: string; followeeId: string; createdAt: string };
export type FollowRequestRow = { fromId: string; toId: string; createdAt: string };
export type StoryRow = {
  id: string;
  userId: string;
  image: string;
  video?: string;
  createdAt: number;
  audience: "all" | "close";
  stickers?: unknown[];
  likes?: string[];
  viewedByUserIds?: string[];
};

export type OtpRow = {
  userId: string;
  purpose: string;
  codeHash: string;
  expiresAt: string;
};

/** رسالة دردشة محفوظة بشكل دائم على القرص D */
export type MessageRow = {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string | null;
  type: string;
  content: string;
  createdAt: string;
  extrasJson?: Record<string, unknown>;
};

type CollectionName =
  | "users"
  | "posts"
  | "likes"
  | "follows"
  | "followRequests"
  | "stories"
  | "otp"
  | "messages";

const filePaths: Record<CollectionName, string> = {
  users: path.join(DB_DIR, "users.json"),
  posts: path.join(DB_DIR, "posts.json"),
  likes: path.join(DB_DIR, "likes.json"),
  follows: path.join(DB_DIR, "follows.json"),
  followRequests: path.join(DB_DIR, "follow_requests.json"),
  stories: path.join(DB_DIR, "stories.json"),
  otp: path.join(DB_DIR, "otp.json"),
  messages: path.join(DB_DIR, "messages.json"),
};

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  locks.set(
    key,
    prev.then(() => gate),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === gate) locks.delete(key);
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    let raw = await fs.readFile(file, "utf8");
    raw = raw.replace(/^\uFEFF/, "").trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (attempt < 5 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      try {
        await fs.copyFile(tmp, file);
        await fs.unlink(tmp).catch(() => undefined);
        return;
      } catch {
        throw e;
      }
    }
  }
}

export async function initDatabase(): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  for (const f of Object.values(filePaths)) {
    try {
      await fs.access(f);
    } catch {
      const name = path.basename(f, ".json") as CollectionName;
      const empty =
        name === "users" || name === "posts" || name === "messages"
          ? {}
          : [];
      await writeJsonAtomic(f, empty);
    }
  }
}

// ——— Users ———

export async function listUsers(): Promise<UserRow[]> {
  const map = await readJson<Record<string, UserRow>>(filePaths.users, {});
  return Object.values(map);
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const map = await readJson<Record<string, UserRow>>(filePaths.users, {});
  return map[id] ?? null;
}

export async function findUserByEmailOrUsername(
  identifier: string,
): Promise<UserRow | null> {
  const q = identifier.trim().toLowerCase();
  const users = await listUsers();
  return (
    users.find(u => u.email.toLowerCase() === q) ||
    users.find(u => u.username.toLowerCase() === q) ||
    null
  );
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const q = username.trim().toLowerCase();
  if (!q) return null;
  const users = await listUsers();
  return users.find(u => u.username.toLowerCase() === q) ?? null;
}

export async function findUserByGoogleId(googleId: string): Promise<UserRow | null> {
  const users = await listUsers();
  return users.find(u => u.googleId === googleId) ?? null;
}

export async function createUser(
  data: Omit<UserRow, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<UserRow> {
  return withLock("users", async () => {
    const map = await readJson<Record<string, UserRow>>(filePaths.users, {});
    const now = new Date().toISOString();
    const user: UserRow = {
      id: data.id ?? randomUUID(),
      email: data.email,
      username: data.username,
      displayName: data.displayName?.trim() || undefined,
      passwordHash: data.passwordHash,
      googleId: data.googleId,
      avatar: data.avatar,
      bio: data.bio ?? "",
      appTheme: data.appTheme ?? "light",
      appLanguage: data.appLanguage ?? "ar",
      isPrivate: data.isPrivate === true,
      verified: data.verified === true,
      founderVerified: data.founderVerified === true,
      founderOfficialLabel: data.founderOfficialLabel,
      profileLink: data.profileLink,
      note: data.note,
      phone: data.phone,
      officialSiteUrl: data.officialSiteUrl,
      createdAt: now,
      updatedAt: now,
    };
    map[user.id] = user;
    await writeJsonAtomic(filePaths.users, map);
    return user;
  });
}

export async function updateUser(
  id: string,
  patch: Partial<Omit<UserRow, "id" | "createdAt">>,
): Promise<UserRow | null> {
  return withLock("users", async () => {
    const map = await readJson<Record<string, UserRow>>(filePaths.users, {});
    const cur = map[id];
    if (!cur) return null;
    const next: UserRow = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    map[id] = next;
    await writeJsonAtomic(filePaths.users, map);
    return next;
  });
}

export async function usernameExists(username: string, excludeId?: string): Promise<boolean> {
  const u = username.trim().toLowerCase();
  const { isReservedShortUsername } = await import("../lib/shortUsernameAccounts.js");
  if (isReservedShortUsername(u, excludeId)) return true;
  const users = await listUsers();
  return users.some(x => x.id !== excludeId && x.username.toLowerCase() === u);
}

/** بحث جزئي عن حسابات (يوزر، إيميل، جوال) — أحدث التسجيلات أولاً عند التعادل */
export async function searchUsers(query: string, limit = 40): Promise<UserRow[]> {
  const q = query.trim().toLowerCase();
  if (!q || q.length > 64) return [];
  const phoneQ = q.replace(/\D/g, "");
  const users = await listUsers();
  const matched = users.filter(u => {
    const un = u.username.toLowerCase();
    const em = u.email.toLowerCase();
    const ph = (u.phone || "").replace(/\D/g, "");
    return (
      un.includes(q) ||
      em.includes(q) ||
      (phoneQ.length >= 3 && ph.includes(phoneQ))
    );
  });
  matched.sort((a, b) => {
    const au = a.username.toLowerCase();
    const bu = b.username.toLowerCase();
    const ad = (a.displayName || "").toLowerCase();
    const bd = (b.displayName || "").toLowerCase();
    const rank = (un: string, dn: string) => {
      if (un === q) return 0;
      if (un.startsWith(q)) return 1;
      if (dn === q || dn.startsWith(q)) return 2;
      if (un.includes(q)) return 4;
      if (dn.includes(q)) return 5;
      return 6;
    };
    const ra = rank(au, ad);
    const rb = rank(bu, bd);
    if (ra !== rb) return ra - rb;
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    if (tb !== ta) return tb - ta;
    return au.localeCompare(bu);
  });
  return matched.slice(0, Math.min(80, Math.max(1, limit)));
}

/** أحدث الحسابات المسجّلة (قراءة مباشرة من users.json في كل طلب) */
export async function listRecentUsers(limit = 30): Promise<UserRow[]> {
  const users = await listUsers();
  return users
    .slice()
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    .slice(0, Math.min(80, Math.max(1, limit)));
}

// ——— Posts ———

export async function listPosts(): Promise<PostRow[]> {
  const map = await readJson<Record<string, PostRow>>(filePaths.posts, {});
  return Object.values(map);
}

export async function upsertPost(row: PostRow): Promise<void> {
  return withLock("posts", async () => {
    const map = await readJson<Record<string, PostRow>>(filePaths.posts, {});
    map[row.id] = { ...row, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(filePaths.posts, map);
  });
}

// ——— Likes (جدول منفصل + مصفوفة داخل المنشور) ———

export async function listLikes(): Promise<LikeRow[]> {
  return readJson<LikeRow[]>(filePaths.likes, []);
}

export async function replaceLikesForPost(postId: string, userIds: string[]): Promise<void> {
  return withLock("likes", async () => {
    const all = await readJson<LikeRow[]>(filePaths.likes, []);
    const now = new Date().toISOString();
    const rest = all.filter(l => l.postId !== postId);
    const added = userIds.map(userId => ({ postId, userId, createdAt: now }));
    await writeJsonAtomic(filePaths.likes, [...rest, ...added]);
  });
}

// ——— Follows ———

export async function listFollows(): Promise<FollowRow[]> {
  return withLock("follows", async () => readJson<FollowRow[]>(filePaths.follows, []));
}

export async function replaceFollows(rows: FollowRow[]): Promise<void> {
  return withLock("follows", async () => {
    await writeJsonAtomic(filePaths.follows, rows);
  });
}

export async function listFollowRequests(): Promise<FollowRequestRow[]> {
  return withLock("followRequests", async () => readJson<FollowRequestRow[]>(filePaths.followRequests, []));
}

export async function replaceFollowRequests(rows: FollowRequestRow[]): Promise<void> {
  return withLock("followRequests", async () => {
    await writeJsonAtomic(filePaths.followRequests, rows);
  });
}

export async function listStories(): Promise<StoryRow[]> {
  return readJson<StoryRow[]>(filePaths.stories, []);
}

export async function replaceStories(rows: StoryRow[]): Promise<void> {
  return withLock("stories", async () => {
    await writeJsonAtomic(filePaths.stories, rows);
  });
}

// ——— OTP ———

export async function deleteOtpsForUser(userId: string, purpose: string): Promise<void> {
  return withLock("otp", async () => {
    const all = await readJson<OtpRow[]>(filePaths.otp, []);
    await writeJsonAtomic(
      filePaths.otp,
      all.filter(o => !(o.userId === userId && o.purpose === purpose)),
    );
  });
}

export async function createOtp(row: OtpRow): Promise<void> {
  return withLock("otp", async () => {
    const all = await readJson<OtpRow[]>(filePaths.otp, []);
    const filtered = all.filter(o => !(o.userId === row.userId && o.purpose === row.purpose));
    filtered.push(row);
    await writeJsonAtomic(filePaths.otp, filtered);
  });
}

export async function findLatestOtp(userId: string, purpose: string): Promise<OtpRow | null> {
  const all = await readJson<OtpRow[]>(filePaths.otp, []);
  const matches = all
    .filter(o => o.userId === userId && o.purpose === purpose)
    .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  return matches[0] ?? null;
}

// ——— App snapshots (لقطة JSON كاملة للتطبيق) ———

export async function getSnapshot(userId: string): Promise<unknown | null> {
  const file = path.join(SNAPSHOTS_DIR, `${userId}.json`);
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw e;
  }
}

export async function setSnapshot(userId: string, state: unknown): Promise<void> {
  const file = path.join(SNAPSHOTS_DIR, `${userId}.json`);
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  await writeJsonAtomic(file, state);
}

// ——— Chat messages (messages.json) ———

async function readMessagesMap(): Promise<Record<string, MessageRow>> {
  return readJson<Record<string, MessageRow>>(filePaths.messages, {});
}

export async function upsertMessage(row: MessageRow): Promise<MessageRow> {
  return withLock("messages", async () => {
    const map = await readMessagesMap();
    map[row.id] = row;
    await writeJsonAtomic(filePaths.messages, map);
    return row;
  });
}

export async function getMessageById(id: string): Promise<MessageRow | null> {
  const map = await readMessagesMap();
  return map[id] ?? null;
}

export async function listMessagesByChatId(chatId: string): Promise<MessageRow[]> {
  const map = await readMessagesMap();
  return Object.values(map)
    .filter(m => m.chatId === chatId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listMessagesByChatIds(
  chatIds: string[],
): Promise<Map<string, MessageRow[]>> {
  const set = new Set(chatIds);
  const map = await readMessagesMap();
  const out = new Map<string, MessageRow[]>();
  for (const row of Object.values(map)) {
    if (!set.has(row.chatId)) continue;
    const list = out.get(row.chatId) ?? [];
    list.push(row);
    out.set(row.chatId, list);
  }
  for (const [chatId, list] of out) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    out.set(chatId, list);
  }
  return out;
}

export async function upsertMessagesBatch(rows: MessageRow[]): Promise<void> {
  if (rows.length === 0) return;
  return withLock("messages", async () => {
    const map = await readMessagesMap();
    for (const row of rows) map[row.id] = row;
    await writeJsonAtomic(filePaths.messages, map);
  });
}

/** رسائل يشارك فيها المستخدم (مرسل أو مستقبل) */
export async function listMessagesForUser(userId: string): Promise<MessageRow[]> {
  const map = await readMessagesMap();
  return Object.values(map)
    .filter(m => m.senderId === userId || m.receiverId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
