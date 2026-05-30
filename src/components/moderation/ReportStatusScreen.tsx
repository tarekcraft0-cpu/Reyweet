import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Shield, XCircle } from "lucide-react";
import { Avatar } from "../Avatar";
import { AppDismissSheet, RtlScreenHeader } from "../SlideDismissShell";
import { apiGetMyReport } from "@/lib/moderationApi";
import { REPORT_CATEGORIES, type ModerationReport } from "@/lib/moderationTypes";
import { SUPPORT_OFFICIAL_ACCOUNT_ID } from "@/lib/supportOfficialAccount";
import { userById, useApp } from "@/lib/store";

type ReportView = ModerationReport & { reportedUsername?: string; categoryLabelAr?: string };

function categoryLabel(report: ReportView): string {
  if (report.categoryLabelAr) return report.categoryLabelAr;
  return REPORT_CATEGORIES.find(c => c.id === report.category)?.labelAr || report.category;
}

function resolveUiStatus(report: ReportView): "pending" | "approved" | "rejected" {
  if (report.status === "approved") return "approved";
  if (report.status === "rejected") return "rejected";
  return "pending";
}

export function ReportStatusScreen({
  reportId,
  initialStatus,
  onClose,
}: {
  reportId: string;
  initialStatus?: "pending" | "approved" | "rejected";
  onClose: () => void;
}) {
  const { state, markNotificationRead } = useApp();
  const [report, setReport] = useState<ReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr("");
      const r = await apiGetMyReport(reportId);
      if (cancelled) return;
      if (!r.ok) {
        setErr(r.error);
        setLoading(false);
        return;
      }
      setReport(r.data.report);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  useEffect(() => {
    for (const n of state.notifications) {
      if (n.type === "report_update" && n.reportId === reportId && !n.read) {
        markNotificationRead(n.id);
      }
    }
  }, [reportId, state.notifications, markNotificationRead]);

  const uiStatus = report ? resolveUiStatus(report) : initialStatus || "pending";
  const reportedUser = report ? userById(state, report.reportedUserId) : undefined;
  const supportUser = userById(state, SUPPORT_OFFICIAL_ACCOUNT_ID);

  const body = useMemo(() => {
    const uname = report?.reportedUsername || reportedUser?.username || "…";
    const cat = report ? categoryLabel(report) : "—";
    if (uiStatus === "pending") {
      return {
        title: "بلاغك قيد المراجعة",
        lines: [
          `أنت أبلغت عن @${uname}.`,
          `نوع البلاغ: ${cat}.`,
          "الطلب قيد المراجعة من فريق الدعم.",
          "سنُبلغك هنا بالقرار فور اتخاذه.",
        ],
        icon: Clock,
        iconClass: "text-primary",
        ringClass: "border-primary/30 bg-primary/5",
        animateCheck: false,
      };
    }
    if (uiStatus === "approved") {
      return {
        title: "تمت إزالة الحساب",
        lines: [
          `تمت إزالة @${uname} لأنه يخالف سياسات التطبيق.`,
          `نوع البلاغ: ${cat}.`,
          "نشكرك على مساهمتك في الحفاظ على أمان مجتمع Retweet.",
        ],
        icon: CheckCircle2,
        iconClass: "text-emerald-500",
        ringClass: "border-emerald-500/30 bg-emerald-500/5",
        animateCheck: true,
      };
    }
    return {
      title: "لم تتم إزالة الحساب",
      lines: [
        `راجع فريق الدعم بلاغك عن @${uname}.`,
        `نوع البلاغ: ${cat}.`,
        "تبيّن أن الحساب لا يخالف سياسات المجتمع حالياً.",
        "نشكرك على حرصك — يمكنك الإبلاغ مجدداً إن ظهرت مخالفة جديدة.",
      ],
      icon: XCircle,
      iconClass: "text-muted-foreground",
      ringClass: "border-border bg-secondary/40",
      animateCheck: false,
    };
  }, [report, reportedUser?.username, uiStatus]);

  const Icon = body.icon;

  return (
    <AppDismissSheet onClose={onClose} overlayZIndex={48} contentClassName="min-h-0 flex flex-col bg-background">
      <RtlScreenHeader onBack={onClose} title="حالة البلاغ" className="shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-10 pt-2">
        {loading && !report && (
          <p className="py-16 text-center text-sm text-muted-foreground">جاري تحميل تفاصيل البلاغ…</p>
        )}
        {err && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="text-destructive" size={40} />
            <p className="text-sm text-destructive">{err}</p>
          </div>
        )}
        {!err && (
          <div className="mt-4 flex flex-col items-center text-center">
            <div
              className={`relative mb-5 flex h-28 w-28 items-center justify-center rounded-full border-2 ${body.ringClass}`}
            >
              {body.animateCheck ? (
                <CheckCircle2
                  size={56}
                  className={`${body.iconClass} report-status-check-pop`}
                  strokeWidth={2.2}
                />
              ) : (
                <Icon size={52} className={body.iconClass} strokeWidth={2} />
              )}
            </div>

            <h2 className="text-xl font-bold">{body.title}</h2>

            <div className="mt-6 w-full max-w-sm rounded-2xl border border-border bg-card p-4 text-start">
              <div className="mb-4 flex items-center gap-3">
                <Avatar
                  name={reportedUser?.username || report?.reportedUsername || "?"}
                  src={reportedUser?.avatar}
                  size={48}
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">الحساب المُبلَّغ عنه</p>
                  <p className="truncate font-semibold" dir="ltr">
                    @{reportedUser?.username || report?.reportedUsername || "…"}
                  </p>
                </div>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">نوع البلاغ</dt>
                  <dd className="font-medium">{report ? categoryLabel(report) : "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">الحالة</dt>
                  <dd className="font-medium">
                    {uiStatus === "pending" && "قيد المراجعة"}
                    {uiStatus === "approved" && "تمت الإزالة"}
                    {uiStatus === "rejected" && "لم تُقبل"}
                  </dd>
                </div>
                {report?.createdAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">تاريخ الإرسال</dt>
                    <dd className="font-medium text-xs">
                      {new Date(report.createdAt).toLocaleString("ar-SA")}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="mt-5 max-w-sm space-y-2 text-sm leading-relaxed text-muted-foreground">
              {body.lines.map(line => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <div className="mt-8 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-3 text-start">
              <Shield size={22} className="shrink-0 text-primary" />
              <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {supportUser?.displayName || "دعم Retweet"}
                </span>
                <br />
                لن نُبلِغ الطرف الآخر بمن أرسل البلاغ.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-8 w-full max-w-sm rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              تم
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes reportCheckPop {
          0% { transform: scale(0.2); opacity: 0; }
          55% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .report-status-check-pop {
          animation: reportCheckPop 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </AppDismissSheet>
  );
}
