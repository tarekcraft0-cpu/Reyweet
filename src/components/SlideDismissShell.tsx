import {
  createContext,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GENERIC_DISMISS_PULL_CSS_VAR, SETTINGS_DISMISS_PULL_CSS_VAR } from "@/lib/navigationDismiss";
import { useSlideDismissBack, type UseSlideDismissBackOptions } from "@/hooks/useSlideDismissBack";

type SlideDismissContextValue = {
  requestDismiss: (opts?: { immediate?: boolean }) => boolean;
};

export const SlideDismissContext = createContext<SlideDismissContextValue | null>(null);

export function useSlideDismissRequest() {
  return useContext(SlideDismissContext)?.requestDismiss;
}

export type SheetDismissEdgeProps = {
  role: "presentation";
  "aria-hidden": boolean;
  className: string;
  style: CSSProperties;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: () => void;
};

const SheetDismissEdgeContext = createContext<{ edgeStripProps: SheetDismissEdgeProps } | null>(null);

export function useSheetDismissEdge() {
  return useContext(SheetDismissEdgeContext);
}

export function SheetDismissEdgeProvider({
  edgeStripProps,
  children,
}: {
  edgeStripProps: SheetDismissEdgeProps;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ edgeStripProps }), [edgeStripProps]);
  return <SheetDismissEdgeContext.Provider value={value}>{children}</SheetDismissEdgeContext.Provider>;
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
  const { containerRef, panelStyle, requestDismiss, edgeStripProps, panelSwipeProps } = useSlideDismissBack(opts);
  const panelTouchStyle = panelSwipeProps.style;
  const panelPointerHandlers = panelSwipeProps.onPointerDown
    ? {
        onPointerDown: panelSwipeProps.onPointerDown,
        onPointerMove: panelSwipeProps.onPointerMove,
        onPointerUp: panelSwipeProps.onPointerUp,
        onPointerCancel: panelSwipeProps.onPointerCancel,
        onLostPointerCapture: panelSwipeProps.onLostPointerCapture,
      }
    : {};

  const ctx = useMemo(() => ({ requestDismiss }), [requestDismiss]);

  const isOverlay = variant === "overlay";

  const panel = (
    <>
      <div {...edgeStripProps} />
      <div
        className={cn(
          "relative z-10 flex w-full flex-col will-change-transform pointer-events-auto",
          /* overlay/inline: ارتفاع الشاشة — التمرير داخل ProfileScreen (profile-scroll-pane) */
          "h-full min-h-0 w-full flex flex-col overflow-hidden",
        )}
        style={{ ...panelStyle, ...panelTouchStyle }}
        {...panelPointerHandlers}
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
          data-edge-swipe-root
          data-profile-inline-dismiss
          className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden", className)}
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
          "pointer-events-auto fixed inset-x-0 flex justify-center overflow-hidden overscroll-none bg-transparent " +
          className
        }
        style={{
          zIndex: overlayZIndex,
          top: "var(--sat, env(safe-area-inset-top, 0px))",
          bottom: 0,
        }}
      >
        <div
          ref={containerRef}
          data-edge-swipe-root
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
        "flex shrink-0 flex-row items-center gap-3 border-b border-border bg-background px-3 py-2.5 pt-[max(0.5rem,var(--sat))] " +
        className
      }
    >
      <SlideDismissBackButton
        data-no-dismiss-drag
        data-profile-back-btn
        onDismiss={onBack}
        className="relative z-[10002] flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-secondary active:bg-secondary/80"
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
        const started = requestDismiss?.({ immediate: false });
        if (!started) onDismiss?.();
      }}
    >
      {children}
    </button>
  );
}

export type AppDismissSheetProps = UseSlideDismissBackOptions & {
  children: ReactNode;
  onClose: () => void;
  contentClassName?: string;
  overlayZIndex?: number;
  /** سحب من أي مكان على اللوحة (إعدادات، إشعارات، …) */
  panelSwipeDismiss?: boolean;
  dismissPullCssVar?: string;
  darkPanelChrome?: boolean;
  /** انزلاق عند الفتح من يمين الشاشة (RTL) */
  animateOnMount?: boolean;
};

/**
 * ورقة تطبيق موحّدة: سحب من الحافة (RTL) + انزلاق تفاعلي + زر رجوع عبر SlideDismissContext.
 */
export function AppDismissSheet({
  children,
  onClose,
  contentClassName,
  overlayZIndex = 50,
  panelSwipeDismiss = true,
  dismissPullCssVar,
  darkPanelChrome,
  enabled = true,
  blocked = false,
  edgeBottomInsetPx,
  animateOnMount = false,
}: AppDismissSheetProps) {
  const pullVar = dismissPullCssVar ?? (panelSwipeDismiss ? GENERIC_DISMISS_PULL_CSS_VAR : undefined);
  const isDarkChrome =
    darkPanelChrome ?? (contentClassName ?? "").includes("bg-black");
  const { containerRef, panelStyle, requestDismiss, edgeStripProps, panelSwipeProps } = useSlideDismissBack({
    onDismiss: onClose,
    enabled,
    blocked,
    dismissPullCssVar: pullVar,
    panelSwipeDismiss,
    edgeBottomInsetPx,
    animateOnMount,
  });
  const panelTouchStyle = panelSwipeProps.style;
  const panelPointerHandlers = panelSwipeProps.onPointerDown
    ? {
        onPointerDown: panelSwipeProps.onPointerDown,
        onPointerMove: panelSwipeProps.onPointerMove,
        onPointerUp: panelSwipeProps.onPointerUp,
        onPointerCancel: panelSwipeProps.onPointerCancel,
        onLostPointerCapture: panelSwipeProps.onLostPointerCapture,
      }
    : {};
  const ctx = useMemo(() => ({ requestDismiss }), [requestDismiss]);
  const dimBase = isDarkChrome ? 0.48 : 0.35;
  const panelClassName = cn(
    "app-dismiss-sheet-panel no-scrollbar relative z-10 flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain shadow-2xl will-change-transform",
    isDarkChrome && "[color-scheme:dark]",
    contentClassName ?? "bg-background",
  );

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-40 bg-black"
        style={{
          opacity: pullVar
            ? `calc(${dimBase} * (1 - var(${pullVar}, 0)))`
            : dimBase,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 flex justify-center bg-transparent"
        style={{
          zIndex: overlayZIndex,
          top: "var(--sat, env(safe-area-inset-top, 0px))",
          bottom: 0,
        }}
      >
        <div ref={containerRef} data-edge-swipe-root className="pointer-events-auto relative h-full w-full max-w-md overflow-hidden">
          <div {...edgeStripProps} />
          <SlideDismissContext.Provider value={ctx}>
            <div
              className={panelClassName}
              style={{ ...panelStyle, ...panelTouchStyle }}
              onClick={e => e.stopPropagation()}
              {...panelPointerHandlers}
            >
              {children}
            </div>
          </SlideDismissContext.Provider>
        </div>
      </div>
    </>
  );
}

/** @deprecated استورد SETTINGS_DISMISS_PULL_CSS_VAR من @/lib/navigationDismiss */
export { SETTINGS_DISMISS_PULL_CSS_VAR };
