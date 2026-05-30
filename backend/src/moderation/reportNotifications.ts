import type { ModerationReport, ReportCategoryId } from "../../../src/lib/moderationTypes.js";
import { REPORT_CATEGORIES } from "../../../src/lib/moderationTypes.js";
import { getUserById } from "../db/engine.js";
import { deliverNotification } from "../lib/socialActions.js";
import { SUPPORT_OFFICIAL_ACCOUNT_ID } from "../../../src/lib/supportOfficialAccount.js";

function categoryLabelAr(category: ReportCategoryId): string {
  return REPORT_CATEGORIES.find(c => c.id === category)?.labelAr || category;
}

async function reportedUsername(report: ModerationReport): Promise<string> {
  const u = await getUserById(report.reportedUserId);
  return u?.username || report.reportedUserId.slice(0, 8);
}

/** إشعار للمُبلِّغ: تم استلام البلاغ */
export async function notifyReporterReportSubmitted(report: ModerationReport): Promise<void> {
  const uname = await reportedUsername(report);
  const cat = categoryLabelAr(report.category);
  await deliverNotification(report.reporterId, {
    userId: report.reporterId,
    fromId: SUPPORT_OFFICIAL_ACCOUNT_ID,
    type: "report_update",
    reportedUserId: report.reportedUserId,
    reportId: report.id,
    reportStatus: "pending",
    reportCategory: report.category,
    text: `بلاغك على @${uname} (${cat}) قيد المراجعة من فريق الدعم`,
  });
}

/** إشعار للمُبلِّغ: قرار الدعم */
export async function notifyReporterReportDecision(
  report: ModerationReport,
  outcome: "removed" | "not_removed",
): Promise<void> {
  const uname = await reportedUsername(report);
  const cat = categoryLabelAr(report.category);
  const approved = outcome === "removed";
  const text = approved
    ? `تمت إزالة @${uname} — ${cat}. شكراً لمساهمتك في أمان التطبيق.`
    : `لم تتم إزالة @${uname} — ${cat}. تبيّن أن الحساب لا يخالف سياسات المجتمع. شكراً لحرصك.`;
  await deliverNotification(report.reporterId, {
    userId: report.reporterId,
    fromId: SUPPORT_OFFICIAL_ACCOUNT_ID,
    type: "report_update",
    reportedUserId: report.reportedUserId,
    reportId: report.id,
    reportStatus: approved ? "approved" : "rejected",
    reportCategory: report.category,
    text,
  });
}

export function reportOutcomeFromReview(
  action?: import("../../../src/lib/moderationTypes.js").ModeratorActionType,
  status?: ModerationReport["status"],
): "removed" | "not_removed" | null {
  if (status === "rejected" || action === "ignore") return "not_removed";
  if (status === "approved") {
    if (action === "ban" || action === "temp_ban" || action === "perm_ban") return "removed";
    if (action) return "not_removed";
    return "removed";
  }
  return null;
}
