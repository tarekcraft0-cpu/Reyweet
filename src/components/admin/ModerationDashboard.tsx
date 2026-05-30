import { useCallback, useEffect, useState } from "react";
import {
  apiAdminDecideAppeal,
  apiAdminListAppeals,
  apiAdminLookupUserByUsername,
  apiAdminListReports,
  apiAdminRestoreUser,
  apiAdminReviewReport,
} from "@/lib/moderationApi";
import { AdminBanConfirmSheet, type AdminBanAction } from "./AdminBanConfirmSheet";
import {
  REPORT_CATEGORIES,
  type ModerationAppeal,
  type ModerationReport,
} from "@/lib/moderationTypes";

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_CATEGORIES.map(c => [c.id, c.labelAr]),
);

function isOpenReport(status: string) {
  return status === "pending" || status === "under_review";
}

function isOpenAppeal(status: string) {
  return status === "pending" || status === "under_review";
}

function reportStatusUi(status: string): { label: string; badge: string } {
  switch (status) {
    case "approved":
      return { label: "تم القبول", badge: "bg-emerald-500/15 text-emerald-600" };
    case "rejected":
      return { label: "تم الرفض", badge: "bg-destructive/15 text-destructive" };
    case "escalated":
      return { label: "مُصعَّد", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
    case "under_review":
      return { label: "قيد المراجعة", badge: "bg-primary/15 text-primary" };
    default:
      return { label: "قيد الانتظار", badge: "bg-secondary text-muted-foreground" };
  }
}

function appealStatusUi(status: string): { label: string; badge: string } {
  switch (status) {
    case "approved":
      return { label: "تم قبول الطعن", badge: "bg-emerald-500/15 text-emerald-600" };
    case "rejected":
      return { label: "تم رفض الطعن", badge: "bg-destructive/15 text-destructive" };
    case "under_review":
      return { label: "قيد المراجعة", badge: "bg-primary/15 text-primary" };
    default:
      return { label: "قيد الانتظار", badge: "bg-secondary text-muted-foreground" };
  }
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "نشط",
  TEMP_BANNED: "حظر مؤقت",
  BANNED: "حظر",
  PERMANENTLY_BANNED: "معطّل نهائياً",
  RESTRICTED: "مقيّد",
  SHADOW_BANNED: "حظر خفي",
};

export function ModerationDashboard() {
  const [tab, setTab] = useState<"reports" | "appeals" | "restore">("reports");
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ModerationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingBan, setPendingBan] = useState<{
    action: AdminBanAction;
    report: ModerationReport;
  } | null>(null);
  const [restoreQuery, setRestoreQuery] = useState("");
  const [restoreLookup, setRestoreLookup] = useState<{
    user: { id: string; username: string; email: string };
    state: { accountStatus: string; banReason?: string };
    banned: boolean;
    permanentlyDisabled: boolean;
  } | null>(null);
  const [restoreNote, setRestoreNote] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    if (tab === "reports") {
      const r = await apiAdminListReports({ q: filter || undefined });
      setLoading(false);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setErr("");
      setReports(r.data.reports);
    } else {
      const r = await apiAdminListAppeals();
      setLoading(false);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setErr("");
      setAppeals(r.data.appeals as ModerationAppeal[]);
    }
  }, [tab, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (action: string) => {
    if (!selected || !isOpenReport(selected.status)) return;
    if (action === "ban" || action === "temp_ban" || action === "perm_ban") {
      setPendingBan({ action, report: selected });
      return;
    }
    setBusyId(selected.id);
    const r = await apiAdminReviewReport(selected.id, {
      action,
      reason: "انتهاك إرشادات المجتمع",
      guideline: selected.category,
      durationHours: action === "temp_ban" ? 168 : undefined,
      ...(action === "ignore" ? { status: "rejected" as const } : {}),
    });
    setBusyId(null);
    if (!r.ok) alert(r.error);
    else {
      setSelected(null);
      void load();
    }
  };

  const executePlatformBan = async () => {
    if (!pendingBan) return { ok: false, error: "لا يوجد بلاغ" };
    const { action, report } = pendingBan;
    setBusyId(report.id);
    const r = await apiAdminReviewReport(report.id, {
      action,
      reason: "انتهاك إرشادات المجتمع",
      guideline: report.category,
      durationHours: action === "temp_ban" ? 168 : undefined,
    });
    setBusyId(null);
    if (!r.ok) return { ok: false, error: r.error };
    setPendingBan(null);
    setSelected(null);
    void load();
    return { ok: true };
  };

  const decideAppeal = async (id: string, decision: "approve" | "reject") => {
    const appeal = appeals.find(a => a.id === id);
    if (!appeal || !isOpenAppeal(appeal.status)) return;
    setBusyId(id);
    const r = await apiAdminDecideAppeal(id, decision);
    setBusyId(null);
    if (!r.ok) {
      alert(r.error);
      void load();
      return;
    }
    setAppeals(prev =>
      prev.map(a =>
        a.id === id
          ? { ...a, status: decision === "approve" ? "approved" : "rejected", updatedAt: Date.now() }
          : a,
      ),
    );
  };

  const selectedOpen = selected ? isOpenReport(selected.status) : false;
  const selectedUi = selected ? reportStatusUi(selected.status) : null;

  return (
    <div className="mx-4 mt-4 space-y-3 pb-24">
      <h2 className="text-lg font-bold">لوحة الإشراف</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={
            "flex-1 rounded-lg py-2 text-sm font-semibold " +
            (tab === "reports" ? "bg-primary text-primary-foreground" : "bg-secondary")
          }
        >
          البلاغات
        </button>
        <button
          type="button"
          onClick={() => setTab("appeals")}
          className={
            "flex-1 rounded-lg py-2 text-sm font-semibold " +
            (tab === "appeals" ? "bg-primary text-primary-foreground" : "bg-secondary")
          }
        >
          الطعون
        </button>
        <button
          type="button"
          onClick={() => setTab("restore")}
          className={
            "flex-1 rounded-lg py-2 text-sm font-semibold " +
            (tab === "restore" ? "bg-primary text-primary-foreground" : "bg-secondary")
          }
        >
          استعادة
        </button>
      </div>
      {tab === "restore" && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-semibold">استعادة حساب (بعد مراجعة دعم)</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            للحسابات المعطّلة نهائياً بعد تبين الظلم — يُرسل إيميل اعتذار وفك الحظر النهائي.
          </p>
          <input
            value={restoreQuery}
            onChange={e => setRestoreQuery(e.target.value)}
            placeholder="اسم المستخدم مثل nw3"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            dir="ltr"
          />
          <button
            type="button"
            disabled={restoreBusy || !restoreQuery.trim()}
            className="w-full rounded-lg bg-secondary py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => {
              setRestoreMsg("");
              setRestoreLookup(null);
              setRestoreBusy(true);
              void apiAdminLookupUserByUsername(restoreQuery.trim().replace(/^@/, "")).then(r => {
                setRestoreBusy(false);
                if (!r.ok) {
                  setRestoreMsg(r.error);
                  return;
                }
                setRestoreLookup(r.data);
              });
            }}
          >
            بحث عن الحساب
          </button>
          {restoreLookup && (
            <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
              <p className="font-semibold">@{restoreLookup.user.username}</p>
              <p className="text-xs text-muted-foreground">{restoreLookup.user.id}</p>
              <p className="mt-1">
                الحالة:{" "}
                <span className="font-medium">
                  {STATUS_LABEL[restoreLookup.state.accountStatus] ?? restoreLookup.state.accountStatus}
                </span>
              </p>
              {restoreLookup.state.banReason ? (
                <p className="mt-1 text-xs text-muted-foreground">{restoreLookup.state.banReason}</p>
              ) : null}
            </div>
          )}
          {restoreLookup?.banned ? (
            <>
              <textarea
                value={restoreNote}
                onChange={e => setRestoreNote(e.target.value)}
                placeholder="ملاحظة داخلية (اختياري) — مثال: مراجعة دعم — ظلم"
                className="min-h-[72px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={restoreBusy}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                onClick={() => {
                  if (!restoreLookup) return;
                  setRestoreBusy(true);
                  setRestoreMsg("");
                  void apiAdminRestoreUser(restoreLookup.user.id, {
                    note: restoreNote.trim() || "مراجعة دعم — استعادة بعد ظلم",
                    wrongfulPermanent: restoreLookup.permanentlyDisabled,
                  }).then(r => {
                    setRestoreBusy(false);
                    if (!r.ok) {
                      setRestoreMsg(r.error);
                      return;
                    }
                    setRestoreMsg(r.data.messageAr + " — تم إرسال إيميل للمستخدم إن وُجد بريد.");
                    setRestoreLookup(null);
                    setRestoreQuery("");
                    setRestoreNote("");
                  });
                }}
              >
                {restoreBusy ? "جاري الاستعادة…" : "استعادة الحساب وإرسال الإيميل"}
              </button>
            </>
          ) : restoreLookup ? (
            <p className="text-sm text-muted-foreground">الحساب غير معطّل — لا حاجة للاستعادة.</p>
          ) : null}
          {restoreMsg ? (
            <p
              className={
                "text-sm " +
                (restoreMsg.includes("تم") ? "text-emerald-600" : "text-destructive")
              }
            >
              {restoreMsg}
            </p>
          ) : null}
        </div>
      )}
      {tab === "reports" && (
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="بحث باسم المستخدم أو المعرف…"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {loading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

      {tab === "reports" &&
        reports.map(rep => {
          const ui = reportStatusUi(rep.status);
          const open = isOpenReport(rep.status);
          const reportedName = rep.reportedUsername?.trim() || rep.reportedUserId;
          return (
            <div
              key={rep.id}
              className="w-full rounded-xl border border-border bg-card p-3 text-start"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">المُبلَّغ عنه</p>
                  <p className="truncate font-semibold">@{reportedName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CATEGORY_LABEL[rep.category] ?? rep.category}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " + ui.badge
                  }
                >
                  {ui.label}
                </span>
              </div>
              {open ? (
                <button
                  type="button"
                  onClick={() => setSelected(rep)}
                  className="mt-3 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
                >
                  مراجعة البلاغ
                </button>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">تم البت — لا يمكن تعديل القرار</p>
              )}
            </div>
          );
        })}

      {tab === "appeals" &&
        appeals.map(a => {
          const ui = appealStatusUi(a.status);
          const open = isOpenAppeal(a.status);
          const name = a.username?.trim() || a.userId;
          const deciding = busyId === a.id;
          return (
            <div key={a.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">مقدّم الطعن</p>
                  <p className="truncate font-semibold">@{name}</p>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " + ui.badge
                  }
                >
                  {ui.label}
                </span>
              </div>
              <p className="mt-2 text-sm line-clamp-3 text-muted-foreground">{a.message}</p>
              {open ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={deciding}
                    onClick={() => void decideAppeal(a.id, "approve")}
                    className="flex-1 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {deciding ? "جاري…" : "قبول"}
                  </button>
                  <button
                    type="button"
                    disabled={deciding}
                    onClick={() => void decideAppeal(a.id, "reject")}
                    className="flex-1 rounded-lg bg-destructive py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {deciding ? "جاري…" : "رفض"}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">تم البت — لا يمكن تعديل القرار</p>
              )}
            </div>
          );
        })}

      {pendingBan && (
        <AdminBanConfirmSheet
          open
          onClose={() => setPendingBan(null)}
          username={
            pendingBan.report.reportedUsername?.trim() || pendingBan.report.reportedUserId
          }
          action={pendingBan.action}
          onConfirm={executePlatformBan}
        />
      )}

      {selected && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold">مراجعة بلاغ</h3>
              {selectedUi && (
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold " + selectedUi.badge
                  }
                >
                  {selectedUi.label}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold">
              @{selected.reportedUsername?.trim() || selected.reportedUserId}
            </p>
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABEL[selected.category] ?? selected.category}
            </p>
            {selected.evidence?.text && (
              <p className="mt-2 text-xs text-muted-foreground">{selected.evidence.text}</p>
            )}
            {selectedOpen ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void review("ignore")}
                  className="rounded-lg bg-secondary py-2 text-xs disabled:opacity-50"
                >
                  تجاهل (رفض)
                </button>
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void review("warn")}
                  className="rounded-lg bg-secondary py-2 text-xs disabled:opacity-50"
                >
                  تحذير
                </button>
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void review("temp_ban")}
                  className="rounded-lg bg-destructive/90 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  حظر مؤقت (7 أيام)
                </button>
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void review("ban")}
                  className="rounded-lg bg-destructive/90 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  حظر
                </button>
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void review("perm_ban")}
                  className="col-span-2 rounded-lg bg-destructive py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  حظر نهائي
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-secondary/60 px-3 py-2 text-center text-sm text-muted-foreground">
                تم البت في هذا البلاغ ولا يمكن تغيير القرار.
              </p>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-3 w-full text-sm text-muted-foreground"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
