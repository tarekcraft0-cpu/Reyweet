import { useEffect, useState } from "react";

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
  const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  return {
    height: Math.round(vv.height),
    offsetTop: Math.round(vv.offsetTop),
    keyboardInset,
  };
}

/** يطابق ارتفاع الشاشة مع visualViewport (كيبورد iOS/Android) مثل دايركت إنستغرام */
export function useVisualViewportLayout(): VisualViewportLayout {
  const [layout, setLayout] = useState(readVisualViewportLayout);

  useEffect(() => {
    const vv = window.visualViewport;
    let raf = 0;
    const sync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setLayout(readVisualViewportLayout());
      });
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return layout;
}
