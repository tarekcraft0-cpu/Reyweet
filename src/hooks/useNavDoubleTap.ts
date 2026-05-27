import { useCallback, useRef } from "react";

const DOUBLE_TAP_MS = 320;

/** نقرة واحدة بعد تأخير قصير؛ نقرتان سريعتان تُنفّذ onDouble فقط */
export function useNavDoubleTap(onSingle: () => void, onDouble?: () => void) {
  const lastTapMs = useRef(0);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(() => {
    const now = Date.now();
    const gap = now - lastTapMs.current;
    lastTapMs.current = now;

    if (gap > 0 && gap < DOUBLE_TAP_MS && onDouble) {
      if (singleTimer.current) {
        clearTimeout(singleTimer.current);
        singleTimer.current = null;
      }
      onDouble();
      return;
    }

    if (singleTimer.current) clearTimeout(singleTimer.current);
    singleTimer.current = setTimeout(() => {
      singleTimer.current = null;
      onSingle();
    }, DOUBLE_TAP_MS);
  }, [onSingle, onDouble]);
}
