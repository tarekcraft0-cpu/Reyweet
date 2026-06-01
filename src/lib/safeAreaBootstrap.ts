import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { allowNativeLayoutResizeListeners } from "./nativeStability";

function parsePx(raw: string): number {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function readCssVar(name: string): number {
  if (typeof document === "undefined") return 0;
  return parsePx(getComputedStyle(document.documentElement).getPropertyValue(name));
}

/** قياس env(safe-area-inset-*) عبر عنصر مؤقت — أدق من الاعتماد على CSS فقط */
function probeEnvInset(edge: "top" | "bottom" | "left" | "right"): number {
  if (typeof document === "undefined" || !document.body) return 0;
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:0;" +
    (edge === "top"
      ? "padding-top:env(safe-area-inset-top)"
      : edge === "bottom"
        ? "padding-bottom:env(safe-area-inset-bottom)"
        : edge === "left"
          ? "padding-left:env(safe-area-inset-left)"
          : "padding-right:env(safe-area-inset-right)");
  document.body.appendChild(el);
  const style = getComputedStyle(el);
  const v =
    edge === "top"
      ? style.paddingTop
      : edge === "bottom"
        ? style.paddingBottom
        : edge === "left"
          ? style.paddingLeft
          : style.paddingRight;
  el.remove();
  return parsePx(v);
}

function iosStatusBarFallback(): number {
  if (typeof window === "undefined") return 0;
  const ua = navigator.userAgent || "";
  if (!/iPhone|iPad|iPod/i.test(ua)) return 0;
  const longSide = Math.max(window.screen.width, window.screen.height);
  /** iPhone X والأحدث (شاشة ≥812) — نوتش ~47px */
  if (longSide >= 812) return 47;
  return 20;
}

let lastSafeAreaKey = "";

export function syncSafeAreaCssVars(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const envTop = probeEnvInset("top");
  const envBottom = probeEnvInset("bottom");
  const envLeft = probeEnvInset("left");
  const envRight = probeEnvInset("right");

  const swiftTop = readCssVar("--retweet-safe-top");
  const swiftBottom = readCssVar("--retweet-safe-bottom");
  const swiftLeft = readCssVar("--retweet-safe-left");
  const swiftRight = readCssVar("--retweet-safe-right");

  let top = Math.max(envTop, swiftTop);
  let bottom = Math.max(envBottom, swiftBottom);
  let left = Math.max(envLeft, swiftLeft);
  let right = Math.max(envRight, swiftRight);

  const nativeOrIos =
    isNativeCapacitorShell() ||
    root.classList.contains("retweet-native-shell") ||
    /iPhone|iPad|iPod/i.test(navigator.userAgent || "");

  if (nativeOrIos && top < 20) {
    top = Math.max(top, iosStatusBarFallback());
  }

  const key = `${top}|${bottom}|${left}|${right}`;
  if (key === lastSafeAreaKey) return;
  lastSafeAreaKey = key;

  root.style.setProperty("--sat", `${top}px`);
  root.style.setProperty("--sab", `${bottom}px`);
  root.style.setProperty("--sal", `${left}px`);
  root.style.setProperty("--sar", `${right}px`);
}

let booted = false;
let safeTickRaf = 0;
let safeTickDebounce = 0;

function scheduleSafeAreaSync(): void {
  if (safeTickRaf) cancelAnimationFrame(safeTickRaf);
  safeTickRaf = requestAnimationFrame(() => {
    safeTickRaf = 0;
    syncSafeAreaCssVars();
  });
}

function scheduleSafeAreaFromResize(): void {
  if (safeTickDebounce) window.clearTimeout(safeTickDebounce);
  safeTickDebounce = window.setTimeout(() => {
    safeTickDebounce = 0;
    scheduleSafeAreaSync();
  }, 64);
}

/** يضمن أن --sat/--sab صحيحة على iOS/Capacitor حتى لو تأخر Swift bridge */
export function initSafeAreaBootstrap(): void {
  if (typeof window === "undefined" || booted) return;
  booted = true;

  scheduleSafeAreaSync();
  window.setTimeout(scheduleSafeAreaSync, 120);
  window.setTimeout(scheduleSafeAreaSync, 400);

  window.addEventListener("retweet-safe-area-change", scheduleSafeAreaFromResize, { passive: true });
  if (allowNativeLayoutResizeListeners()) {
    window.addEventListener("resize", scheduleSafeAreaFromResize, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleSafeAreaFromResize, { passive: true });
  }
  window.setTimeout(() => {
    if (!allowNativeLayoutResizeListeners()) return;
    window.addEventListener("resize", scheduleSafeAreaFromResize, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleSafeAreaFromResize, { passive: true });
  }, 4500);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleSafeAreaSync();
  });
}
