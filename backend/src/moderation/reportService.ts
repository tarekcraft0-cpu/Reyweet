import { randomUUID } from "node:crypto";
import type { Request } from "express";
import type {
  ModerationReport,
  ReportCategoryId,
  ReportEvidence,
  ReportTargetType,
} from "../../../src/lib/moderationTypes.js";
import { REPORT_CATEGORIES } from "../../../src/lib/moderationTypes.js";
import {
  appendModerationAudit,
  countRecentReportsByReporter,
  findDuplicateReport,
  getReport,
  linkDeviceAndIp,
  saveReport,
} from "../db/moderationStore.js";
import { rateLimitClientKey, rateLimitHit } from "../lib/rateLimit.js";
import { getUserById } from "../db/engine.js";
import { emitToUsers } from "../lib/realtimeSocket.js";
import { getModeratorRole } from "./moderatorRoles.js";

export class ReportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "rate_limit"
      | "duplicate"
      | "invalid"
      | "not_found"
      | "already_decided" = "invalid",
  ) {
    super(message);
    this.name = "ReportError";
  }
}

function clientMeta(req: Request) {
  const fp = String(req.headers["x-device-fingerprint"] || "").slice(0, 128);
  const ip =
    String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0]?.trim() ||
    "";
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
  return { fingerprint: fp || undefined, ip: ip || undefined, userAgent };
}

export function listReportCategories() {
  return REPORT_CATEGORIES;
}

export async function submitReport(
  reporterId: string,
  req: Request,
  input: {
    reportedUserId: string;
    targetType: ReportTargetType;
    targetId?: string;
    category: ReportCategoryId;
    subcategory?: string;
    evidence?: ReportEvidence;
  },
): Promise<ModerationReport> {
  const rl = rateLimitHit(`report:${rateLimitClientKey(req)}`, 15, 60 * 60 * 1000);
  if (!rl.ok) throw new ReportError("طلبات بلاغ كثيرة — حاول لاحقاً", "rate_limit");

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recent = await countRecentReportsByReporter(reporterId, hourAgo);
  if (recent >= 10) throw new ReportError("تجاوزت حد البلاغات اليومي", "rate_limit");

  if (!REPORT_CATEGORIES.some(c => c.id === input.category)) {
    throw new ReportError("فئة غير صالحة", "invalid");
  }

  const reported = await getUserById(input.reportedUserId);
  if (!reported) throw new ReportError("المستخدم غير موجود", "not_found");
  if (input.reportedUserId === reporterId) {
    throw new ReportError("لا يمكن الإبلاغ عن نفسك", "invalid");
  }

  const dup = await findDuplicateReport(
    reporterId,
    input.reportedUserId,
    input.category,
    input.targetId,
  );
  if (dup) {
    throw new ReportError("تم إرسال هذا البلاغ للتو — انتظر لحظة ثم أعد المحاولة", "duplicate");
  }

  const meta = clientMeta(req);
  await linkDeviceAndIp(reporterId, meta.fingerprint, meta.ip);

  const now = Date.now();
  const report: ModerationReport = {
    id: randomUUID(),
    reporterId,
    reportedUserId: input.reportedUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    category: input.category,
    subcategory: input.subcategory,
    evidence: input.evidence || {},
    status: "pending",
    deviceFingerprint: meta.fingerprint,
    ip: meta.ip,
    userAgent: meta.userAgent,
    createdAt: now,
    updatedAt: now,
  };

  await saveReport(report);
  await appendModerationAudit({
    actorId: reporterId,
    action: "report.created",
    entityType: "report",
    entityId: report.id,
    meta: { category: input.category, reportedUserId: input.reportedUserId },
  });

  const modIds = await moderatorUserIds();
  for (const mid of modIds) {
    emitToUsers([mid], "moderation:report_new", { reportId: report.id });
  }

  const { notifyReporterReportSubmitted } = await import("./reportNotifications.js");
  await notifyReporterReportSubmitted(report).catch(() => {});

  return report;
}

export async function getReportForReporter(
  reporterId: string,
  reportId: string,
): Promise<ModerationReport & { reportedUsername?: string; categoryLabelAr?: string }> {
  const report = await getReport(reportId);
  if (!report) throw new ReportError("البلاغ غير موجود", "not_found");
  if (report.reporterId !== reporterId) {
    throw new ReportError("غير مصرح", "invalid");
  }
  const reported = await getUserById(report.reportedUserId);
  const cat = REPORT_CATEGORIES.find(c => c.id === report.category);
  return {
    ...report,
    reportedUsername: reported?.username,
    categoryLabelAr: cat?.labelAr,
  };
}

async function moderatorUserIds(): Promise<string[]> {
  const ids = new Set<string>();
  const envLists = [
    process.env.SUPPORT_AGENT_IDS,
    process.env.SENIOR_MODERATOR_IDS,
    process.env.MODERATOR_ADMIN_IDS,
    process.env.SUPER_ADMIN_USER_IDS,
    process.env.ADMIN_USER_IDS,
    process.env.INTERNAL_TRUSTED_USER_IDS,
  ];
  for (const raw of envLists) {
    for (const id of (raw || "").split(",").map(s => s.trim()).filter(Boolean)) {
      ids.add(id);
    }
  }
  ids.add("u_founder_tareqf");
  ids.add("u_support_official");
  return [...ids];
}

export async function moderatorReviewReport(
  moderatorId: string,
  reportId: string,
  update: {
    status?: ModerationReport["status"];
    action?: import("../../../src/lib/moderationTypes.js").ModeratorActionType;
    reason?: string;
    guideline?: string;
    durationHours?: number;
    note?: string;
  },
) {
  const report = await getReport(reportId);
  if (!report) throw new ReportError("البلاغ غير موجود", "not_found");
  if (report.status === "approved" || report.status === "rejected") {
    throw new ReportError("تم البت في هذا البلاغ مسبقاً", "already_decided");
  }

  report.assignedModeratorId = moderatorId;

  if (update.action && update.action !== "ignore") {
    const { applyModerationAction } = await import("./banEngine.js");
    await applyModerationAction(report.reportedUserId, moderatorId, update.action, {
      reason: update.reason || "انتهاك إرشادات المجتمع",
      guideline: update.guideline,
      durationHours: update.durationHours,
      reportId: report.id,
    });
    report.status = "approved";
    report.updatedAt = Date.now();
    await saveReport(report);
  } else if (update.action === "ignore") {
    report.status = "rejected";
    report.updatedAt = Date.now();
    await saveReport(report);
  } else if (update.status) {
    report.status = update.status;
    report.updatedAt = Date.now();
    await saveReport(report);
  }

  await appendModerationAudit({
    actorId: moderatorId,
    action: "report.reviewed",
    entityType: "report",
    entityId: reportId,
    meta: update,
  });

  const { notifyReporterReportDecision, reportOutcomeFromReview } = await import(
    "./reportNotifications.js"
  );
  const outcome = reportOutcomeFromReview(update.action, report.status);
  if (outcome) {
    await notifyReporterReportDecision(report, outcome).catch(() => {});
  }

  const role = getModeratorRole(moderatorId);
  return { report, moderatorRole: role };
}
