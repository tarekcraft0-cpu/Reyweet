/**
 * منع التحديد الأزرق وقائمة iOS (Copy / Look Up / Translate) — التطبيق بالكامل.
 * الضغط المطوّل المخصّص: [data-native-long-press] فقط (زر المعرض في الشات).
 */
import { isNativeCapacitorShell } from "./apiUrlPolicy";

export const NATIVE_LONG_PRESS_ATTR = "data-native-long-press";

const ALLOW_SELECT_SELECTOR =
  'input, textarea, select, [contenteditable="true"], .chat-allow-select, .native-allow-select';

const NO_SELECT_STYLE_ID = "retweet-ios-no-select";

export const NO_SELECT_SHELL_CLASS = "retweet-native-shell";

export const NO_SELECT_GLOBAL_CSS = `
html.${NO_SELECT_SHELL_CLASS},
html.${NO_SELECT_SHELL_CLASS} *,
#root,
#root * {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
  -webkit-tap-highlight-color: transparent !important;
  -webkit-user-modify: read-only !important;
}
html.${NO_SELECT_SHELL_CLASS} input,
html.${NO_SELECT_SHELL_CLASS} textarea,
html.${NO_SELECT_SHELL_CLASS} select,
html.${NO_SELECT_SHELL_CLASS} [contenteditable="true"],
html.${NO_SELECT_SHELL_CLASS} .chat-allow-select,
html.${NO_SELECT_SHELL_CLASS} .chat-allow-select *,
#root input,
#root textarea,
#root select,
#root [contenteditable="true"],
#root .chat-allow-select,
#root .chat-allow-select * {
  -webkit-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: auto !important;
  -webkit-user-modify: read-write !important;
}
html.${NO_SELECT_SHELL_CLASS} ::selection,
#root ::selection {
  background: transparent !important;
  color: inherit !important;
}
html.${NO_SELECT_SHELL_CLASS} img,
html.${NO_SELECT_SHELL_CLASS} video,
html.${NO_SELECT_SHELL_CLASS} canvas,
html.${NO_SELECT_SHELL_CLASS} svg,
#root img,
#root video,
#root canvas,
#root svg {
  -webkit-user-drag: none !important;
  user-drag: none !important;
  -webkit-touch-callout: none !important;
  pointer-events: auto;
}
html.${NO_SELECT_SHELL_CLASS} [${NATIVE_LONG_PRESS_ATTR}],
#root [${NATIVE_LONG_PRESS_ATTR}] {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
  touch-action: none !important;
}
.retweet-no-select-pane,
.retweet-no-select-pane *:not(.chat-allow-select):not(.chat-allow-select *) {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
}
`.trim();

export function isIosWebKitTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform))
  );
}

/** مفعّل دائماً داخل تطبيق /app — منع التحديد على كل الشاشات */
export function isNoSelectShellActive(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    __RETWEET_NATIVE_SHELL__?: boolean;
    __RETWEET_NO_SELECT_BOOT__?: boolean;
  };
  if (w.__RETWEET_NO_SELECT_BOOT__ === true) return true;
  if (w.__RETWEET_NATIVE_SHELL__ === true) return true;
  if (isNativeCapacitorShell()) return true;
  if (isIosWebKitTouchDevice()) return true;
  try {
    return window.location.pathname.includes("/app");
  } catch {
    return true;
  }
}

export function isNativeAllowSelectTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(ALLOW_SELECT_SELECTOR);
}

export function isNativeLongPressTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(`[${NATIVE_LONG_PRESS_ATTR}]`);
}

function clearNativeSelection(): void {
  try {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  } catch {
    /* ignore */
  }
  try {
    const doc = document as Document & { selection?: { empty?: () => void } };
    doc.selection?.empty?.();
  } catch {
    /* ignore legacy IE */
  }
}

function blockNativeTextMenu(e: Event) {
  if (!isNoSelectShellActive()) return;
  if (isNativeAllowSelectTarget(e.target)) return;
  if (isNativeLongPressTarget(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  clearNativeSelection();
}

function onSelectionChange() {
  if (!isNoSelectShellActive()) return;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const node = sel.anchorNode;
  if (!node) return;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (el && isNativeAllowSelectTarget(el)) return;
  sel.removeAllRanges();
}

function injectNoSelectStyles(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(NO_SELECT_SHELL_CLASS);
  const root = document.getElementById("root");
  root?.classList.add("retweet-no-select-pane");
  document.documentElement.style.setProperty("-webkit-user-select", "none");
  document.documentElement.style.setProperty("-webkit-touch-callout", "none");
  if (document.body) {
    document.body.style.setProperty("-webkit-user-select", "none");
    document.body.style.setProperty("-webkit-touch-callout", "none");
  }
  if (document.getElementById(NO_SELECT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = NO_SELECT_STYLE_ID;
  style.textContent = NO_SELECT_GLOBAL_CSS;
  (document.head || document.documentElement).appendChild(style);
}

/** iOS: منع بدء التحديد عند الضغط المطوّل بدون سحب (مع السماح بالتمرير بعد ~12px) */
function installTouchSelectionBlocker(): void {
  let startX = 0;
  let startY = 0;
  let touchMoved = false;
  let rafId = 0;

  const stopRaf = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const loopClearSelection = () => {
    clearNativeSelection();
    rafId = requestAnimationFrame(loopClearSelection);
  };

  document.addEventListener(
    "touchstart",
    e => {
      stopRaf();
      if (e.touches.length !== 1) return;
      if (isNativeAllowSelectTarget(e.target)) return;
      if (isNativeLongPressTarget(e.target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      touchMoved = false;
      clearNativeSelection();
      rafId = requestAnimationFrame(loopClearSelection);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "touchmove",
    e => {
      if (!e.touches[0]) return;
      if (isNativeAllowSelectTarget(e.target)) return;
      if (isNativeLongPressTarget(e.target)) return;
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > 12 || dy > 12) {
        touchMoved = true;
        stopRaf();
        return;
      }
      if (!touchMoved) {
        e.preventDefault();
        clearNativeSelection();
      }
    },
    { capture: true, passive: false },
  );

  const endTouch = () => {
    stopRaf();
    touchMoved = false;
    clearNativeSelection();
  };

  document.addEventListener("touchend", endTouch, { capture: true, passive: true });
  document.addEventListener("touchcancel", endTouch, { capture: true, passive: true });
}

export const nativeNoSelectCaptureHandlers = {
  onSelectStartCapture: blockNativeTextMenu,
  onContextMenuCapture: blockNativeTextMenu,
  onDragStartCapture: blockNativeTextMenu,
  onCopyCapture: blockNativeTextMenu,
  onCutCapture: blockNativeTextMenu,
  onPointerDownCapture: (e: { target: EventTarget | null }) => {
    if (!isNoSelectShellActive()) return;
    if (isNativeAllowSelectTarget(e.target)) return;
    if (isNativeLongPressTarget(e.target)) return;
    clearNativeSelection();
  },
} as const;

let installed = false;

export function installNativeTextSelectionGuard(): void {
  if (typeof document === "undefined" || installed) return;
  installed = true;

  const w = window as Window & { __RETWEET_NO_SELECT_BOOT__?: boolean };
  w.__RETWEET_NO_SELECT_BOOT__ = true;

  injectNoSelectStyles();

  const opts: AddEventListenerOptions = { capture: true, passive: false };
  for (const ev of ["selectstart", "contextmenu", "dragstart", "copy", "cut"] as const) {
    document.addEventListener(ev, blockNativeTextMenu, opts);
  }

  document.addEventListener("selectionchange", onSelectionChange, { capture: true });

  document.addEventListener(
    "mousedown",
    e => {
      if (isNativeAllowSelectTarget(e.target)) return;
      if (isNativeLongPressTarget(e.target)) return;
      clearNativeSelection();
    },
    { capture: true, passive: true },
  );

  installTouchSelectionBlocker();

  document.addEventListener(
    "gesturestart",
    e => {
      if (!isNativeAllowSelectTarget(e.target)) e.preventDefault();
    },
    { capture: true, passive: false },
  );
}
