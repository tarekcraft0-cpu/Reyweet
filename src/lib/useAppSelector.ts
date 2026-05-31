import { useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { isGuestUserId } from "./guestUser";
import type { AppState } from "./types";
import { StoreApiCtx } from "./storeSubscription";

/** مقارنة سطحية للكائنات */
export function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is(a[k as keyof T], b[k as keyof T])) return false;
  }
  return true;
}

/**
 * selector على state — يعيد الرسم فقط عند تغيّر القيمة المختارة (Object.is أو isEqual).
 * يمنع إعادة رسم Feed عند تحديث chats/notifications.
 */
export function useAppSelector<T>(
  selector: (s: AppState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const api = useContext(StoreApiCtx);
  if (!api) throw new Error("useAppSelector داخل AppProvider فقط");

  const selRef = useRef(selector);
  selRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const cacheRef = useRef<{ revision: number; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const revision = api.getRevision();
    const cached = cacheRef.current;
    if (cached && cached.revision === revision) return cached.value;

    const next = selRef.current(api.getState());
    const eq = isEqualRef.current;
    if (cached && eq(cached.value, next)) {
      cacheRef.current = { revision, value: cached.value };
      return cached.value;
    }
    cacheRef.current = { revision, value: next };
    return next;
  }, [api]);

  return useSyncExternalStore(api.subscribe, getSnapshot, getSnapshot);
}

export function useIsGuestSelector(): boolean {
  return useAppSelector(s => isGuestUserId(s.currentUserId));
}

/** مقارنة مصفوفات معرفات (ترتيب مهم) */
export function equalIdArrays(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
