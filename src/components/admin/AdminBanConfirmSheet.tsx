import { useCallback, useEffect, useState } from "react";
import { Ban, Check } from "lucide-react";
import { BottomDismissSheet } from "../BottomDismissSheet";

export type AdminBanAction = "ban" | "temp_ban" | "perm_ban";

export function AdminBanConfirmSheet({
  open,
  onClose,
  username,
  action,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  action: AdminBanAction;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [phase, setPhase] = useState<"confirm" | "loading" | "success">("confirm");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setPhase("confirm");
      setError("");
    }
  }, [open]);

  const permanent = action === "perm_ban";
  const appealHold = action === "ban";
  const title = permanent
    ? "حظر نهائي للحساب"
    : appealHold
      ? "حظر الحساب"
      : "حظر مؤقت للحساب";
  const subtitle = permanent
    ? `هل أنت متأكد من حظر @${username} نهائياً؟ لن يتمكن من استخدام التطبيق ولا يمكنه تقديم طعن.`
    : appealHold
      ? `هل أنت متأكد من حظر @${username}؟ لا مدة زمنية — يبقى محظوراً حتى يقدّم طعناً للمراجعة.`
      : `هل أنت متأكد من حظر @${username} مؤقتاً (7 أيام)؟`;

  const handleConfirm = useCallback(async () => {
    setError("");
    setPhase("loading");
    const r = await onConfirm();
    if (!r.ok) {
      setPhase("confirm");
      setError(r.error || "تعذر تنفيذ الحظر");
      return;
    }
    setPhase("success");
    window.setTimeout(() => {
      onClose();
    }, 1500);
  }, [onConfirm, onClose]);

  return (
    <BottomDismissSheet
      open={open}
      onClose={phase === "loading" ? () => {} : onClose}
      zIndex={320}
    >
      <div
        dir="rtl"
        className={
          "border-t-4 border-destructive px-4 pb-6 pt-2 " +
          (phase === "success" ? "text-center" : "text-start")
        }
      >
        {phase === "success" ? (
          <div className="flex flex-col items-center py-8">
            <div className="ban-success-check mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <Check size={44} strokeWidth={2.5} aria-hidden />
            </div>
            <p className="text-lg font-bold text-foreground">تم حظر الحساب</p>
            <p className="mt-2 text-sm text-muted-foreground">@{username}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <Ban size={24} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-foreground">{title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            {error ? (
              <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            ) : null}
            <div className="flex flex-col gap-2" data-no-sheet-drag>
              <button
                type="button"
                disabled={phase === "loading"}
                onClick={() => void handleConfirm()}
                className="w-full rounded-xl bg-destructive py-3.5 text-[15px] font-bold text-white disabled:opacity-60"
              >
                {phase === "loading"
                  ? "جاري التنفيذ…"
                  : permanent
                    ? "تأكيد الحظر النهائي"
                    : appealHold
                      ? "تأكيد الحظر"
                      : "تأكيد الحظر المؤقت"}
              </button>
              <button
                type="button"
                disabled={phase === "loading"}
                onClick={onClose}
                className="w-full rounded-xl bg-secondary py-3 text-[15px] font-semibold disabled:opacity-60"
              >
                إلغاء
              </button>
            </div>
          </>
        )}
      </div>
    </BottomDismissSheet>
  );
}
