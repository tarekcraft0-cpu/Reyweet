import { useEffect, useState } from "react";
import { apiBackendEnabled, ensureApiRuntimeConfig, getApiToken } from "@/lib/apiBackend";
import { bootstrapWebAppSession } from "@/lib/webSessionBootstrap";
import { AppProvider, readPersistedAppState } from "@/lib/store";
import type { AppState } from "@/lib/types";
import { App } from "@/components/App";
import logo from "@/assets/logo.png";
import { logAuthRoute } from "@/lib/authRouteDebug";
import { clearStaleApiConfig, probeHealth } from "@/lib/apiConfig";
import { isNativeCapacitorShell, isPublicAppHost, isVpsProductionHost } from "@/lib/apiUrlPolicy";
import { initNativeKeyboardLayout } from "@/lib/chatKeyboardInsets";
import { initSafeAreaBootstrap } from "@/lib/safeAreaBootstrap";
import { warmGlobalPointerBackRouter } from "@/lib/globalPointerBackRouter";
import {
  installNativeTextSelectionGuard,
  isNoSelectShellActive,
  nativeNoSelectCaptureHandlers,
} from "@/lib/nativeTextSelectionGuard";

/** غلاف /app — نسخة الويب الكاملة مرتبطة بـ Retweet API وقاعدة البيانات على القرص D */
export function WebAppRoot() {
  const [ready, setReady] = useState(false);
  const [bootState, setBootState] = useState<AppState | null>(null);
  const [apiMissing, setApiMissing] = useState(false);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("force") || url.searchParams.has("_b") || url.searchParams.has("_")) {
        url.searchParams.delete("force");
        url.searchParams.delete("_b");
        url.searchParams.delete("_");
        const next = url.pathname + (url.search || "") + url.hash;
        window.history.replaceState(null, "", next || "/app/");
      }
    } catch {
      /* ignore */
    }
    installNativeTextSelectionGuard();
    warmGlobalPointerBackRouter();
    initSafeAreaBootstrap();
    clearStaleApiConfig();
    if (isNativeCapacitorShell()) {
      void initNativeKeyboardLayout();
    }
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
        if (!isNativeCapacitorShell() && !(await probeHealth())) {
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
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-black/10" />
        <div className="relative z-10 flex flex-col items-center gap-5">
          <div className="relative">
            <img
              src={logo}
              alt="Retweet"
              className="h-20 w-20 rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 animate-pulse"
            />
            <span className="absolute -inset-2 rounded-[1.15rem] border-2 border-primary/45 border-t-transparent animate-spin" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary/90 animate-bounce [animation-delay:-0.25s]" />
            <span className="h-2 w-2 rounded-full bg-primary/75 animate-bounce [animation-delay:-0.125s]" />
            <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" />
          </div>
        </div>
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

  const nativeShell = isNativeCapacitorShell();

  return (
    <div
      className={
        "relative mx-auto w-full max-w-md overflow-x-hidden bg-background text-start " +
        (nativeShell
          ? "flex h-full min-h-0 flex-col"
          : "min-h-dvh supports-[height:100dvh]:min-h-dvh")
      }
      {...nativeNoSelectCaptureHandlers}
    >
      <AppProvider initialState={bootState ?? undefined}>
        <App />
      </AppProvider>
    </div>
  );
}
