import { useEffect, useState } from "react";
import { apiBackendEnabled, ensureApiRuntimeConfig, getApiToken } from "@/lib/apiBackend";
import { bootstrapWebAppSession } from "@/lib/webSessionBootstrap";
import { AppProvider, readPersistedAppState } from "@/lib/store";
import type { AppState } from "@/lib/types";
import { App } from "@/components/App";
import { logAuthRoute } from "@/lib/authRouteDebug";
import { clearStaleApiConfig, probeHealth } from "@/lib/apiConfig";
import { isNativeCapacitorShell, isPublicAppHost, isVpsProductionHost } from "@/lib/apiUrlPolicy";
import { warmGlobalPointerBackRouter } from "@/lib/globalPointerBackRouter";

/** غلاف /app — نسخة الويب الكاملة مرتبطة بـ Retweet API وقاعدة البيانات على القرص D */
export function WebAppRoot() {
  const [ready, setReady] = useState(false);
  const [bootState, setBootState] = useState<AppState | null>(null);
  const [apiMissing, setApiMissing] = useState(false);

  useEffect(() => {
    warmGlobalPointerBackRouter();
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
        if (!(await probeHealth())) {
          setApiMissing(true);
          return;
        }
        await Promise.race([
          bootstrapWebAppSession(),
          new Promise<void>(resolve => window.setTimeout(resolve, 12_000)),
        ]);
      })
      .catch(err => {
        console.error("[Retweet] WebAppRoot bootstrap failed:", err);
        if (!cancelled) setApiMissing(true);
      })
      .then(() => {
        if (!cancelled) {
          try {
            setBootState(readPersistedAppState());
          } catch (e) {
            console.warn("[Retweet] readPersistedAppState failed:", e);
            setBootState(null);
          }
        }
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
    const retry = () => {
      try {
        localStorage.removeItem("retweet_web_api_config");
      } catch {
        /* ignore */
      }
      clearStaleApiConfig();
      window.location.reload();
    };
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-background px-6 text-center text-sm">
        <p className="font-semibold text-foreground">تعذر الاتصال بالخادم</p>
        <p className="text-muted-foreground leading-relaxed">
          {isVpsProductionHost() ? (
            <>
              تأكد أن خدمة <span className="font-mono text-xs">retweet-api</span> تعمل على السيرفر،
              ثم جرّب فتح{" "}
              <a href="http://109.199.111.29/app/" className="text-primary underline">
                http://109.199.111.29/app/
              </a>{" "}
              مباشرة.
            </>
          ) : isNativeCapacitorShell() ? (
            <>
              تأكد من اتصال الإنترنت. التطبيق يتصل عبر{" "}
              <span className="font-mono text-xs">reyweet.vercel.app</span>. إن استمر
              الخطأ، أعد تثبيت IPA بعد بناء جديد من Codemagic.
            </>
          ) : isPublicAppHost() ? (
            <>
              افتح التطبيق من السيرفر مباشرة:{" "}
              <a href="http://109.199.111.29/app/" className="text-primary underline">
                http://109.199.111.29/app/
              </a>
              . رابط Vercel يوجّه تلقائياً — إن بقيت هنا فعّل التحويل أو امسح الكاش.
            </>
          ) : (
            <>
              على كمبيوترك (حيث قاعدة البيانات) شغّل واتركه مفتوحاً:{" "}
              <span className="font-mono text-xs block mt-2">npm run stack:reyweet</span>
              ثم اضغط «إعادة المحاولة». التطبيق والموقع يستخدمان نفس الخادم — يجب أن يبقى
              شغّالاً.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground"
        >
          إعادة المحاولة
        </button>
        <a href="https://reyweet.vercel.app" className="text-primary underline">
          فتح الموقع في Safari
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
