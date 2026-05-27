import { useEffect, useRef, useState } from "react";

export type VisualViewportLayout = {
  /** ارتفاع المنطقة المرئية (فوق الكيبورد) */
  height: number;
  /** إزاحة من أعلى layout viewport */
  offsetTop: number;
  /** ارتفاع الكيبورد التقريبي */
  keyboardInset: number;
};

function readVisualViewportLayout(): VisualViewportLayout {
  if (typeof window === "undefined") {
    return { height: 0, offsetTop: 0, keyboardInset: 0 };
  }
  const vv = window.visualViewport;
  if (!vv) {
    return {
      height: window.innerHeight,
      offsetTop: 0,
      keyboardInset: 0,
    };
  }
  const keyboardInset = Math.max(
    0,
    Math.round(window.innerHeight - vv.height - vv.offsetTop),
  );
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    keyboardInset,
  };
}

/** padding سفلي للمُلحق — safe-area فقط عند إغلاق الكيبورد */
export function chatComposerBottomPadding(keyboardOpen: boolean): string {
  return keyboardOpen ? "0px" : "env(safe-area-inset-bottom, 0px)";
}

/**
 * يكتب CSS variables مباشرة على <html> بدلاً من React state
 * حتى لا يُعيد رسم ChatRoom عند كل حركة للكيبورد.
 * يُعيد state snapshot واحدة عند فتح/إغلاق الكيبورد فقط.
 */
export function useVisualViewportLayout(): VisualViewportLayout {
  const [layout, setLayout] = useState(readVisualViewportLayout);
  const prevInsetRef = useRef(layout.keyboardInset);
  const prevHeightRef = useRef(layout.height);

  useEffect(() => {
    const vv = window.visualViewport;
    let raf = 0;

    const sync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = readVisualViewportLayout();

        // كتابة CSS vars مباشرة — بدون re-render React
        const root = document.documentElement;
        root.style.setProperty("--vv-height", `${next.height}px`);
        root.style.setProperty("--vv-offset-top", `${next.offsetTop}px`);
        root.style.setProperty("--vv-keyboard-inset", `${next.keyboardInset}px`);

        // re-render React فقط عند تغيّر حالة الكيبورد (مفتوح/مغلق)
        const wasOpen = prevInsetRef.current > 8;
        const isOpen = next.keyboardInset > 8;
        const heightDelta = Math.abs(next.height - prevHeightRef.current);
        prevInsetRef.current = next.keyboardInset;
        prevHeightRef.current = next.height;
        if (wasOpen !== isOpen || heightDelta > 50) {
          setLayout(next);
        }
      });
    };

    sync();
    vv?.addEventListener("resize", sync, { passive: true });
    vv?.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("orientationchange", sync, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return layout;
}

/**
 * نسخة خفيفة تُلاحظ CSS var مباشرة بدون أي state React.
 * للمكوّنات التي تريد معرفة keyboardInset ولكن لا تريد re-render.
 */
export function useCssVarKeyboardInset(): number {
  const [v, set] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        set(prev => (Math.abs(prev - inset) > 8 ? inset : prev));
      });
    };
    vv.addEventListener("resize", update, { passive: true });
    return () => { cancelAnimationFrame(raf); vv.removeEventListener("resize", update); };
  }, []);
  return v;
}
