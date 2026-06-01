import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MEDIA_VIDEOS_DIR, REELS_THUMBNAILS_DIR, REELS_UPLOAD_DIR } from "../config.js";
import {
  addReelComment,
  createReel,
  deleteReelRow,
  getReelById,
  listReelCommentsPaginated,
  recordReelView,
  toggleReelLike,
  userLikedReel,
} from "../db/reels.js";
import { deletePost, getUserById } from "../db/engine.js";
import { compressAndSaveReelVideo } from "../lib/reelTranscode.js";
import {
  buildReelsFeedForViewer,
  deleteReelFiles,
  migratePostsToReelsStore,
  reelRowToPublic,
  syncReelPostMirror,
} from "../lib/reelsService.js";

type AuthedReq = Request & { userId: string };

const uploadReel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const commentSchema = z.object({
  text: z.string().min(1).max(2200),
});

const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
]);

function registerReelsHandlers(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
  prefix: string,
): void {
  app.get(`${prefix}`, authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const scope = String(req.query.scope ?? "all");
    const followingOnly = scope === "friends" || scope === "following";

    try {
      const feed = await buildReelsFeedForViewer(userId, { limit, cursor, followingOnly });
      return res.json(feed);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[reels] feed", e);
      return res.status(500).json({ error: "تعذر تحميل الريلز" });
    }
  });

  app.post(`${prefix}/upload`, authMiddleware, uploadReel.single("file"), async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "no file" });

    const mime = (file.mimetype || "").toLowerCase();
    if (!mime.startsWith("video/") && !ALLOWED_VIDEO_MIME.has(mime)) {
      return res.status(400).json({ error: "نوع الملف غير مدعوم — استخدم MP4 أو MOV" });
    }

    const caption =
      typeof req.body?.caption === "string"
        ? req.body.caption.trim().slice(0, 2200)
        : typeof req.body?.text === "string"
          ? req.body.text.trim().slice(0, 2200)
          : "";

    const tmpDir = path.join(MEDIA_VIDEOS_DIR, "_tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const ext =
      mime.includes("quicktime") || mime.includes("mov")
        ? "mov"
        : mime.includes("webm")
          ? "webm"
          : "mp4";
    const tmpIn = path.join(tmpDir, `${randomUUID()}.${ext}`);

    try {
      await fs.writeFile(tmpIn, file.buffer);
      const { url, posterUrl } = await compressAndSaveReelVideo(tmpIn, "uploads");
      const reel = await createReel({
        userId,
        videoUrl: url,
        thumbnailUrl: posterUrl,
        caption,
      });
      await syncReelPostMirror(reel);
      const likedByMe = await userLikedReel(reel.id, userId);
      return res.status(201).json({ reel: reelRowToPublic(reel, likedByMe) });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[reels] upload", e);
      return res.status(500).json({ error: "تعذر معالجة الفيديو" });
    } finally {
      await fs.unlink(tmpIn).catch(() => undefined);
    }
  });

  app.post(`${prefix}/:id/view`, authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const reelId = String(req.params.id || "");
    try {
      const result = await recordReelView(reelId, userId);
      return res.json(result);
    } catch {
      return res.status(404).json({ error: "not found" });
    }
  });

  app.post(`${prefix}/:id/like`, authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const reelId = String(req.params.id || "");
    try {
      const result = await toggleReelLike(reelId, userId);
      return res.json(result);
    } catch {
      return res.status(404).json({ error: "not found" });
    }
  });

  app.post(`${prefix}/:id/comment`, authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const reelId = String(req.params.id || "");
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "تعليق غير صالح" });
    try {
      const result = await addReelComment(reelId, userId, parsed.data.text);
      const author = await getUserById(userId);
      return res.json({
        comment: {
          id: result.comment.id,
          userId: result.comment.userId,
          text: result.comment.text,
          createdAt: Date.parse(result.comment.createdAt) || Date.now(),
          username: author?.username,
          avatar: author?.avatar,
        },
        commentsCount: result.commentsCount,
      });
    } catch {
      return res.status(404).json({ error: "not found" });
    }
  });

  app.get(`${prefix}/:id/comments`, authMiddleware, async (req, res) => {
    const reelId = String(req.params.id || "");
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const reel = await getReelById(reelId);
    if (!reel) return res.status(404).json({ error: "not found" });

    const { comments, hasMore, nextCursor } = await listReelCommentsPaginated(reelId, {
      limit,
      before: cursor,
    });
    const users = await Promise.all(comments.map(c => getUserById(c.userId)));
    return res.json({
      comments: comments.map((c, i) => ({
        id: c.id,
        userId: c.userId,
        text: c.text,
        createdAt: Date.parse(c.createdAt) || Date.now(),
        username: users[i]?.username,
        avatar: users[i]?.avatar,
      })),
      hasMore,
      nextCursor,
    });
  });

  app.delete(`${prefix}/:id`, authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const reelId = String(req.params.id || "");
    const reel = await getReelById(reelId);
    if (!reel) return res.status(404).json({ error: "not found" });
    if (reel.userId !== userId) return res.status(403).json({ error: "غير مسموح" });

    await deleteReelFiles(reel);
    await deleteReelRow(reelId);
    try {
      await deletePost(reel.postId ?? reelId);
    } catch {
      /* post may already be gone */
    }
    return res.json({ ok: true });
  });
}

export function registerReelsRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
): void {
  registerReelsHandlers(app, authMiddleware, "/v1/reels");
  /** توافق مع مواصفات /api/reels */
  registerReelsHandlers(app, authMiddleware, "/api/reels");
}

export async function initReelsSubsystem(): Promise<void> {
  await fs.mkdir(REELS_UPLOAD_DIR, { recursive: true });
  await fs.mkdir(REELS_THUMBNAILS_DIR, { recursive: true });
  const { initReelsDatabase } = await import("../db/reels.js");
  await initReelsDatabase();
  try {
    await migratePostsToReelsStore();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[reels] migratePostsToReelsStore failed (server continues):", e);
  }
  try {
    const { cleanupStaleReels } = await import("../lib/seedDemoContent.js");
    const removed = await cleanupStaleReels();
    if (removed > 0) {
      // eslint-disable-next-line no-console
      console.log(`[reels] removed ${removed} stale/spam reel(s)`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[reels] cleanupStaleReels failed:", e);
  }
}
