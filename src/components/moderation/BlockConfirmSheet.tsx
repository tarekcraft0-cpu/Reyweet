import { useCallback, useEffect, useState } from "react";
import { Check, UserX } from "lucide-react";
import { BottomDismissSheet } from "../BottomDismissSheet";

export type BlockConfirmMode = "block" | "unblock";

export function BlockConfirmSheet({
  open,
  onClose,
  username,
  mode,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  mode: BlockConfirmMode;
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

  const handleConfirm = useCallback(() => {
    setError("");
    setPhase("loading");

    void onConfirm().then((r) => {
      if (!r.ok) {
        setPhase("confirm");
        setError(r.error || "تعذر تنفيذ العملية");
        return;
      }
      setPhase("success");
      window.setTimeout(() => {
        onClose();
      }, 1100);
    });
  }, [onConfirm, onClose]);

  const isBlock = mode === "block";
  const title = isBlock ? "تأكيد حظر الحساب" : "إلغاء الحظر";
  const subtitle = isBlock
    ? `هل أنت متأكد أنك تريد حظر @${username}؟ سيتم إلغاء المتابعة وطلبات المتابعة بينكما ولن ترى منشوراته.`
    : `هل تريد إلغاء حظر @${username}؟ لن تُستعاد المتابعة تلقائياً.`;

  const successTitle = isBlock ? "تم حظر الحساب" : "تم إلغاء الحظر";
  const successHint = isBlock
    ? "لم يعد بينكما متابعة — كأنكما لم تكونا متابعين لبعض."
    : "يمكنك متابعته من جديد إذا رغبت.";

  return (
    <BottomDismissSheet
      open={open}
      onClose={phase === "success" ? () => {} : onClose}
      zIndex={10060}
    >
      <div
        dir="rtl"
        className={
          "border-t-4 border-destructive bg-gradient-to-b from-destructive/[0.08] to-background px-4 pb-6 pt-2 " +
          (phase === "success" ? "text-center" : "text-start")
        }
      >
        {phase === "success" ? (
          <div className="flex flex-col items-center py-6" key={`success-${mode}`}>
            <div className="ban-success-burst relative mb-4 flex h-[5.5rem] w-[5.5rem] items-center justify-center">
              <span className="ban-success-ring absolute inset-0 rounded-full border-2 border-emerald-500/50" aria-hidden />
              <span className="ban-success-check relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <Check size={42} strokeWidth={2.5} aria-hidden />
              </span>
            </div>
            <p className="ban-success-title text-lg font-bold text-foreground">{successTitle}</p>
            <p className="ban-success-sub mt-1.5 text-sm text-muted-foreground">@{username}</p>
            <p className="ban-success-sub mt-2 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
              {successHint}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/20 text-destructive ring-2 ring-destructive/25">
                <UserX size={24} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-destructive">{title}</p>
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
                onClick={handleConfirm}
                className="w-full rounded-xl bg-destructive py-3.5 text-[15px] font-bold text-white shadow-md transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {phase === "loading"
                  ? "جاري التنفيذ…"
                  : isBlock
                    ? "حظر الحساب"
                    : "إلغاء الحظر"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-secondary py-3 text-[15px] font-semibold text-foreground"
              >
                تراجع
              </button>
            </div>
          </>
        )}
      </div>
    </BottomDismissSheet>
  );
}
