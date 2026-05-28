/** ارتفاع الكيبورد من Capacitor (إن وُجد) */
let nativeKeyboardPx = 0;
let engineRefs = 0;
let rafLoop = 0;
let nativeListenersReady = false;

export type ChatKeyboardSnapshot = {
  keyboardInset: number;
  vvHeight: number;
  vvOffsetTop: number;
  open: boolean;
};

export function readChatKeyboardSnapshot(): ChatKeyboardSnapshot {
  if (typeof window === "undefined") {
    return { keyboardInset: 0, vvHeight: 0, vvOffsetTop: 0, open: false };
  }
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const vvHeight = vv ? Math.round(vv.height) : layoutH;
  const vvOffsetTop = vv ? Math.round(vv.offsetTop) : 0;
  const vvInset = Math.max(0, Math.round(layoutH - vvHeight - vvOffsetTop));
  const keyboardInset = Math.max(vvInset, nativeKeyboardPx);
  return {
    keyboardInset,
    vvHeight,
    vvOffsetTop,
    open: keyboardInset > 8,
  };
}

function applyChatKeyboardCss() {
  const snap = readChatKeyboardSnapshot();
  const root = document.documentElement;
  root.style.setProperty("--vv-height", `${snap.vvHeight}px`);
  root.style.setProperty("--vv-offset-top", `${snap.vvOffsetTop}px`);
  root.style.setProperty("--vv-keyboard-inset", `${snap.keyboardInset}px`);
  root.style.setProperty("--chat-composer-bottom", "0px");
  root.style.setProperty("--chat-sab-effective", "var(--sab)");
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
  if (snap.open) scheduleRafLoop();
}

async function ensureNativeKeyboardBridge() {
  if (nativeListenersReady) return;
  nativeListenersReady = true;
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

  return () => {
    engineRefs = Math.max(0, engineRefs - 1);
    if (engineRefs > 0) return;
    if (rafLoop) cancelAnimationFrame(rafLoop);
    rafLoop = 0;
    nativeKeyboardPx = 0;
    vv?.removeEventListener("resize", onViewportChange);
    vv?.removeEventListener("scroll", onViewportChange);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("orientationchange", onViewportChange);
    window.removeEventListener("retweet-safe-area-change", onSafeArea);
    const root = document.documentElement;
    root.style.removeProperty("--chat-composer-bottom");
    root.style.removeProperty("--chat-sab-effective");
  };
}
