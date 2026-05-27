import { useEffect, useRef } from "react";
import { blurActiveElement } from "@/lib/navigationDismiss";

/**
 * يزامن زر الرجوع في المتصفح / Android مع إغلاق الطبقة العلوية (مودال، بروفايل، …).
 */
export function useGlobalOverlayBack(enabled: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  const pushedRef = useRef(false);
  const skipPopRef = useRef(false);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) {
      pushedRef.current = false;
      return;
    }
    if (!pushedRef.current) {
      window.history.pushState({ retweetOverlay: true }, "");
      pushedRef.current = true;
    }
    const onPop = () => {
      if (skipPopRef.current) {
        skipPopRef.current = false;
        pushedRef.current = false;
        return;
      }
      blurActiveElement();
      pushedRef.current = false;
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushedRef.current) {
        skipPopRef.current = true;
        pushedRef.current = false;
        try {
          window.history.back();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled]);
}
