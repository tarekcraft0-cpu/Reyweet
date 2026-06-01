import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { resetNativeChatInboxLayout } from "./nativeChatInboxLayout";

const NATIVE_APP_ATTR = "data-native-app";

function pinElementFullWidth(el: HTMLElement): void {
  el.style.width = "100%";
  el.style.maxWidth = "none";
  el.style.minWidth = "0";
  el.style.marginLeft = "0";
  el.style.marginRight = "0";
  el.style.marginInline = "0";
  el.style.paddingLeft = "";
  el.style.paddingRight = "";
  el.style.left = "";
  el.style.right = "";
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

  pinElementFullWidth(html);
  if (body) pinElementFullWidth(body);
  if (root) pinElementFullWidth(root);

  const shell = root?.firstElementChild;
  if (shell instanceof HTMLElement) {
    pinElementFullWidth(shell);
  }

  document.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach(panel => {
    if (panel.getAttribute("aria-hidden") === "true") return;
    panel.style.transform = "translate3d(0, 0, 0)";
    pinElementFullWidth(panel);
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
