/** ارتفاع الكيبورد من Capacitor (إن وُجد) */
let nativeKeyboardPx = 0;
let useNativeKeyboardHeight = false;
let engineRefs = 0;
let nativeListenersReady = false;
let nativeBridgeTeardown: (() => void) | null = null;

/** ارتفاع الكيبورد من visualViewport (أدق من Capacitor وحده على iOS) */
function computeVisualViewportKeyboardInset(
  layoutH: number,
  vvHeight: number,
  vvOffsetTop: number,
): number {
  return Math.max(0, Math.round(layoutH - vvHeight - vvOffsetTop));
}

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

/** مع resize:body — كم تقلص body فعلياً (يتأخر عن الكيبورد بإطار أو أكثر) */
function readBodyShrinkPx(): number {
  if (typeof document === "undefined" || !document.body) return 0;
  const layoutH = window.innerHeight;
  const bodyH = document.body.getBoundingClientRect().height;
  return Math.max(0, Math.round(layoutH - bodyH));
}

/**
 * iOS: يرفع شريط الكتابة فور keyboardWillShow قبل أن يلحق resize:body.
 * extraLift = ارتفاع الكيبورد − ما تقلصه body (→ 0 عند الالتقاء).
 */
function readKeyboardHeightPx(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const vvHeight = vv ? Math.round(vv.height) : layoutH;
  const vvOffsetTop = vv ? Math.round(vv.offsetTop) : 0;
  const vvInset = computeVisualViewportKeyboardInset(layoutH, vvHeight, vvOffsetTop);
  return Math.max(vvInset, nativeKeyboardPx, readNativeKeyboardInsetFromCss());
}

function applyComposerKeyboardLift(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const kb = readKeyboardHeightPx();
  if (kb < 8) {
    root.style.setProperty("--retweet-composer-kb-lift", "0px");
    root.style.setProperty("--chat-kb-offset", "0px");
    return;
  }
  root.style.setProperty("--chat-kb-offset", `${kb}px`);
  if (root.classList.contains("retweet-kb-body-resize")) {
    const extraLift = Math.max(0, Math.round(kb - readBodyShrinkPx()));
    root.style.setProperty(
      "--retweet-composer-kb-lift",
      extraLift < 3 ? "0px" : `${extraLift}px`,
    );
    return;
  }
  /** ويب / native بدون resize:body — ارفع الشريط بكامل ارتفاع الكيبورد */
  root.style.setProperty("--retweet-composer-kb-lift", `${kb}px`);
}

export function readChatKeyboardSnapshot(): ChatKeyboardSnapshot {
  if (typeof window === "undefined") {
    return { keyboardInset: 0, vvHeight: 0, vvOffsetTop: 0, open: false };
  }
  const vv = window.visualViewport;
  const layoutH = window.innerHeight;
  const vvHeight = vv ? Math.round(vv.height) : layoutH;
  const vvOffsetTop = vv ? Math.round(vv.offsetTop) : 0;
  const vvInset = computeVisualViewportKeyboardInset(layoutH, vvHeight, vvOffsetTop);
  const nativeCssInset = readNativeKeyboardInsetFromCss();
  const kbHeight = Math.max(vvInset, nativeKeyboardPx, nativeCssInset);

  const bodyShrunk =
    typeof document !== "undefined" &&
    !!document.body &&
    layoutH - document.body.getBoundingClientRect().height > 24;
  /** فقط عندما body تقلص فعلياً — لا نعتمد على class retweet-kb-body-resize (resize:none على IPA) */
  const naturalResize = bodyShrunk;

  /** ارتفاع كيبورد فعلي — لا نفتح حالة الكيبورد من body shrink وحده (يبقى بعد الإغلاق على iOS) */
  const keyboardVisible = kbHeight > 8;

  /** مع resize:body يتقلص body — لا نضاعف inset في المتغيرات */
  let keyboardInset = naturalResize ? 0 : kbHeight;
  if (!naturalResize && keyboardInset < 8 && nativeKeyboardPx > 0) {
    keyboardInset = nativeKeyboardPx;
  }
  const open = keyboardVisible;
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

/** بعد إخفاء الكيبورد — body قد يتأخر في التوسع (iOS + resize:none) */
function flushComposerAfterKeyboardHide(): void {
  if (typeof window === "undefined") return;
  const run = () => {
    applyComposerKeyboardLift();
    applyChatKeyboardCss();
    dispatchKeyboardSync();
  };
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 80);
  window.setTimeout(run, 280);
}

function applyChatKeyboardCss() {
  const snap = readChatKeyboardSnapshot();
  const root = document.documentElement;
  const kbPx = Math.max(snap.keyboardInset, readKeyboardHeightPx());
  root.style.setProperty("--vv-height", `${snap.vvHeight}px`);
  root.style.setProperty("--vv-offset-top", `${snap.vvOffsetTop}px`);
  root.style.setProperty("--vv-keyboard-inset", `${kbPx}px`);
  root.style.setProperty("--retweet-keyboard-inset", `${kbPx}px`);
  root.style.setProperty("--chat-sab-effective", snap.open ? "0px" : "var(--sab)");
  root.classList.toggle("chat-keyboard-open", snap.open);
  applyComposerKeyboardLift();
  root.style.setProperty(
    "--chat-scroll-padding-bottom",
    snap.open
      ? "max(12px, calc(var(--chat-composer-h, 56px) + var(--chat-kb-offset, 0px)))"
      : "max(4px, var(--chat-composer-h, 56px))",
  );
  return snap;
}

function onViewportChange() {
  const wasOpen = document.documentElement.classList.contains("chat-keyboard-open");
  applyChatKeyboardCss();
  dispatchKeyboardSync();
  const nowOpen = document.documentElement.classList.contains("chat-keyboard-open");
  if (wasOpen && !nowOpen) flushComposerAfterKeyboardHide();
}

/** يُستدعى مرة عند فتح التطبيق الأصلي — يفعّل resize:body طوال الجلسة */
export async function initNativeKeyboardLayout(): Promise<void> {
  await ensureNativeKeyboardBridge();
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
    useNativeKeyboardHeight = true;
    document.documentElement.classList.add("retweet-kb-body-resize");
    try {
      const { KeyboardResize } = await import("@capacitor/keyboard");
      await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    } catch {
      /* ignore */
    }

    const onShow = (info: { keyboardHeight?: number }) => {
      nativeKeyboardPx = Math.max(0, Math.round(info.keyboardHeight ?? 0));
      applyComposerKeyboardLift();
      applyChatKeyboardCss();
      dispatchKeyboardSync();
    };
    const onHide = () => {
      nativeKeyboardPx = 0;
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        root.style.setProperty("--retweet-keyboard-inset", "0px");
        root.style.setProperty("--vv-keyboard-inset", "0px");
        root.style.setProperty("--retweet-composer-kb-lift", "0px");
        root.style.setProperty("--chat-kb-offset", "0px");
      }
      flushComposerAfterKeyboardHide();
    };

    const handles = await Promise.all([
      Keyboard.addListener("keyboardWillShow", onShow),
      Keyboard.addListener("keyboardDidShow", onShow),
      Keyboard.addListener("keyboardWillHide", onHide),
      Keyboard.addListener("keyboardDidHide", onHide),
    ]);

    nativeBridgeTeardown = () => {
      void Promise.all(handles.map(h => h.remove())).catch(() => undefined);
      document.documentElement.classList.remove("retweet-kb-body-resize");
    };
  } catch {
    /* متصفح / ويب */
  }
}

/**
 * محرك الكيبورد — يكتب CSS variables عند تغيّر visualViewport (بدون حلقة RAF).
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
    nativeKeyboardPx = 0;
    vv?.removeEventListener("resize", onViewportChange);
    vv?.removeEventListener("scroll", onViewportChange);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("orientationchange", onViewportChange);
    window.removeEventListener("retweet-safe-area-change", onSafeArea);
    window.removeEventListener("retweet-keyboard-layout-change", onSafeArea);
    const root = document.documentElement;
    root.style.removeProperty("--retweet-keyboard-inset");
    root.style.removeProperty("--vv-keyboard-inset");
    root.style.removeProperty("--vv-height");
    root.style.removeProperty("--vv-offset-top");
    root.style.removeProperty("--chat-sab-effective");
    root.style.removeProperty("--chat-scroll-padding-bottom");
    root.style.removeProperty("--retweet-composer-kb-lift");
    root.style.removeProperty("--chat-kb-offset");
    root.classList.remove("chat-keyboard-open");
    applyChatKeyboardCss();
  };
}
