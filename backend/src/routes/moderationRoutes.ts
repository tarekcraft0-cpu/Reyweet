import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  listReportCategories,
  moderatorReviewReport,
  ReportError,
  submitReport,
} from "../moderation/reportService.js";
import {
  AppealError,
  decideAppeal,
  startAppealEmailOtp,
  submitAppeal,
  verifyAppealEmailOtp,
} from "../moderation/appealService.js";
import {
  bannedPublicProfilePayload,
  getBanInfoForUser,
  resolveEffectiveStatus,
} from "../moderation/banEngine.js";
import {
  findUsersByDevice,
  findUsersByIp,
  getActiveAppealForUser,
  getReport,
  dismissUserModerationNotice,
  getUserModerationState,
  listAppeals,
  listAudit,
  listReports,
} from "../db/moderationStore.js";
import { getUserById, findUserByUsername } from "../db/engine.js";
import {
  enrichAppealsForAdmin,
  enrichReportsForAdmin,
  filterReportsByQuery,
} from "../moderation/adminListEnrich.js";
import {
  getModeratorRole,
  requireModeratorRole,
  verifyInternalOverrideKey,
} from "../moderation/moderatorRoles.js";
import { canRestoreModerationAccount, moderatorCan } from "../../../src/lib/moderationRbac.js";
import { isBannedStatus, restoreAccount } from "../moderation/banEngine.js";

type Authed = Request & { userId: string };

function uid(req: Request) {
  return (req as Authed).userId;
}

function handleReportErr(res: Response, e: unknown) {
  if (e instanceof ReportError) {
    const status =
      e.code === "rate_limit"
        ? 429
        : e.code === "not_found"
          ? 404
          : e.code === "already_decided"
            ? 409
            : 400;
    return res.status(status).json({ error: e.message });
  }
  if (e instanceof Error && e.message === "MODERATOR_FORBIDDEN") {
    return res.status(403).json({ error: "غير مصرح" });
  }
  return res.status(500).json({ error: e instanceof Error ? e.message : "خطأ" });
}

function handleAppealErr(res: Response, e: unknown) {
  if (e instanceof AppealError) {
    const status =
      e.code === "forbidden" || e.code === "permanent" ? 403 : e.code === "rate_limit" ? 429 : 400;
    return res.status(status).json({ error: e.message });
  }
  return res.status(500).json({ error: e instanceof Error ? e.message : "خطأ" });
}

export function createModerationRouter(authMiddleware: (req: Request, res: Response, next: () => void) => void) {
  const router = Router();

  router.get("/v1/moderation/categories", (_req, res) => {
    res.json({ categories: listReportCategories() });
  });

  const reportSchema = z.object({
    reportedUserId: z.string().min(1),
    targetType: z.enum(["user", "post", "comment", "message", "story"]),
    targetId: z.string().optional(),
    category: z.string().min(1),
    subcategory: z.string().optional(),
    evidence: z
      .object({
        text: z.string().max(4000).optional(),
        attachmentUrls: z.array(z.string().max(2000)).max(5).optional(),
        impersonationTarget: z
          .enum(["me", "someone_i_know", "celebrity", "business"])
          .optional(),
        realAccountUsername: z.string().max(40).optional(),
        realAccountUserId: z.string().optional(),
      })
      .optional(),
  });

  router.post("/v1/moderation/reports", authMiddleware, async (req, res) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
      const report = await submitReport(uid(req), req, {
        ...parsed.data,
        category: parsed.data.category as import("../../../src/lib/moderationTypes.js").ReportCategoryId,
      });
      return res.status(201).json({ ok: true, reportId: report.id, ticketId: report.id });
    } catch (e) {
      return handleReportErr(res, e);
    }
  });

  router.get("/v1/me/moderation/status", authMiddleware, async (req, res) => {
    const user = await getUserById(uid(req));
    if (!user) return res.status(404).json({ error: "غير موجود" });
    const status = await resolveEffectiveStatus(user.id);
    const banInfo = await getBanInfoForUser(user);
    const state = await getUserModerationState(user.id);
    const activeAppeal = await getActiveAppealForUser(user.id);
    const userAppeals = await listAppeals({ userId: user.id });
    const latestAppeal = userAppeals[0] ?? null;
    return res.json({
      accountStatus: status,
      banInfo,
      canAppeal: banInfo?.canAppeal ?? false,
      permanentlyDisabled: status === "PERMANENTLY_BANNED",
      shadowBanned: state.shadowBanned === true,
      activeAppeal: activeAppeal
        ? { id: activeAppeal.id, status: activeAppeal.status, createdAt: activeAppeal.createdAt }
        : null,
      latestAppeal: latestAppeal
        ? { id: latestAppeal.id, status: latestAppeal.status, updatedAt: latestAppeal.updatedAt }
        : null,
      pendingNotice: state.pendingNotice ?? null,
    });
  });

  router.post("/v1/me/moderation/dismiss-notice", authMiddleware, async (req, res) => {
    const parsed = z.object({ noticeId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "noticeId مطلوب" });
    const ok = await dismissUserModerationNotice(uid(req), parsed.data.noticeId);
    if (!ok) return res.status(404).json({ error: "لا يوجد إشعار معلّق" });
    return res.json({ ok: true });
  });

  router.post("/v1/me/appeal/otp", authMiddleware, async (req, res) => {
    try {
      const r = await startAppealEmailOtp(uid(req), req);
      return res.json(r);
    } catch (e) {
      return handleAppealErr(res, e);
    }
  });

  router.post("/v1/me/appeal/verify-email", authMiddleware, async (req, res) => {
    const parsed = z.object({ code: z.string().min(4).max(12) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "رمز مطلوب" });
    try {
      const r = await verifyAppealEmailOtp(uid(req), parsed.data.code);
      return res.json(r);
    } catch (e) {
      return handleAppealErr(res, e);
    }
  });

  router.post("/v1/me/appeal", authMiddleware, async (req, res) => {
    const parsed = z
      .object({
        message: z.string().min(10).max(4000),
        phone: z.string().max(32).optional(),
        attachmentUrls: z.array(z.string()).max(5).optional(),
        emailVerified: z.literal(true),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
    try {
      const appeal = await submitAppeal(uid(req), parsed.data);
      return res.status(201).json({ ok: true, appealId: appeal.id });
    } catch (e) {
      return handleAppealErr(res, e);
    }
  });

  router.get("/v1/users/:userId/banned-preview", authMiddleware, async (req, res) => {
    const row = await getUserById(String(req.params.userId));
    if (!row) return res.status(404).json({ error: "غير موجود" });
    const status = await resolveEffectiveStatus(row.id);
    if (status !== "BANNED" && status !== "TEMP_BANNED" && status !== "PERMANENTLY_BANNED") {
      return res.json({ banned: false });
    }
    return res.json({
      banned: true,
      user: bannedPublicProfilePayload(row.username),
    });
  });

  /** ——— Admin moderation ——— */
  router.get("/v1/admin/moderation/me", authMiddleware, (req, res) => {
    const role = getModeratorRole(uid(req));
    return res.json({ isModerator: !!role, role });
  });

  router.get("/v1/admin/moderation/reports", authMiddleware, async (req, res) => {
    try {
      requireModeratorRole(uid(req));
      const status = String(req.query.status || "");
      const q = String(req.query.q || "");
      let reports = await enrichReportsForAdmin(
        await listReports({
          status: status || undefined,
          limit: 500,
        }),
      );
      if (q) reports = filterReportsByQuery(reports, q);
      return res.json({ reports });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  router.get("/v1/admin/moderation/reports/:id", authMiddleware, async (req, res) => {
    try {
      requireModeratorRole(uid(req));
      const report = await getReport(String(req.params.id));
      if (!report) return res.status(404).json({ error: "غير موجود" });
      const state = await getUserModerationState(report.reportedUserId);
      const linkedDevices = report.deviceFingerprint
        ? await findUsersByDevice(report.deviceFingerprint)
        : [];
      const linkedIps = report.ip ? await findUsersByIp(report.ip) : [];
      return res.json({ report, userState: state, linkedDevices, linkedIps });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  const reviewSchema = z.object({
    status: z.enum(["pending", "under_review", "approved", "rejected", "escalated"]).optional(),
    action: z
      .enum([
        "ignore",
        "warn",
        "ban",
        "temp_ban",
        "perm_ban",
        "shadow_ban",
        "restrict",
        "delete_content",
        "force_password_reset",
      ])
      .optional(),
    reason: z.string().max(500).optional(),
    guideline: z.string().max(200).optional(),
    durationHours: z.number().int().positive().optional(),
    note: z.string().max(1000).optional(),
  });

  router.post("/v1/admin/moderation/reports/:id/review", authMiddleware, async (req, res) => {
    try {
      const modId = uid(req);
      const role = requireModeratorRole(modId);
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
      if (parsed.data.action && !moderatorCan(role, parsed.data.action)) {
        return res.status(403).json({ error: "صلاحية غير كافية" });
      }
      const result = await moderatorReviewReport(modId, String(req.params.id), parsed.data);
      return res.json(result);
    } catch (e) {
      return handleReportErr(res, e);
    }
  });

  router.get("/v1/admin/moderation/appeals", authMiddleware, async (req, res) => {
    try {
      requireModeratorRole(uid(req));
      const status = String(req.query.status || "");
      const appeals = await enrichAppealsForAdmin(
        await listAppeals({ status: status || undefined }),
      );
      return res.json({ appeals });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  router.post("/v1/admin/moderation/appeals/:id/decide", authMiddleware, async (req, res) => {
    try {
      const modId = uid(req);
      requireModeratorRole(modId);
      const parsed = z
        .object({ decision: z.enum(["approve", "reject"]), note: z.string().max(1000).optional() })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "قرار غير صالح" });
      const result = await decideAppeal(modId, String(req.params.id), parsed.data.decision, parsed.data.note);
      return res.json(result);
    } catch (e) {
      return handleAppealErr(res, e);
    }
  });

  router.get("/v1/admin/moderation/users/:userId", authMiddleware, async (req, res) => {
    try {
      requireModeratorRole(uid(req));
      const userId = String(req.params.userId);
      const user = await getUserById(userId);
      if (!user) return res.status(404).json({ error: "غير موجود" });
      const state = await getUserModerationState(userId);
      const reports = await listReports({ reportedUserId: userId, limit: 50 });
      const appeals = await listAppeals({ userId });
      return res.json({ user: { id: user.id, username: user.username, email: user.email }, state, reports, appeals });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  router.get("/v1/admin/moderation/users/by-username/:username", authMiddleware, async (req, res) => {
    try {
      requireModeratorRole(uid(req));
      const row = await findUserByUsername(String(req.params.username ?? "").trim());
      if (!row) return res.status(404).json({ error: "المستخدم غير موجود" });
      const state = await getUserModerationState(row.id);
      return res.json({
        user: { id: row.id, username: row.username, email: row.email },
        state,
        banned: isBannedStatus(state.accountStatus),
        permanentlyDisabled: state.accountStatus === "PERMANENTLY_BANNED",
      });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  router.post("/v1/admin/moderation/users/:userId/restore", authMiddleware, async (req, res) => {
    try {
      const modId = uid(req);
      const role = requireModeratorRole(modId);
      if (!canRestoreModerationAccount(role)) {
        return res.status(403).json({ error: "صلاحية غير كافية لاستعادة الحساب" });
      }
      const userId = String(req.params.userId);
      const user = await getUserById(userId);
      if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
      const before = await getUserModerationState(userId);
      if (!isBannedStatus(before.accountStatus) && before.accountStatus !== "RESTRICTED") {
        return res.status(400).json({ error: "الحساب غير معطّل" });
      }
      const parsed = z
        .object({
          note: z.string().max(1000).optional(),
          wrongfulPermanent: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
      const wasPermanent = before.accountStatus === "PERMANENTLY_BANNED";
      await restoreAccount(userId, modId, {
        wrongfulPermanentRestore: parsed.data.wrongfulPermanent === true || wasPermanent,
        note: parsed.data.note,
      });
      return res.json({
        ok: true,
        restored: true,
        userId,
        username: user.username,
        messageAr: wasPermanent
          ? "تم فك الحظر النهائي واستعادة الحساب."
          : "تم استعادة الحساب.",
      });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  router.get("/v1/admin/moderation/audit", authMiddleware, async (req, res) => {
    try {
      requireModeratorRole(uid(req));
      const entries = await listAudit(200);
      return res.json({ entries });
    } catch {
      return res.status(403).json({ error: "غير مصرح" });
    }
  });

  /** Internal override — لا يظهر للمستخدمين */
  router.post("/v1/internal/moderation/restore-account", async (req, res) => {
    if (!verifyInternalOverrideKey(String(req.headers["x-internal-key"] || ""))) {
      return res.status(404).json({ error: "not found" });
    }
    const parsed = z.object({ userId: z.string().min(1), note: z.string().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "userId مطلوب" });
    const actor = String(req.headers["x-internal-actor"] || "internal");
    await restoreAccount(parsed.data.userId, actor, { wrongfulPermanentRestore: true, note: parsed.data.note });
    return res.json({ ok: true, restored: true });
  });

  router.post("/v1/internal/moderation/lookup-username", async (req, res) => {
    if (!verifyInternalOverrideKey(String(req.headers["x-internal-key"] || ""))) {
      return res.status(404).json({ error: "not found" });
    }
    const parsed = z.object({ username: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "username مطلوب" });
    const row = await findUserByUsername(parsed.data.username);
    if (!row) return res.status(404).json({ error: "غير موجود" });
    const state = await getUserModerationState(row.id);
    return res.json({ userId: row.id, username: row.username, state });
  });

  return router;
}
