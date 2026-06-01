import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { resetNativeChatInboxLayout } from "./nativeChatInboxLayout";

const NATIVE_APP_ATTR = "data-native-app";

/** يمنع انزياح أفقي من scroll أو visualViewport على WKWebView */
function resetNativeDocumentScroll(): void {
  if (typeof window === "undefined") return;
  try {
    window.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.body && (document.body.scrollLeft = 0);
    const se = document.scrollingElement;
    if (se) se.scrollLeft = 0;
  } catch {
    /* ignore */
  }
}

function pinElementFullWidth(el: HTMLElement): void {
  el.style.width = "100%";
  el.style.maxWidth = "100vw";
  el.style.minWidth = "0";
  el.style.marginLeft = "0";
  el.style.marginRight = "0";
  el.style.marginInline = "0";
  el.style.paddingLeft = "";
  el.style.paddingRight = "";
  el.style.left = "0";
  el.style.right = "0";
  el.style.insetInlineStart = "0";
  el.style.insetInlineEnd = "0";
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

  const pinSelectors =
    ".retweet-no-select-pane, .tab-panel-scroll, .chat-stack-scene, .chat-inbox-pane, [data-floating-nav-host]";
  document.querySelectorAll<HTMLElement>(pinSelectors).forEach(pinElementFullWidth);

  document.querySelectorAll<HTMLElement>("[data-tab-panel]").forEach(panel => {
    if (panel.getAttribute("aria-hidden") === "true") return;
    panel.style.transform = "translate3d(0, 0, 0)";
    pinElementFullWidth(panel);
  });

  resetNativeDocumentScroll();
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
