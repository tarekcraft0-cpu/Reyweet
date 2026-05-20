import {
  createContext,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { ArrowRight } from "lucide-react";
import { useSlideDismissBack, type UseSlideDismissBackOptions } from "@/hooks/useSlideDismissBack";

type SlideDismissContextValue = {
  requestDismiss: (opts?: { immediate?: boolean }) => boolean;
};

export const SlideDismissContext = createContext<SlideDismissContextValue | null>(null);

export function useSlideDismissRequest() {
  return useContext(SlideDismissContext)?.requestDismiss;
}

type ShellProps = UseSlideDismissBackOptions & {
  children: ReactNode;
  className?: string;
  /** شاشة كاملة ثابتة (محادثة/مودال) أو داخل التبويب */
  variant?: "overlay" | "inline";
  overlayZIndex?: number;
};

export function SlideDismissShell({
  children,
  className = "",
  variant = "overlay",
  overlayZIndex = 200,
  ...opts
}: ShellProps) {
  const { containerRef, panelStyle, requestDismiss, edgeStripProps } = useSlideDismissBack(opts);

  const ctx = useMemo(() => ({ requestDismiss }), [requestDismiss]);

  const panel = (
    <>
      <div {...edgeStripProps} />
      <div
        className={
          "relative z-10 flex h-full min-h-0 w-full flex-col will-change-transform " +
          (variant === "inline" ? "flex-1" : "")
        }
        style={panelStyle}
      >
        {children}
      </div>
    </>
  );

  if (variant === "inline") {
    return (
      <SlideDismissContext.Provider value={ctx}>
        <div
          ref={containerRef}
          className={"relative flex min-h-0 flex-1 flex-col overflow-hidden " + className}
        >
          {panel}
        </div>
      </SlideDismissContext.Provider>
    );
  }

  return (
    <SlideDismissContext.Provider value={ctx}>
      <div
        className={
          "fixed inset-x-0 flex justify-center overflow-hidden overscroll-none bg-background " + className
        }
        style={{ zIndex: overlayZIndex, top: 0, bottom: 0 }}
      >
        <div
          ref={containerRef}
          className="relative h-full w-full max-w-md min-w-0 overflow-hidden overscroll-none"
        >
          {panel}
        </div>
      </div>
    </SlideDismissContext.Provider>
  );
}

/** شريط علوي RTL: زر الرجوع دائماً أعلى اليمين */
export function RtlScreenHeader({
  onBack,
  title,
  children,
  className = "",
  backLabel = "رجوع",
}: {
  onBack: () => void;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  backLabel?: string;
}) {
  return (
    <div
      dir="rtl"
      className={
        "flex shrink-0 flex-row items-center gap-3 border-b border-border bg-background px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top,0px))] " +
        className
      }
    >
      <SlideDismissBackButton
        onDismiss={onBack}
        className="shrink-0 rounded-full p-2 hover:bg-secondary active:bg-secondary/80"
        aria-label={backLabel}
      >
        <ArrowRight size={22} strokeWidth={1.75} />
      </SlideDismissBackButton>
      {title != null ? (
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold">{title}</h1>
      ) : (
        <div className="min-w-0 flex-1">{children}</div>
      )}
      <span className="w-10 shrink-0" aria-hidden />
    </div>
  );
}

/** زر رجوع — ينفّذ انزلاق الشاشة ثم onDismiss (مثل إنستغرام) */
export function SlideDismissBackButton({
  className = "",
  children,
  onClick,
  onDismiss,
  navScope = "shell",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  onDismiss?: () => void;
  /** shell = إغلاق الشاشة/المودال بالسحب؛ local = تنقّل داخلي فقط */
  navScope?: "shell" | "local";
}) {
  const requestDismiss = useSlideDismissRequest();
  return (
    <button
      type="button"
      {...rest}
      className={
        "touch-manipulation transition-transform duration-150 ease-out active:scale-[0.88] " + className
      }
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (navScope === "local") {
          onDismiss?.();
          return;
        }
        const started = requestDismiss?.();
        if (!started) onDismiss?.();
      }}
    >
      {children}
    </button>
  );
}
