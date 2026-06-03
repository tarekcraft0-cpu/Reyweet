type TelemetryPayload = {
  type: "ui_error" | "unhandled_error";
  message: string;
  stack?: string;
  componentStack?: string;
  label?: string;
  ts: number;
};

const TELEMETRY_KEY = "retweet_recent_telemetry_v1";

function persistLocal(payload: TelemetryPayload): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(TELEMETRY_KEY);
    const prev = raw ? (JSON.parse(raw) as TelemetryPayload[]) : [];
    const next = [payload, ...prev].slice(0, 20);
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function sendToEndpoint(payload: TelemetryPayload): void {
  if (typeof navigator === "undefined") return;
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/client-telemetry", blob);
      return;
    }
    void fetch("/api/client-telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export function captureUiError(input: {
  message: string;
  stack?: string;
  componentStack?: string;
  label?: string;
}): void {
  const payload: TelemetryPayload = {
    type: "ui_error",
    message: input.message,
    stack: input.stack,
    componentStack: input.componentStack,
    label: input.label,
    ts: Date.now(),
  };
  persistLocal(payload);
  sendToEndpoint(payload);
}

export function bindUnhandledTelemetry(): void {
  if (typeof window === "undefined") return;
  const marker = "__retweet_telemetry_bound__";
  if ((window as any)[marker]) return;
  (window as any)[marker] = true;
  window.addEventListener("error", ev => {
    captureUiError({
      message: ev.message || "window.error",
      stack: ev.error?.stack,
      label: "window-error",
    });
  });
  window.addEventListener("unhandledrejection", ev => {
    const reason = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
    captureUiError({
      message: reason.message || "unhandledrejection",
      stack: reason.stack,
      label: "window-unhandledrejection",
    });
  });
}

