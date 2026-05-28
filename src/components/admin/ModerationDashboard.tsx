import { useCallback, useEffect, useState } from "react";
import {
  apiAdminDecideAppeal,
  apiAdminListAppeals,
  apiAdminListReports,
  apiAdminReviewReport,
} from "@/lib/moderationApi";
import type { ModerationReport } from "@/lib/moderationTypes";

export function ModerationDashboard() {
  const [tab, setTab] = useState<"reports" | "appeals">("reports");
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [appeals, setAppeals] = useState<
    { id: string; userId: string; message: string; status: string; createdAt: number }[]
  >([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ModerationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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
      setAppeals(r.data.appeals as typeof appeals);
    }
  }, [tab, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (action: string) => {
    if (!selected) return;
    const r = await apiAdminReviewReport(selected.id, {
      action,
      reason: "انتهاك إرشادات المجتمع",
      guideline: selected.category,
      durationHours: action === "temp_ban" ? 168 : undefined,
      status: action === "ignore" ? "rejected" : "approved",
    });
    if (!r.ok) alert(r.error);
    else {
      setSelected(null);
      void load();
    }
  };

  const decideAppeal = async (id: string, decision: "approve" | "reject") => {
    const r = await apiAdminDecideAppeal(id, decision);
    if (!r.ok) alert(r.error);
    else {
      alert(r.data.messageAr);
      void load();
    }
  };

  return (
    <div className="mx-4 mt-4 space-y-3 pb-24">
      <h2 className="text-lg font-bold">لوحة الإشراف</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={"flex-1 rounded-lg py-2 text-sm font-semibold " + (tab === "reports" ? "bg-primary text-primary-foreground" : "bg-secondary")}
        >
          البلاغات
        </button>
        <button
          type="button"
          onClick={() => setTab("appeals")}
          className={"flex-1 rounded-lg py-2 text-sm font-semibold " + (tab === "appeals" ? "bg-primary text-primary-foreground" : "bg-secondary")}
        >
          الطعون
        </button>
      </div>
      {tab === "reports" && (
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="بحث…"
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {loading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

      {tab === "reports" &&
        reports.map(rep => (
          <button
            key={rep.id}
            type="button"
            onClick={() => setSelected(rep)}
            className="w-full rounded-xl border border-border bg-card p-3 text-start"
          >
            <p className="text-xs text-muted-foreground">{rep.status}</p>
            <p className="font-medium">{rep.category}</p>
            <p className="text-xs truncate">مُبلَّغ: {rep.reportedUserId}</p>
          </button>
        ))}

      {tab === "appeals" &&
        appeals.map(a => (
          <div key={a.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{a.status}</p>
            <p className="text-sm line-clamp-3">{a.message}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void decideAppeal(a.id, "approve")}
                className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white"
              >
                قبول
              </button>
              <button
                type="button"
                onClick={() => void decideAppeal(a.id, "reject")}
                className="flex-1 rounded-lg bg-destructive py-1.5 text-xs font-semibold text-white"
              >
                رفض
              </button>
            </div>
          </div>
        ))}

      {selected && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-4">
            <h3 className="font-bold">مراجعة بلاغ</h3>
            <p className="mt-2 text-sm">{selected.category}</p>
            <p className="text-xs text-muted-foreground mt-1">{selected.evidence?.text}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void review("ignore")} className="rounded-lg bg-secondary py-2 text-xs">
                تجاهل
              </button>
              <button type="button" onClick={() => void review("warn")} className="rounded-lg bg-secondary py-2 text-xs">
                تحذير
              </button>
              <button type="button" onClick={() => void review("temp_ban")} className="rounded-lg bg-amber-600 py-2 text-xs text-white">
                حظر مؤقت
              </button>
              <button type="button" onClick={() => void review("perm_ban")} className="rounded-lg bg-destructive py-2 text-xs text-white">
                حظر نهائي
              </button>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="mt-3 w-full text-sm text-muted-foreground">
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
