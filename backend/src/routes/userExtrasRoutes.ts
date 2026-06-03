import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  appendLoginHistory,
  getUserExtras,
  listSavedPostIds,
  removeScheduledPost,
  setScheduledPosts,
  setTimeManagement,
  toggleSavedPost,
  upsertScheduledPost,
  type ScheduledPostRow,
} from "../lib/userExtrasStore.js";

type AuthedReq = Request & { userId: string };

export function registerUserExtrasRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/v1/me/saved", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const savedPostIds = await listSavedPostIds(userId);
    return res.json({ ok: true, savedPostIds });
  });

  app.post("/v1/me/saved/:postId/toggle", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const postId = String(req.params.postId ?? "").trim();
    if (!postId) return res.status(400).json({ error: "postId مطلوب" });
    const result = await toggleSavedPost(userId, postId);
    return res.json({ ok: true, ...result });
  });

  app.get("/v1/me/scheduled-posts", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const row = await getUserExtras(userId);
    return res.json({
      ok: true,
      scheduledPosts: row.scheduledPosts.filter(p => !p.published),
    });
  });

  const scheduledSchema = z.object({
    id: z.string().optional(),
    text: z.string().max(2000),
    image: z.string().max(2_000_000).optional(),
    type: z.enum(["post", "tweet"]).optional(),
    publishAt: z.string().min(1),
  });

  app.post("/v1/me/scheduled-posts", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = scheduledSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
    const publishAt = new Date(parsed.data.publishAt);
    if (Number.isNaN(publishAt.getTime()) || publishAt.getTime() < Date.now() - 60_000) {
      return res.status(400).json({ error: "وقت النشر يجب أن يكون في المستقبل" });
    }
    const item = await upsertScheduledPost(userId, {
      id: parsed.data.id,
      text: parsed.data.text.trim(),
      image: parsed.data.image,
      type: parsed.data.type ?? "post",
      publishAt: publishAt.toISOString(),
    });
    return res.json({ ok: true, scheduledPost: item });
  });

  app.delete("/v1/me/scheduled-posts/:id", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id مطلوب" });
    await removeScheduledPost(userId, id);
    return res.json({ ok: true });
  });

  app.put("/v1/me/scheduled-posts/sync", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = z
      .object({
        items: z.array(scheduledSchema),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
    const items: ScheduledPostRow[] = parsed.data.items
      .map((it, i) => {
        const publishAt = new Date(it.publishAt);
        if (Number.isNaN(publishAt.getTime())) return null;
        return {
          id: it.id || `sched-sync-${i}-${Date.now()}`,
          text: it.text.trim(),
          image: it.image,
          type: it.type ?? "post",
          publishAt: publishAt.toISOString(),
          createdAt: new Date().toISOString(),
          published: false,
        } satisfies ScheduledPostRow;
      })
      .filter((x): x is ScheduledPostRow => !!x);
    const scheduledPosts = await setScheduledPosts(userId, items);
    return res.json({ ok: true, scheduledPosts: scheduledPosts.filter(p => !p.published) });
  });

  app.get("/v1/me/login-history", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const row = await getUserExtras(userId);
    return res.json({ ok: true, loginHistory: row.loginHistory });
  });

  app.get("/v1/me/time-management", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const row = await getUserExtras(userId);
    return res.json({ ok: true, timeManagement: row.timeManagement });
  });

  app.put("/v1/me/time-management", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = z
      .object({
        dailyLimitMinutes: z.number().int().min(0).max(1440).optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().max(8).optional(),
        quietHoursEnd: z.string().max(8).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
    const timeManagement = await setTimeManagement(userId, parsed.data);
    return res.json({ ok: true, timeManagement });
  });
}

export function recordLoginEvent(
  userId: string,
  req: Request,
  success: boolean,
  deviceLabel?: string,
): void {
  const ip =
    (typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
      : req.socket.remoteAddress) || undefined;
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  void appendLoginHistory(userId, { success, ip, userAgent, deviceLabel }).catch(() => undefined);
}
