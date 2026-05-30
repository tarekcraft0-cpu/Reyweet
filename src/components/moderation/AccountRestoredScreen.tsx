import { useEffect, useState } from "react";

export function AccountRestoredScreen({
  message = "تم قبول طعنك. يمكنك الآن استخدام الحساب بشكل طبيعي.",
  onContinue,
}: {
  message?: string;
  onContinue: () => void;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div
        className={
          "moderation-restore-pop mb-5 flex h-28 w-28 items-center justify-center rounded-full border-4 border-emerald-500/40 bg-emerald-500/15 text-emerald-500 transition-all duration-700 ease-out " +
          (entered ? "scale-100 opacity-100" : "scale-75 opacity-0")
        }
      >
        <span className="text-6xl leading-none">✓</span>
      </div>
      <h1
        className={
          "text-2xl font-extrabold transition-all duration-500 delay-150 " +
          (entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
        }
      >
        تم قبول طعنك
      </h1>
      <p
        className={
          "mt-2 max-w-sm text-sm text-muted-foreground transition-all duration-500 delay-300 " +
          (entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
        }
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onContinue}
        className={
          "moderation-restore-pop mt-8 w-full max-w-sm rounded-xl bg-primary py-3 font-semibold text-primary-foreground transition-all duration-500 delay-500 " +
          (entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")
        }
      >
        متابعة إلى التطبيق
      </button>
    </div>
  );
}
