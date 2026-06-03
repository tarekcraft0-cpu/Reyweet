import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, Clock, Flag, XCircle } from "lucide-react";
import { Avatar } from "../Avatar";
import { apiListMyReports } from "@/lib/moderationApi";
import { apiBackendEnabled } from "@/lib/apiBackend";
import { REPORT_CATEGORIES, type ModerationReport } from "@/lib/moderationTypes";
import { userById, useApp } from "@/lib/store";
import { RtlScreenHeader } from "../SlideDismissShell";

type ReportRow = ModerationReport & { reportedUsername?: string; categoryLabelAr?: string };

export type ReportUiStatus = "pending" | "approved" | "rejected";

export function reportUiStatus(report: ReportRow): ReportUiStatus {
  if (report.status === "approved") return "approved";
  if (report.status === "rejected") return "rejected";
  return "pending";
}

function categoryLabel(report: ReportRow): string {
  if (report.categoryLabelAr) return report.categoryLabelAr;
  return REPORT_CATEGORIES.find(c => c.id === report.category)?.labelAr || report.category;
}

function statusMeta(status: ReportUiStatus): {
  label: string;
  className: string;
  Icon: typeof Clock;
} {
  if (status === "approved") {
    return {
      label: "تمت إزالة الحساب",
      className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      Icon: CheckCircle2,
    };
  }
  if (status === "rejected") {
    return {
      label: "لم تُقبل",
      className: "bg-secondary text-muted-foreground",
      Icon: XCircle,
    };
  }
  return {
    label: "قيد المراجعة",
    className: "bg-primary/10 text-primary",
    Icon: Clock,
  };
}

function formatReportDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString("ar-SA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function MyReportsPanel({
  onBack,
  onOpenReport,
}: {
  onBack: () => void;
  onOpenReport: (reportId: string, status: ReportUiStatus) => void;
}) {
  const { state } = useApp();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!apiBackendEnabled()) {
      setErr("يتطلب اتصالاً بالخادم لعرض البلاغات");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    const r = await apiListMyReports(100);
    if (!r.ok) {
      setErr(r.error);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(r.data.reports);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <RtlScreenHeader onBack={onBack} title="بلاغاتي" className="shrink-0 border-b border-border" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(2rem,var(--sab))]">
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          البلاغات التي قدّمتها على حسابات أو محتوى آخر. اضغط على أي بلاغ لمتابعة حالته — ستصلك أيضاً
          تحديثات في الإشعارات عند قبول البلاغ أو رفضه.
        </p>

        {loading && (
          <p className="py-16 text-center text-sm text-muted-foreground">جاري تحميل البلاغات…</p>
        )}

        {!loading && err && (
          <div className="mt-8 flex flex-col items-center gap-3 px-4 text-center">
            <AlertCircle className="text-destructive" size={36} />
            <p className="text-sm text-destructive">{err}</p>
            {apiBackendEnabled() && (
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                إعادة المحاولة
              </button>
            )}
          </div>
        )}

        {!loading && !err && rows.length === 0 && (
          <div className="mt-12 flex flex-col items-center gap-3 px-6 text-center text-muted-foreground">
            <Flag size={40} className="opacity-35" />
            <p className="text-sm font-medium text-foreground">لا توجد بلاغات بعد</p>
            <p className="text-xs leading-relaxed">
              عند الإبلاغ عن حساب أو رسالة من القائمة، ستظهر هنا مع تاريخ الإرسال وحالة المراجعة.
            </p>
          </div>
        )}

        {!loading && !err && rows.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rows.map(report => {
              const ui = reportUiStatus(report);
              const meta = statusMeta(ui);
              const StatusIcon = meta.Icon;
              const reported = userById(state, report.reportedUserId);
              const uname = report.reportedUsername || reported?.username || "…";
              return (
                <li key={report.id}>
                  <button
                    type="button"
                    onClick={() => onOpenReport(report.id, ui)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-start active:bg-accent"
                  >
                    <Avatar name={uname} src={reported?.avatar} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold" dir="ltr">
                        @{uname}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{categoryLabel(report)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{formatReportDate(report.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={
                          "inline-flex max-w-[7.5rem] items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-tight " +
                          meta.className
                        }
                      >
                        <StatusIcon size={12} className="shrink-0" />
                        {meta.label}
                      </span>
                      <ChevronLeft size={18} className="text-muted-foreground rtl:rotate-180" />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
