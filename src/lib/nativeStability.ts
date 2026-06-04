/** حزمة Capacitor داخل IPA — base نسبي ./ */
export function isCapacitorBundledApp(): boolean {
  try {
    return import.meta.env.BASE_URL === "./";
  } catch {
    return false;
  }
}

function detectNativeShell(): boolean {
  if (isCapacitorBundledApp()) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __RETWEET_NATIVE_SHELL__?: boolean;
    __RETWEET_NO_SELECT_BOOT__?: boolean;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  if (w.__RETWEET_NATIVE_SHELL__ === true) return true;
  if (w.__RETWEET_NO_SELECT_BOOT__ === true) return true;
  try {
    if (w.Capacitor?.isNativePlatform?.() === true) return true;
  } catch {
    /* ignore */
  }
  try {
    const html = document.documentElement;
    if (
      html.classList.contains("retweet-native-shell") ||
      html.getAttribute("data-native-app") === "1"
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** iOS/Android أو حزمة مدمجة */
export function isNativeMobileApp(): boolean {
  return detectNativeShell();
}

let quietUntil = 0;

/** بعد تسجيل الدخول — لا نستمع لـ resize/visualViewport لفترة (يمنع React #185) */
function nativeQuietPeriodMs(): number {
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "")) {
    return 1200;
  }
  return 4000;
}

export function beginNativePostLoginQuietPeriod(ms?: number): void {
  if (!isNativeMobileApp() || typeof performance === "undefined") return;
  const gap = ms ?? nativeQuietPeriodMs();
  quietUntil = Math.max(quietUntil, performance.now() + gap);
}

export function isNativePostLoginQuietPeriod(): boolean {
  if (!isNativeMobileApp() || typeof performance === "undefined") return false;
  return performance.now() < quietUntil;
}

/** هل يُسمح بمستمعي resize التي تعيد ضبط العرض؟ */
export function allowNativeLayoutResizeListeners(): boolean {
  if (!isNativeMobileApp()) return true;
  return !isNativePostLoginQuietPeriod();
}
