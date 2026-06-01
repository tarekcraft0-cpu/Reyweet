import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { resetNativeChatInboxLayout } from "./nativeChatInboxLayout";

const NATIVE_APP_ATTR = "data-native-app";

function viewportWidthPx(): number {
  if (typeof window === "undefined") return 390;
  const vv = window.visualViewport?.width;
  const inner = window.innerWidth;
  const w = Number(vv ?? inner);
  return Math.max(320, Math.round(Number.isFinite(w) && w > 0 ? w : 390));
}

function pinElementFullWidth(el: HTMLElement, widthPx: number): void {
  const w = `${widthPx}px`;
  el.style.width = w;
  el.style.maxWidth = w;
  el.style.minWidth = "100%";
  el.style.marginLeft = "0";
  el.style.marginRight = "0";
  el.style.marginInline = "0";
  el.style.paddingLeft = "0";
  el.style.paddingRight = "0";
  el.style.left = "0";
  el.style.right = "0";
  el.style.transform = "none";
  el.style.translate = "none";
  el.style.boxSizing = "border-box";
}

/** يملأ عرض الشاشة على iOS/Android — يُصلح الفراغ الأبيض على اليمين */
export function applyNativeViewportFullBleed(): void {
  if (!isNativeCapacitorShell() || typeof document === "undefined") return;

  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById("root");

  html.classList.add("retweet-native-shell");
  html.setAttribute(NATIVE_APP_ATTR, "1");
  body?.setAttribute(NATIVE_APP_ATTR, "1");

  const w = viewportWidthPx();
  pinElementFullWidth(html, w);
  if (body) pinElementFullWidth(body, w);
  if (root) pinElementFullWidth(root, w);

  const shell = root?.firstElementChild;
  if (shell instanceof HTMLElement) {
    pinElementFullWidth(shell, w);
  }

  document.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach(panel => {
    if (panel.getAttribute("aria-hidden") === "true") return;
    panel.style.transform = "translate3d(0, 0, 0)";
    panel.style.width = `${w}px`;
    panel.style.maxWidth = `${w}px`;
    panel.style.marginLeft = "0";
    panel.style.marginRight = "0";
  });

  resetNativeChatInboxLayout();
}

let booted = false;

export function initNativeViewportLayout(): void {
  if (!isNativeCapacitorShell() || typeof window === "undefined" || booted) return;
  booted = true;

  const run = () => applyNativeViewportFullBleed();

  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 0);
  window.setTimeout(run, 120);
  window.setTimeout(run, 400);

  window.addEventListener("resize", run, { passive: true });
  window.visualViewport?.addEventListener("resize", run, { passive: true });
  window.addEventListener("retweet-safe-area-change", run, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
}
