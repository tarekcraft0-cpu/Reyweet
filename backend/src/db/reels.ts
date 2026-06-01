import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DB_DIR } from "../config.js";

/** بيانات الريل — لا يُخزَّن الفيديو هنا، فقط الروابط */
export type ReelRow = {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  updatedAt: string;
  /** مزامنة مع posts.json للتوافق مع الميزات القديمة */
  postId?: string;
};

export type ReelCommentRow = {
  id: string;
  reelId: string;
  userId: string;
  text: string;
  createdAt: string;
};

export type ReelLikeRow = {
  reelId: string;
  userId: string;
  createdAt: string;
};

const HIDDEN_REEL_USER_IDS = new Set(["u_omar", "u_lina", "u_sara"]);
const SAMPLE_REEL_VIDEO_RE =
  /commondatastorage\.googleapis\.com\/gtv-videos-bucket\/sample/i;

export function isVisibleReelRow(row: ReelRow): boolean {
  if (HIDDEN_REEL_USER_IDS.has(row.userId)) return false;
  if (SAMPLE_REEL_VIDEO_RE.test(row.videoUrl || "")) return false;
  return true;
}

export type ReelViewRow = {
  reelId: string;
  userId: string;
  lastCountedAt: string;
};

const REELS_FILE = path.join(DB_DIR, "reels.json");
const REEL_LIKES_FILE = path.join(DB_DIR, "reel_likes.json");
const REEL_COMMENTS_FILE = path.join(DB_DIR, "reel_comments.json");
const REEL_VIEWS_FILE = path.join(DB_DIR, "reel_views.json");

const VIEW_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const locks = new Map<string, Promise<void>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  locks.set(key, prev.then(() => gate));
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
  const payload = JSON.stringify(data);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, file);
}

export async function initReelsDatabase(): Promise<void> {
  for (const f of [REELS_FILE, REEL_LIKES_FILE, REEL_COMMENTS_FILE, REEL_VIEWS_FILE]) {
    try {
      await fs.access(f);
    } catch {
      const empty =
        f === REEL_LIKES_FILE || f === REEL_VIEWS_FILE
          ? []
          : f === REEL_COMMENTS_FILE
            ? {}
            : {};
      await writeJsonAtomic(f, empty);
    }
  }
}

let reelsIndexSorted: string[] | null = null;
let reelsByIdCache: Record<string, ReelRow> | null = null;

function invalidateReelsIndex(): void {
  reelsIndexSorted = null;
  reelsByIdCache = null;
}

async function loadReelsMap(): Promise<Record<string, ReelRow>> {
  if (reelsByIdCache) return reelsByIdCache;
  reelsByIdCache = await readJson<Record<string, ReelRow>>(REELS_FILE, {});
  return reelsByIdCache;
}

async function saveReelsMap(map: Record<string, ReelRow>): Promise<void> {
  reelsByIdCache = map;
  invalidateReelsIndex();
  await writeJsonAtomic(REELS_FILE, map);
}

async function sortedReelIds(map: Record<string, ReelRow>): Promise<string[]> {
  if (reelsIndexSorted) return reelsIndexSorted;
  reelsIndexSorted = Object.values(map)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map(r => r.id);
  return reelsIndexSorted;
}

export async function getReelById(id: string): Promise<ReelRow | null> {
  const map = await loadReelsMap();
  return map[id] ?? null;
}

export async function createReel(
  input: Omit<ReelRow, "likesCount" | "commentsCount" | "viewsCount" | "createdAt" | "updatedAt"> &
    Partial<Pick<ReelRow, "id" | "likesCount" | "commentsCount" | "viewsCount">>,
): Promise<ReelRow> {
  return withLock("reels-write", async () => {
    const map = await loadReelsMap();
    const now = new Date().toISOString();
    const row: ReelRow = {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      videoUrl: input.videoUrl,
      thumbnailUrl: input.thumbnailUrl,
      caption: input.caption ?? "",
      likesCount: input.likesCount ?? 0,
      commentsCount: input.commentsCount ?? 0,
      viewsCount: input.viewsCount ?? 0,
      createdAt: now,
      updatedAt: now,
      postId: input.postId ?? input.id,
    };
    map[row.id] = row;
    await saveReelsMap(map);
    return row;
  });
}

export async function updateReel(
  id: string,
  patch: Partial<
    Pick<
      ReelRow,
      "caption" | "videoUrl" | "thumbnailUrl" | "likesCount" | "commentsCount" | "viewsCount"
    >
  >,
): Promise<ReelRow | null> {
  return withLock("reels-write", async () => {
    const map = await loadReelsMap();
    const cur = map[id];
    if (!cur) return null;
    const next: ReelRow = {
      ...cur,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    map[id] = next;
    await saveReelsMap(map);
    return next;
  });
}

export async function deleteReelRow(id: string): Promise<ReelRow | null> {
  return withLock("reels-write", async () => {
    const map = await loadReelsMap();
    const cur = map[id];
    if (!cur) return null;
    delete map[id];
    await saveReelsMap(map);

    const likes = await readJson<ReelLikeRow[]>(REEL_LIKES_FILE, []);
    await writeJsonAtomic(
      REEL_LIKES_FILE,
      likes.filter(l => l.reelId !== id),
    );

    const comments = await readJson<Record<string, ReelCommentRow>>(REEL_COMMENTS_FILE, {});
    const nextComments: Record<string, ReelCommentRow> = {};
    for (const [cid, c] of Object.entries(comments)) {
      if (c.reelId !== id) nextComments[cid] = c;
    }
    await writeJsonAtomic(REEL_COMMENTS_FILE, nextComments);

    const views = await readJson<ReelViewRow[]>(REEL_VIEWS_FILE, []);
    await writeJsonAtomic(
      REEL_VIEWS_FILE,
      views.filter(v => v.reelId !== id),
    );

    return cur;
  });
}

export async function listReelsPaginated(opts: {
  limit: number;
  before?: string;
  userIds?: Set<string>;
}): Promise<{ rows: ReelRow[]; hasMore: boolean; nextCursor?: string }> {
  const map = await loadReelsMap();
  const ids = await sortedReelIds(map);
  const limit = Math.min(50, Math.max(1, opts.limit));
  const beforeMs = opts.before ? Date.parse(opts.before) : Number.POSITIVE_INFINITY;

  const filtered: ReelRow[] = [];
  for (const id of ids) {
    const row = map[id];
    if (!row) continue;
    const createdMs = Date.parse(row.createdAt);
    if (!Number.isFinite(createdMs)) continue;
    if (Number.isFinite(beforeMs) && createdMs >= beforeMs) continue;
    if (opts.userIds && !opts.userIds.has(row.userId)) continue;
    if (!isVisibleReelRow(row)) continue;
    filtered.push(row);
    if (filtered.length >= limit + 1) break;
  }

  const hasMore = filtered.length > limit;
  const page = filtered.slice(0, limit);
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.createdAt : undefined;
  return { rows: page, hasMore, nextCursor };
}

export async function listReelsByUserId(userId: string, limit = 50): Promise<ReelRow[]> {
  const map = await loadReelsMap();
  return Object.values(map)
    .filter(r => r.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export async function userLikedReel(reelId: string, userId: string): Promise<boolean> {
  const likes = await readJson<ReelLikeRow[]>(REEL_LIKES_FILE, []);
  return likes.some(l => l.reelId === reelId && l.userId === userId);
}

export async function toggleReelLike(
  reelId: string,
  userId: string,
): Promise<{ liked: boolean; likesCount: number }> {
  return withLock("reel-likes", async () => {
    const map = await loadReelsMap();
    const reel = map[reelId];
    if (!reel) throw new Error("reel_not_found");

    const likes = await readJson<ReelLikeRow[]>(REEL_LIKES_FILE, []);
    const idx = likes.findIndex(l => l.reelId === reelId && l.userId === userId);
    let liked: boolean;
    if (idx >= 0) {
      likes.splice(idx, 1);
      liked = false;
    } else {
      likes.push({ reelId, userId, createdAt: new Date().toISOString() });
      liked = true;
    }
    await writeJsonAtomic(REEL_LIKES_FILE, likes);

    const likesCount = Math.max(0, liked ? reel.likesCount + 1 : reel.likesCount - 1);
    map[reelId] = { ...reel, likesCount, updatedAt: new Date().toISOString() };
    await saveReelsMap(map);
    return { liked, likesCount };
  });
}

export async function addReelComment(
  reelId: string,
  userId: string,
  text: string,
): Promise<{ comment: ReelCommentRow; commentsCount: number }> {
  return withLock("reel-comments", async () => {
    const map = await loadReelsMap();
    const reel = map[reelId];
    if (!reel) throw new Error("reel_not_found");

    const comments = await readJson<Record<string, ReelCommentRow>>(REEL_COMMENTS_FILE, {});
    const comment: ReelCommentRow = {
      id: randomUUID(),
      reelId,
      userId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    comments[comment.id] = comment;
    await writeJsonAtomic(REEL_COMMENTS_FILE, comments);

    const commentsCount = reel.commentsCount + 1;
    map[reelId] = { ...reel, commentsCount, updatedAt: new Date().toISOString() };
    await saveReelsMap(map);
    return { comment, commentsCount };
  });
}

export async function listReelCommentsPaginated(
  reelId: string,
  opts: { limit: number; before?: string },
): Promise<{ comments: ReelCommentRow[]; hasMore: boolean; nextCursor?: string }> {
  const all = await readJson<Record<string, ReelCommentRow>>(REEL_COMMENTS_FILE, {});
  const limit = Math.min(100, Math.max(1, opts.limit));
  const beforeMs = opts.before ? Date.parse(opts.before) : Number.POSITIVE_INFINITY;

  const rows = Object.values(all)
    .filter(c => c.reelId === reelId)
    .filter(c => Date.parse(c.createdAt) < beforeMs)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1]!.createdAt : undefined;
  return { comments: page, hasMore, nextCursor };
}

/** زيادة المشاهدات — مرة كل 4 ساعات لكل مستخدم/ريل */
export async function recordReelView(
  reelId: string,
  userId: string,
): Promise<{ counted: boolean; viewsCount: number }> {
  return withLock("reel-views", async () => {
    const map = await loadReelsMap();
    const reel = map[reelId];
    if (!reel) throw new Error("reel_not_found");

    const views = await readJson<ReelViewRow[]>(REEL_VIEWS_FILE, []);
    const now = Date.now();
    const row = views.find(v => v.reelId === reelId && v.userId === userId);
    let counted = false;
    if (!row) {
      views.push({ reelId, userId, lastCountedAt: new Date(now).toISOString() });
      counted = true;
    } else {
      const last = Date.parse(row.lastCountedAt);
      if (!Number.isFinite(last) || now - last >= VIEW_COOLDOWN_MS) {
        row.lastCountedAt = new Date(now).toISOString();
        counted = true;
      }
    }
    await writeJsonAtomic(REEL_VIEWS_FILE, views);

    if (!counted) return { counted: false, viewsCount: reel.viewsCount };

    const viewsCount = reel.viewsCount + 1;
    map[reelId] = { ...reel, viewsCount, updatedAt: new Date().toISOString() };
    await saveReelsMap(map);
    return { counted: true, viewsCount };
  });
}

export async function countReels(): Promise<number> {
  const map = await loadReelsMap();
  return Object.keys(map).length;
}
