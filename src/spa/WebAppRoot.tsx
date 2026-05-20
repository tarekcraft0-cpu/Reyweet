import { useEffect, useState } from "react";
import { apiBackendEnabled, ensureApiRuntimeConfig, getApiToken } from "@/lib/apiBackend";
import { bootstrapWebAppSession } from "@/lib/webSessionBootstrap";
import { AppProvider, readPersistedAppState } from "@/lib/store";
import type { AppState } from "@/lib/types";
import { App } from "@/components/App";
import { logAuthRoute } from "@/lib/authRouteDebug";
import { clearStaleApiConfig, peekApiBaseUrl } from "@/lib/apiConfig";

/** غلاف /app — نسخة الويب الكاملة مرتبطة بـ Retweet API وقاعدة البيانات على القرص D */
export function WebAppRoot() {
  const [ready, setReady] = useState(false);
  const [bootState, setBootState] = useState<AppState | null>(null);
  const [apiMissing, setApiMissing] = useState(false);

  useEffect(() => {
    clearStaleApiConfig();
    logAuthRoute("webapp-root-mount", {
      apiEnabled: apiBackendEnabled(),
      hasToken: !!getApiToken(),
    });
    let cancelled = false;

    const waitForNativeApiConfig = (): Promise<void> => {
      if (typeof window === "undefined") return Promise.resolve();
      const w = window as Window & { __RETWEET_NATIVE_SHELL__?: boolean; __RETWEET_API_URL__?: string };
      if (!w.__RETWEET_NATIVE_SHELL__) return Promise.resolve();
      if (w.__RETWEET_API_URL__) return Promise.resolve();
      return new Promise(resolve => {
        const done = () => resolve();
        const t = window.setTimeout(done, 12_000);
        const onReady = () => {
          window.clearTimeout(t);
          done();
        };
        window.addEventListener("retweet-api-config-ready", onReady, { once: true });
      });
    };

    void waitForNativeApiConfig()
      .then(() => ensureApiRuntimeConfig())
      .then(async () => {
        if (cancelled) return;
        if (!apiBackendEnabled()) {
          setApiMissing(true);
          return;
        }
        const w = window as Window & { __RETWEET_API_URL__?: string };
        const base = (w.__RETWEET_API_URL__ || peekApiBaseUrl()).replace(/\/$/, "");
        const healthPath = base ? `${base}/health` : "/health";
        try {
          const ctl = new AbortController();
          const healthTimer = window.setTimeout(() => ctl.abort(), 12_000);
          const res = await fetch(healthPath, { cache: "no-store", signal: ctl.signal });
          window.clearTimeout(healthTimer);
          const j = (await res.json().catch(() => null)) as {
            ok?: boolean;
            dbOk?: boolean;
          } | null;
          if (!res.ok || j?.ok !== true || j?.dbOk === false) {
            setApiMissing(true);
            return;
          }
        } catch {
          setApiMissing(true);
          return;
        }
        await Promise.race([
          bootstrapWebAppSession(),
          new Promise<void>(resolve => window.setTimeout(resolve, 20_000)),
        ]);
      })
      .then(() => {
        if (!cancelled) setBootState(readPersistedAppState());
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
          logAuthRoute("webapp-root-ready", {
            bootUserId: readPersistedAppState().currentUserId,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        جاري التحميل…
      </div>
    );
  }

  if (apiMissing || !apiBackendEnabled()) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm">
        <p className="font-semibold text-foreground">التطبيق غير مربوط بالخادم</p>
        <p className="text-muted-foreground leading-relaxed">
          الخادم غير متاح حالياً. تأكد أن جهازك يشغّل{" "}
          <span className="font-mono text-xs">npm run api:tunnel</span>
          {" "}وأن رابط النفق محدّث على الموقع. أعد فتح التطبيق بعد دقيقة.
        </p>
        <a href="/" className="text-primary underline">
          العودة للصفحة الرئيسية
        </a>
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden bg-background text-start supports-[height:100dvh]:min-h-dvh">
      <AppProvider initialState={bootState ?? undefined}>
        <App />
      </AppProvider>
    </div>
  );
}
