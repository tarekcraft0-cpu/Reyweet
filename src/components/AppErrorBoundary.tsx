import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearRetweetLocalSession, describeUiError } from "@/lib/uiErrorMessage";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null; componentStack?: string };

/** يمنع شاشة إنجليزية من React/Vite ويعرض رسالة عربية مفهومة */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[Retweet] UI crash:", error.message, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.error) {
      const hint = describeUiError(this.state.error);
      return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-background px-6 text-center" dir="rtl" lang="ar">
          <p className="text-lg font-semibold text-foreground">حدث خطأ في الواجهة</p>
          {this.props.label ? <p className="text-xs text-muted-foreground">{this.props.label}</p> : null}
          <p className="text-sm text-muted-foreground leading-relaxed">{hint}</p>
          <details className="w-full max-w-sm text-start text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1 font-medium text-foreground">تفاصيل الخطأ</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/60 p-3 text-[11px] leading-snug">
              {this.state.error.message}
              {this.state.componentStack ? `\n\n${this.state.componentStack}` : ""}
            </pre>
          </details>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <button
              type="button"
              className="rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
              onClick={() => this.setState({ error: null, componentStack: undefined })}
            >
              إعادة المحاولة
            </button>
            <button
              type="button"
              className="rounded-2xl border border-border bg-background px-6 py-3 text-sm font-medium text-foreground"
              onClick={() => window.location.reload()}
            >
              تحديث الصفحة
            </button>
            <button
              type="button"
              className="rounded-2xl border border-border bg-background px-6 py-3 text-sm font-medium text-foreground"
              onClick={() => {
                clearRetweetLocalSession();
                window.location.href = "/app/";
              }}
            >
              مسح الجلسة وإعادة الدخول
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
