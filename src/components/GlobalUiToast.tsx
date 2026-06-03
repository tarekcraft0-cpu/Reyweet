import { useEffect, useRef, useState } from "react";

const TOAST_MS = 2600;

export function GlobalUiToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const msg = (ev as CustomEvent<{ message?: string }>).detail?.message?.trim();
      if (!msg) return;
      setMessage(msg);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setMessage(null);
      }, TOAST_MS);
    };
    window.addEventListener("retweet-ui-toast", onToast);
    return () => {
      window.removeEventListener("retweet-ui-toast", onToast);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--sab,env(safe-area-inset-bottom,0px))+4.6rem)] z-[140] mx-auto w-full max-w-md px-3">
      <div className="rounded-xl border border-border bg-card/95 px-3 py-2 text-center text-sm text-foreground shadow-lg backdrop-blur">
        {message}
      </div>
    </div>
  );
}

