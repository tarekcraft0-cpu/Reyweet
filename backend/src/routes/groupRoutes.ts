import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { GroupRole } from "../../../src/lib/groupTypes.js";
import { GROUP_ROLE_PERMISSIONS } from "../../../src/lib/groupRbac.js";
import {
  banMember,
  deleteGroup,
  GroupAuthError,
  loadGroupContext,
  muteMember,
  requirePermission,
  setMemberRole,
  transferOwnership,
  updateGroupSettings,
} from "../groups/groupService.js";
import { listGroupAudit } from "../db/groupRegistry.js";

type AuthedRequest = Request & { userId: string };

function actorId(req: Request): string {
  return (req as AuthedRequest).userId;
}

function handleError(res: Response, e: unknown) {
  if (e instanceof GroupAuthError) {
    const status = e.code === "not_found" ? 404 : e.code === "bad_request" ? 400 : 403;
    return res.status(status).json({ error: e.message });
  }
  const msg = e instanceof Error ? e.message : "خطأ في الخادم";
  return res.status(500).json({ error: msg });
}

export function createGroupRouter(authMiddleware: (req: Request, res: Response, next: () => void) => void) {
  const router = Router();

  /** مصفوفة الصلاحيات للواجهة */
  router.get("/v1/groups/rbac/matrix", (_req, res) => {
    res.json({ roles: GROUP_ROLE_PERMISSIONS });
  });

  router.get("/v1/groups/:chatId", authMiddleware, async (req, res) => {
    try {
      const ctx = await loadGroupContext(String(req.params.chatId), actorId(req));
      return res.json({ group: ctx.record, chat: ctx.chat });
    } catch (e) {
      return handleError(res, e);
    }
  });

  router.get("/v1/groups/:chatId/members", authMiddleware, async (req, res) => {
    try {
      await requirePermission(String(req.params.chatId), actorId(req), "members.view_list");
      const ctx = await loadGroupContext(String(req.params.chatId), actorId(req));
      return res.json({ members: ctx.record.members });
    } catch (e) {
      return handleError(res, e);
    }
  });

  router.get("/v1/groups/:chatId/audit", authMiddleware, async (req, res) => {
    try {
      await requirePermission(String(req.params.chatId), actorId(req), "group.view_audit");
      const entries = await listGroupAudit(String(req.params.chatId));
      return res.json({ entries });
    } catch (e) {
      return handleError(res, e);
    }
  });

  const settingsSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    avatar: z.string().max(2_000_000).optional(),
    visibility: z.enum(["public", "private", "invite_only"]).optional(),
    approvalRequired: z.boolean().optional(),
    whoCanSendMessages: z.enum(["everyone", "admins", "moderators"]).optional(),
    whoCanAddMembers: z.enum(["everyone", "admins"]).optional(),
    whoCanEditGroup: z.enum(["owner", "admins"]).optional(),
    slowModeSeconds: z.number().int().min(0).max(3600).optional(),
    blockLinks: z.boolean().optional(),
    antiSpam: z.boolean().optional(),
    profanityFilter: z.boolean().optional(),
    autoDeleteHours: z.number().int().min(0).max(168).optional(),
    theme: z.string().max(40).optional(),
  });

  router.patch("/v1/groups/:chatId/settings", authMiddleware, async (req, res) => {
    try {
      const parsed = settingsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
      const chat = await updateGroupSettings(String(req.params.chatId), actorId(req), parsed.data);
      return res.json({ chat });
    } catch (e) {
      return handleError(res, e);
    }
  });

  const roleSchema = z.object({ role: z.enum(["owner", "admin", "moderator", "member"]) });

  router.patch("/v1/groups/:chatId/members/:userId/role", authMiddleware, async (req, res) => {
    try {
      const parsed = roleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "دور غير صالح" });
      const chat = await setMemberRole(
        String(req.params.chatId),
        actorId(req),
        String(req.params.userId),
        parsed.data.role as GroupRole,
      );
      return res.json({ chat });
    } catch (e) {
      return handleError(res, e);
    }
  });

  router.post("/v1/groups/:chatId/transfer-ownership", authMiddleware, async (req, res) => {
    try {
      const body = z.object({ newOwnerId: z.string().min(1) }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "newOwnerId مطلوب" });
      const chat = await transferOwnership(
        String(req.params.chatId),
        actorId(req),
        body.data.newOwnerId,
      );
      return res.json({ chat });
    } catch (e) {
      return handleError(res, e);
    }
  });

  router.post("/v1/groups/:chatId/members/:userId/ban", authMiddleware, async (req, res) => {
    try {
      const chat = await banMember(
        String(req.params.chatId),
        actorId(req),
        String(req.params.userId),
      );
      return res.json({ chat });
    } catch (e) {
      return handleError(res, e);
    }
  });

  router.post("/v1/groups/:chatId/members/:userId/mute", authMiddleware, async (req, res) => {
    try {
      const body = z
        .object({ durationMinutes: z.number().int().min(1).max(5_256_000).default(60) })
        .safeParse(req.body ?? {});
      const mins = body.success ? body.data.durationMinutes : 60;
      const until = Date.now() + mins * 60_000;
      const chat = await muteMember(
        String(req.params.chatId),
        actorId(req),
        String(req.params.userId),
        until,
      );
      return res.json({ chat, mutedUntil: until });
    } catch (e) {
      return handleError(res, e);
    }
  });

  router.delete("/v1/groups/:chatId", authMiddleware, async (req, res) => {
    try {
      await deleteGroup(String(req.params.chatId), actorId(req));
      return res.json({ ok: true });
    } catch (e) {
      return handleError(res, e);
    }
  });

  return router;
}
