/** ارتفاع الكيبورد من Capacitor (إن وُجد) */
let nativeKeyboardPx = 0;
let engineRefs = 0;
let rafLoop = 0;
let nativeListenersReady = false;
let nativeBridgeTeardown: (() => void) | null = null;

export type ChatKeyboardSnapshot = {
  keyboardInset: number;
  vvHeight: number;
  vvOffsetTop: number;
  open: boolean;
};

function readNativeKeyboardInsetFromCss(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--retweet-keyboard-inset")
    .trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function usesNativeWebViewKeyboardLayout(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("retweet-native-keyboard-layout");
}

export function readChatKeyboardSnapshot(): ChatKeyboardSnapshot {
  if (typeof window === "undefined") {
    return { keyboardInset: 0, vvHeight: 0, vvOffsetTop: 0, open: false };
  }
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const vvHeight = vv ? Math.round(vv.height) : layoutH;
  const vvOffsetTop = vv ? Math.round(vv.offsetTop) : 0;
  const vvInset = Math.max(0, Math.round(layoutH - vvHeight - vvOffsetTop));
  const nativeCssInset = readNativeKeyboardInsetFromCss();
  const nativeLayout = usesNativeWebViewKeyboardLayout();
  /** عند تصغير WKWebView من Swift لا نضيف هامشاً إضافياً على الشريط */
  const keyboardInset = nativeLayout
    ? 0
    : Math.max(vvInset, nativeKeyboardPx, nativeCssInset);
  const open = nativeLayout || keyboardInset > 8 || nativeCssInset > 8;
  return {
    keyboardInset,
    vvHeight,
    vvOffsetTop,
    open,
  };
}

function dispatchKeyboardSync() {
  try {
    window.dispatchEvent(new Event("retweet-chat-keyboard-sync"));
  } catch {
    /* ignore */
  }
}

function applyChatKeyboardCss() {
  const snap = readChatKeyboardSnapshot();
  const root = document.documentElement;
  root.style.setProperty("--vv-height", `${snap.vvHeight}px`);
  root.style.setProperty("--vv-offset-top", `${snap.vvOffsetTop}px`);
  root.style.setProperty("--vv-keyboard-inset", `${snap.keyboardInset}px`);
  root.style.setProperty("--chat-sab-effective", snap.open ? "0px" : "var(--sab)");
  root.classList.toggle("chat-keyboard-open", snap.open);
  const scrollPad = snap.open
    ? "calc(12px + var(--chat-composer-h, 72px))"
    : "calc(12px + var(--chat-composer-h, 0px))";
  root.style.setProperty("--chat-scroll-padding-bottom", scrollPad);
  return snap;
}

function scheduleRafLoop() {
  if (rafLoop) return;
  const tick = () => {
    rafLoop = 0;
    const snap = applyChatKeyboardCss();
    if (snap.open) rafLoop = requestAnimationFrame(tick);
  };
  rafLoop = requestAnimationFrame(tick);
}

function onViewportChange() {
  const snap = applyChatKeyboardCss();
  dispatchKeyboardSync();
  if (snap.open) scheduleRafLoop();
}

async function ensureNativeKeyboardBridge() {
  if (nativeListenersReady) return;
  nativeListenersReady = true;
  try {
    const [{ Keyboard }, { Capacitor }] = await Promise.all([
      import("@capacitor/keyboard"),
      import("@capacitor/core"),
    ]);
    if (!Capacitor.isNativePlatform()) return;

    const onShow = (info: { keyboardHeight?: number }) => {
      nativeKeyboardPx = Math.max(0, Math.round(info.keyboardHeight ?? 0));
      const snap = applyChatKeyboardCss();
      dispatchKeyboardSync();
      if (snap.open) scheduleRafLoop();
    };
    const onHide = () => {
      nativeKeyboardPx = 0;
      applyChatKeyboardCss();
      dispatchKeyboardSync();
    };

    const handles = await Promise.all([
      Keyboard.addListener("keyboardWillShow", onShow),
      Keyboard.addListener("keyboardDidShow", onShow),
      Keyboard.addListener("keyboardWillHide", onHide),
      Keyboard.addListener("keyboardDidHide", onHide),
    ]);

    nativeBridgeTeardown = () => {
      void Promise.all(handles.map(h => h.remove())).catch(() => undefined);
    };
  } catch {
    /* متصفح / ويب */
  }
}

/**
 * محرك الكيبورد — يكتب CSS variables مباشرة (60fps أثناء فتح الكيبورد).
 * يُستدعى من غرفة المحادثة فقط.
 */
export function mountChatKeyboardEngine(): () => void {
  engineRefs += 1;
  if (engineRefs > 1) {
    return () => {
      engineRefs = Math.max(0, engineRefs - 1);
    };
  }

  void ensureNativeKeyboardBridge();
  applyChatKeyboardCss();

  const vv = window.visualViewport;
  const onSafeArea = () => onViewportChange();
  vv?.addEventListener("resize", onViewportChange, { passive: true });
  vv?.addEventListener("scroll", onViewportChange, { passive: true });
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("orientationchange", onViewportChange, { passive: true });
  window.addEventListener("retweet-safe-area-change", onSafeArea, { passive: true });
  window.addEventListener("retweet-keyboard-layout-change", onSafeArea, { passive: true });

  return () => {
    engineRefs = Math.max(0, engineRefs - 1);
    if (engineRefs > 0) return;
    if (rafLoop) cancelAnimationFrame(rafLoop);
    rafLoop = 0;
    nativeKeyboardPx = 0;
    nativeListenersReady = false;
    nativeBridgeTeardown?.();
    nativeBridgeTeardown = null;
    vv?.removeEventListener("resize", onViewportChange);
    vv?.removeEventListener("scroll", onViewportChange);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("orientationchange", onViewportChange);
    window.removeEventListener("retweet-safe-area-change", onSafeArea);
    window.removeEventListener("retweet-keyboard-layout-change", onSafeArea);
    const root = document.documentElement;
    root.classList.remove("retweet-native-keyboard-layout");
    root.style.removeProperty("--retweet-keyboard-inset");
    root.style.removeProperty("--vv-keyboard-inset");
    root.style.removeProperty("--vv-height");
    root.style.removeProperty("--vv-offset-top");
    root.style.removeProperty("--chat-sab-effective");
    root.style.removeProperty("--chat-scroll-padding-bottom");
    root.classList.remove("chat-keyboard-open");
  };
}
