import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { isPlatformAdmin } from "../lib/verificationAdmin.js";
import { isFcmConfigured, sendPushToUser } from "../lib/fcmAdmin.js";
import {
  listPushTokensForUser,
  removePushToken,
  upsertPushToken,
  type PushPlatform,
} from "../db/pushTokens.js";

type AuthedReq = Request & { userId: string };

const registerSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["ios", "android", "web"]),
  deviceId: z.string().min(4).max(128).optional(),
  userId: z.string().min(1).max(128).optional(),
});

const sendSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  data: z.record(z.string()).optional(),
});

async function handleRegisterToken(req: Request, res: Response): Promise<void> {
  const authUserId = (req as AuthedReq).userId;
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة", success: false });
    return;
  }
  const userId = parsed.data.userId?.trim() || authUserId;
  if (userId !== authUserId) {
    const isAdmin = await isPlatformAdmin(authUserId);
    if (!isAdmin) {
      res.status(403).json({ error: "غير مصرح", success: false });
      return;
    }
  }
  await upsertPushToken(
    userId,
    parsed.data.token,
    parsed.data.platform as PushPlatform,
    parsed.data.deviceId,
  );
  res.json({ ok: true, success: true, userId });
}

async function handleSendNotification(req: Request, res: Response): Promise<void> {
  const callerId = (req as AuthedReq).userId;
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة", success: false });
    return;
  }
  if (!isFcmConfigured()) {
    res.status(503).json({ error: "FCM غير مُعدّ على الخادم", success: false });
    return;
  }

  const targetId = parsed.data.userId?.trim() || callerId;
  const isAdmin = await isPlatformAdmin(callerId);
  if (targetId !== callerId && !isAdmin) {
    res.status(403).json({ error: "غير مصرح بإرسال إشعار لمستخدم آخر", success: false });
    return;
  }

  const tokens = await listPushTokensForUser(targetId);
  if (!tokens.length) {
    res.status(404).json({
      error: "لا يوجد FCM token مسجّل لهذا المستخدم",
      success: false,
      noTokens: true,
    });
    return;
  }

  const data: Record<string, string> = {
    ...(parsed.data.data ?? {}),
    type: parsed.data.data?.type || "CUSTOM",
  };
  const result = await sendPushToUser(targetId, parsed.data.title, parsed.data.body, data);
  if (result.noTokens) {
    res.status(404).json({ error: "لا يوجد token", success: false, noTokens: true });
    return;
  }
  res.json({
    ok: true,
    success: result.sent > 0,
    sent: result.sent,
    failed: result.failed,
    tokenCount: tokens.length,
  });
}

export function registerPushRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/v1/push/status", authMiddleware, (_req, res) => {
    return res.json({
      configured: isFcmConfigured(),
      store: (process.env.PUSH_TOKEN_STORE || "file").trim(),
    });
  });

  app.post("/v1/push/register", authMiddleware, handleRegisterToken);
  app.post("/save-token", authMiddleware, handleRegisterToken);

  app.delete("/v1/push/register", authMiddleware, async (req, res) => {
    const parsed = z.object({ token: z.string().min(20).max(4096) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "رمز غير صالح" });
    await removePushToken(parsed.data.token);
    return res.json({ ok: true, success: true });
  });

  app.post("/v1/push/send", authMiddleware, handleSendNotification);
  app.post("/send-notification", authMiddleware, handleSendNotification);
}
