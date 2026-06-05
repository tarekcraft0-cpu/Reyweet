import fs from "node:fs/promises";
import path from "node:path";
import type { AppState } from "../../../src/lib/types.js";
import { DB_DIR, SNAPSHOTS_DIR } from "../config.js";
import { listReelsByUserId } from "../db/reels.js";
import { deleteReelRow } from "../db/reels.js";
import { deleteReelFiles } from "./reelsService.js";
import { invalidateBannedUserCache } from "./bannedUserCache.js";

const paths = {
  posts: path.join(DB_DIR, "posts.json"),
  likes: path.join(DB_DIR, "likes.json"),
  follows: path.join(DB_DIR, "follows.json"),
  followRequests: path.join(DB_DIR, "follow_requests.json"),
  stories: path.join(DB_DIR, "stories.json"),
  messages: path.join(DB_DIR, "messages.json"),
  reelLikes: path.join(DB_DIR, "reel_likes.json"),
  reelComments: path.join(DB_DIR, "reel_comments.json"),
  reelViews: path.join(DB_DIR, "reel_views.json"),
};

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

function rowTouchesUser(row: unknown, userId: string, fields: string[]): boolean {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return fields.some(f => r[f] === userId);
}

async function filterJsonRowsByUserFields(
  file: string,
  userId: string,
  fields: string[],
): Promise<void> {
  const raw = await readJson<unknown>(file, []);
  if (Array.isArray(raw)) {
    await writeJsonAtomic(
      file,
      raw.filter(row => !rowTouchesUser(row, userId, fields)),
    );
    return;
  }
  if (raw && typeof raw === "object") {
    const next: Record<string, unknown> = {};
    for (const [id, row] of Object.entries(raw as Record<string, unknown>)) {
      if (!rowTouchesUser(row, userId, fields)) next[id] = row;
    }
    await writeJsonAtomic(file, next);
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
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
    state.stories = (state.stories || []).filter(st => st.userId !== removedId);
    state.chats = (state.chats || [])
      .map(c => ({
        ...c,
        members: (c.members || []).filter(id => id !== removedId),
      }))
      .filter(c => (c.members || []).length > 0);
    if (state.currentUserId === removedId) state.currentUserId = null;
    if ((state.users || []).length !== before || state.currentUserId === null) {
      await writeJsonAtomic(file, state);
    }
  }
}

/** يحذف كل محتوى المستخدم العام (تغريدات، قصص، ريلز، رسائل) دون حذف سجل الحساب */
export async function purgeUserPublicContent(userId: string): Promise<void> {
  const postsMap = await readJson<Record<string, { userId?: string; likes?: string[] }>>(
    paths.posts,
    {},
  );
  const deletedPostIds = new Set<string>();
  for (const [id, p] of Object.entries(postsMap)) {
    if (!p || typeof p !== "object") {
      delete postsMap[id];
      continue;
    }
    if (p.userId === userId) {
      delete postsMap[id];
      deletedPostIds.add(id);
      continue;
    }
    if (Array.isArray(p.likes)) p.likes = p.likes.filter(uid => uid !== userId);
  }
  await writeJsonAtomic(paths.posts, postsMap);

  await filterJsonRowsByUserFields(paths.likes, userId, ["userId"]);
  await filterJsonRowsByUserFields(paths.follows, userId, ["followerId", "followeeId"]);
  await filterJsonRowsByUserFields(paths.followRequests, userId, ["fromUserId", "toUserId"]);

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

  /** الرسائل الخاصة تُخفى عند التسليم ولا تُحذف — لاستعادتها بعد رفع الحظر */

  const reels = await listReelsByUserId(userId, 500);
  for (const reel of reels) {
    try {
      await deleteReelFiles(reel);
    } catch {
      /* ignore */
    }
    await deleteReelRow(reel.id);
    if (reel.postId) deletedPostIds.add(reel.postId);
  }

  await filterJsonRowsByUserFields(paths.reelLikes, userId, ["userId"]);
  await filterJsonRowsByUserFields(paths.reelComments, userId, ["userId"]);
  await filterJsonRowsByUserFields(paths.reelViews, userId, ["userId"]);

  await purgeUserSnapshots(userId);
  invalidateBannedUserCache();
}
