import { useEffect, useState, type RefObject } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  REPORT_CATEGORIES,
  type ImpersonationTarget,
  type ReportCategoryId,
  type ReportTargetType,
} from "@/lib/moderationTypes";
import { apiGetReportCategories, apiSubmitReport } from "@/lib/moderationApi";
import { apiBackendEnabled } from "@/lib/apiBackend";

type Step = "category" | "impersonation_who" | "impersonation_detail" | "details" | "done";

export function ReportFlow({
  reportedUserId,
  targetType,
  targetId,
  reportedUsername,
  onClose,
  onDone,
  fullScreen = false,
  contentScrollRef,
  scrollLocked = false,
}: {
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId?: string;
  reportedUsername?: string;
  onClose: () => void;
  onDone?: (reportId?: string) => void;
  /** داخل ReportFlowSheet — يملأ الارتفاع المتبقي */
  fullScreen?: boolean;
  contentScrollRef?: RefObject<HTMLDivElement | null>;
  scrollLocked?: boolean;
}) {
  const [step, setStep] = useState<Step>("category");
  const [categories, setCategories] = useState(REPORT_CATEGORIES);
  const [category, setCategory] = useState<ReportCategoryId | null>(null);
  const [impersonationTarget, setImpersonationTarget] = useState<ImpersonationTarget | null>(null);
  const [realUsername, setRealUsername] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [categoriesSyncing, setCategoriesSyncing] = useState(false);

  useEffect(() => {
    if (!apiBackendEnabled()) return;
    let cancelled = false;
    setCategoriesSyncing(true);
    void apiGetReportCategories().then(r => {
      if (cancelled) return;
      if (r.ok && r.data.categories.length > 0) setCategories(r.data.categories);
      setCategoriesSyncing(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (!category) return;
    setBusy(true);
    setErr("");
    if (apiBackendEnabled()) {
      const res = await apiSubmitReport({
        reportedUserId,
        targetType,
        targetId,
        category,
        evidence: {
          text: details.trim() || undefined,
          impersonationTarget: impersonationTarget || undefined,
          realAccountUsername: realUsername.trim() || undefined,
        },
      });
      setBusy(false);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onDone?.(res.data.reportId);
    } else {
      setBusy(false);
    }
    setStep("done");
  };

  const title =
    step === "category"
      ? "لماذا تبلّغ؟"
      : step === "impersonation_who"
        ? "من يتظاهر بهذا الحساب؟"
        : step === "impersonation_detail"
          ? "تفاصيل انتحال الشخصية"
          : step === "details"
            ? "تفاصيل إضافية"
            : "تم الإرسال";

  return (
    <div
      className={
        fullScreen
          ? "flex min-h-0 flex-1 flex-col bg-background"
          : "flex max-h-[min(92vh,720px)] flex-col rounded-t-3xl bg-background"
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        {step !== "category" && step !== "done" && (
          <button
            type="button"
            onClick={() => {
              if (step === "impersonation_who") setStep("category");
              else if (step === "impersonation_detail") setStep("impersonation_who");
              else if (step === "details") {
                setStep(category === "impersonation" ? "impersonation_detail" : "category");
              }
            }}
            className="rounded-full p-2 hover:bg-secondary"
          >
            <ArrowRight size={20} className="rtl:rotate-180" />
          </button>
        )}
        <h2 className="flex-1 text-center text-base font-semibold pe-10">{title}</h2>
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
          إغلاق
        </button>
      </div>

      <div
        ref={contentScrollRef}
        className={
          "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 pb-6 " +
          (scrollLocked ? "overflow-hidden touch-none" : "")
        }
      >
        {reportedUsername && (
          <p className="mb-3 text-center text-sm text-muted-foreground">@{reportedUsername}</p>
        )}

        {step === "category" && (
          <>
            {categoriesSyncing && (
              <p className="mb-2 text-center text-xs text-muted-foreground">جاري تحديث القائمة…</p>
            )}
            <ul className="space-y-0.5" role="listbox" aria-label="سبب البلاغ">
              {categories.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    className="w-full rounded-xl px-3 py-3.5 text-start text-[15px] hover:bg-secondary active:bg-secondary/80"
                    onClick={() => {
                      setCategory(c.id);
                      if (c.needsImpersonationFlow) setStep("impersonation_who");
                      else setStep("details");
                    }}
                  >
                    {c.labelAr}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === "impersonation_who" && (
          <ul className="space-y-1">
            {(
              [
                ["me", "أنا"],
                ["someone_i_know", "شخص أعرفه"],
                ["celebrity", "مشهور"],
                ["business", "نشاط تجاري"],
              ] as const
            ).map(([id, label]) => (
              <li key={id}>
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-3.5 text-start hover:bg-secondary"
                  onClick={() => {
                    setImpersonationTarget(id);
                    setStep("impersonation_detail");
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === "impersonation_detail" && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted-foreground">اسم الحساب الحقيقي (اختياري)</span>
              <input
                value={realUsername}
                onChange={e => setRealUsername(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2"
                placeholder="@username"
              />
            </label>
            <button
              type="button"
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
              onClick={() => setStep("details")}
            >
              التالي
            </button>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-3">
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              placeholder="صف ما حدث (اختياري)…"
            />
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? "جاري الإرسال…" : "إرسال البلاغ"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 size={56} className="text-[#0095f6] mb-4" />
            <p className="text-lg font-semibold">شكراً لبلاغك</p>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
              سنراجع البلاغ. ستجد تحديثاً في الإشعارات — اضغط عليه لمتابعة حالة الطلب.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-8 w-full max-w-xs rounded-xl bg-secondary py-2.5 text-sm font-semibold"
            >
              تم
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
