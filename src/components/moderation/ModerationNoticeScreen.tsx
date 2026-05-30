import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import logo from "@/assets/logo.png";
import type { ModerationUserNotice } from "@/lib/moderationTypes";

export function ModerationNoticeScreen({
  notice,
  onContinue,
  variant = "fullscreen",
}: {
  notice: ModerationUserNotice;
  onContinue: () => void;
  /** gate = داخل نفس إطار شاشة الحظر */
  variant?: "fullscreen" | "gate";
}) {
  const [entered, setEntered] = useState(false);
  const isWarning = notice.kind === "warning";
  const isRestore = notice.kind === "account_restored";
  const inGate = variant === "gate";

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [notice.id]);

  const rootClass = inGate
    ? "flex min-h-dvh flex-1 flex-col items-center justify-center px-6 py-10 text-center"
    : "flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center";

  return (
    <div dir="rtl" className={rootClass}>
      <img
        src={logo}
        alt="Retweet"
        className={
          "mb-6 h-16 w-16 select-none object-contain dark:invert transition-all duration-700 " +
          (entered ? "scale-100 opacity-100" : "scale-90 opacity-0")
        }
        draggable={false}
      />

      <div
        className={
          "moderation-restore-pop mb-5 flex h-[7.5rem] w-[7.5rem] items-center justify-center rounded-full transition-all duration-700 ease-out " +
          (isWarning
            ? "border-4 border-amber-500/45 bg-amber-500/15 text-amber-600"
            : "border-4 border-emerald-500/40 bg-emerald-500/15 text-emerald-600") +
          (entered ? " scale-100 opacity-100" : " scale-75 opacity-0")
        }
      >
        {isWarning ? (
          <span className="moderation-warning-shake inline-flex">
            <AlertTriangle size={52} strokeWidth={2.2} aria-hidden />
          </span>
        ) : (
          <Check size={52} strokeWidth={2.5} aria-hidden />
        )}
      </div>

      <h1
        className={
          "text-2xl font-extrabold transition-all duration-500 delay-150 " +
          (entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
        }
      >
        {notice.titleAr}
      </h1>
      <p
        className={
          "mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground transition-all duration-500 delay-300 " +
          (entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
        }
      >
        {notice.messageAr}
      </p>

      {isWarning && (notice.guidelineAr || notice.reasonDetail) ? (
        <div
          className={
            "mt-5 w-full max-w-sm rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3.5 text-start transition-all duration-500 delay-[380ms] " +
            (entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
          }
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            سبب التحذير
          </p>
          {notice.guidelineAr ? (
            <p className="mt-2 text-[15px] font-bold leading-snug text-foreground">{notice.guidelineAr}</p>
          ) : null}
          {notice.reasonDetail ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">تفاصيل المخالفة</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">{notice.reasonDetail}</p>
            </>
          ) : null}
        </div>
      ) : null}

      {isRestore ? (
        <p
          className={
            "mt-3 text-sm font-medium text-emerald-600 transition-all duration-500 delay-[420ms] " +
            (entered ? "opacity-100" : "opacity-0")
          }
        >
          تم فك الحظر النهائي — مرحباً بعودتك
        </p>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        className={
          "moderation-restore-pop mt-8 w-full max-w-sm rounded-xl py-3.5 text-[15px] font-bold text-primary-foreground transition-all duration-500 delay-500 " +
          (isWarning ? "bg-amber-600 hover:bg-amber-600/90" : "bg-primary") +
          (entered ? " translate-y-0 opacity-100" : " translate-y-3 opacity-0")
        }
      >
        {isWarning ? "فهمت" : "متابعة إلى التطبيق"}
      </button>
    </div>
  );
}
