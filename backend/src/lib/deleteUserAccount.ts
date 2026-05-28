import fs from "node:fs/promises";
import path from "node:path";
import type { AppState } from "../../../src/lib/types.js";
import { DB_DIR, SNAPSHOTS_DIR } from "../config.js";
import { deleteOtpsForUser, getUserById } from "../db/engine.js";

const paths = {
  users: path.join(DB_DIR, "users.json"),
  posts: path.join(DB_DIR, "posts.json"),
  likes: path.join(DB_DIR, "likes.json"),
  follows: path.join(DB_DIR, "follows.json"),
  followRequests: path.join(DB_DIR, "follow_requests.json"),
  stories: path.join(DB_DIR, "stories.json"),
  messages: path.join(DB_DIR, "messages.json"),
};

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

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
  const tmp = `${file}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** يحذف حساب المستخدم من قاعدة البيانات (متطلب App Store 5.1.1). */
export async function deleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await getUserById(userId);
  if (!user) return { ok: false, error: "not found", status: 404 };

  const usersMap = await readJson<Record<string, unknown>>(paths.users, {});
  if (!usersMap[userId]) return { ok: false, error: "not found", status: 404 };
  delete usersMap[userId];
  await writeJsonAtomic(paths.users, usersMap);

  const postsMap = await readJson<Record<string, { userId?: string; likes?: string[] }>>(
    paths.posts,
    {},
  );
  for (const [id, p] of Object.entries(postsMap)) {
    if (p.userId === userId) {
      delete postsMap[id];
      continue;
    }
    if (Array.isArray(p.likes)) p.likes = p.likes.filter(uid => uid !== userId);
  }
  await writeJsonAtomic(paths.posts, postsMap);

  const likes = await readJson<{ userId?: string }[]>(paths.likes, []);
  await writeJsonAtomic(
    paths.likes,
    likes.filter(l => l.userId !== userId),
  );

  const follows = await readJson<{ followerId?: string; followeeId?: string }[]>(
    paths.follows,
    [],
  );
  await writeJsonAtomic(
    paths.follows,
    follows.filter(f => f.followerId !== userId && f.followeeId !== userId),
  );

  const followReq = await readJson<{ fromUserId?: string; toUserId?: string }[]>(
    paths.followRequests,
    [],
  );
  await writeJsonAtomic(
    paths.followRequests,
    followReq.filter(f => f.fromUserId !== userId && f.toUserId !== userId),
  );

  const storiesMap = await readJson<
    Record<string, { userId?: string; viewedByUserIds?: string[] }>
  >(paths.stories, {});
  for (const [id, s] of Object.entries(storiesMap)) {
    if (s.userId === userId) delete storiesMap[id];
    else if (Array.isArray(s.viewedByUserIds)) {
      s.viewedByUserIds = s.viewedByUserIds.filter(uid => uid !== userId);
    }
  }
  await writeJsonAtomic(paths.stories, storiesMap);

  const messagesMap = await readJson<Record<string, { senderId?: string }>>(
    paths.messages,
    {},
  );
  for (const [id, m] of Object.entries(messagesMap)) {
    if (m.senderId === userId) delete messagesMap[id];
  }
  await writeJsonAtomic(paths.messages, messagesMap);

  await purgeUserSnapshots(userId);

  for (const purpose of [
    "login",
    "password_reset",
    "password_reset_link",
    "signup",
    "appeal",
  ] as const) {
    await deleteOtpsForUser(userId, purpose);
  }

  return { ok: true };
}

async function purgeUserSnapshots(removedId: string): Promise<void> {
  try {
    await fs.unlink(path.join(SNAPSHOTS_DIR, `${removedId}.json`));
  } catch {
    /* ignore */
  }
  let files: string[];
  try {
    files = await fs.readdir(SNAPSHOTS_DIR);
  } catch {
    return;
  }
  for (const f of files) {
    if (!f.endsWith(".json") || f === `${removedId}.json`) continue;
    const file = path.join(SNAPSHOTS_DIR, f);
    let state: AppState;
    try {
      state = JSON.parse(await fs.readFile(file, "utf8")) as AppState;
    } catch {
      continue;
    }
    const before = (state.users || []).length;
    state.users = (state.users || [])
      .filter(u => u.id !== removedId)
      .map(u => ({
        ...u,
        followers: (u.followers || []).filter(id => id !== removedId),
        following: (u.following || []).filter(id => id !== removedId),
      }));
    state.posts = (state.posts || [])
      .filter(p => p.userId !== removedId)
      .map(p => ({
        ...p,
        likes: (p.likes || []).filter(id => id !== removedId),
        comments: (p.comments || []).filter(c => c.userId !== removedId),
      }));
    state.chats = (state.chats || [])
      .map(c => ({
        ...c,
        members: (c.members || []).filter(id => id !== removedId),
        messages: (c.messages || []).filter(m => m.senderId !== removedId),
      }))
      .filter(c => (c.members || []).length > 0);
    if (state.currentUserId === removedId) state.currentUserId = null;
    if ((state.users || []).length !== before || state.currentUserId === null) {
      await writeJsonAtomic(file, state);
    }
  }
}
