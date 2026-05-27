import { APP_COLUMN_MAX_PX } from "@/hooks/useSlideDismissBack";
import { isPointerOnPhysicalChatBackEdge } from "@/lib/edgeSwipeDismiss";

/** عرض افتراضي عند غياب window أو أثناء انتقال الصفحة */
export const DEFAULT_LAYOUT_WIDTH_PX = 390;

export const MIN_LAYOUT_WIDTH_PX = 260;

/** عرض منطقة الحافة اليمنى (بجانب زر الرجوع) — أولوية على التمرير */
export const CHAT_RIGHT_EDGE_HIT_PX = 40;

/**
 * عرض الشاشة/العمود بأمان — لا يرمي أثناء الانتقالات أو قبل اكتمال التخطيط.
 */
export function readSafeViewportWidth(): number {
  try {
    if (typeof window === "undefined") return DEFAULT_LAYOUT_WIDTH_PX;
    const vv = window.visualViewport?.width;
    const raw = Number(vv ?? window.innerWidth);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LAYOUT_WIDTH_PX;
    return Math.min(Math.max(Math.round(raw), MIN_LAYOUT_WIDTH_PX), APP_COLUMN_MAX_PX);
  } catch {
    return DEFAULT_LAYOUT_WIDTH_PX;
  }
}

export function readSafeContainerRect(
  el: Element | null | undefined,
): Pick<DOMRect, "left" | "top" | "width" | "height"> | null {
  try {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    const r = el.getBoundingClientRect();
    if (!Number.isFinite(r.width) || r.width <= 0) return null;
    return {
      left: Number.isFinite(r.left) ? r.left : 0,
      top: Number.isFinite(r.top) ? r.top : 0,
      width: r.width,
      height: Number.isFinite(r.height) && r.height > 0 ? r.height : 0,
    };
  } catch {
    return null;
  }
}

/**
 * بدء السحب من الحافة اليمنى لعمود المحادثة (يمين → يسار للرجوع).
 * يعتمد على مستطيل الغرفة وليس عرض الشاشة الكامل.
 */
export function isPointerOnChatRightDismissEdge(
  clientX: number,
  containerRect?: Pick<DOMRect, "left" | "width"> | null,
  edgePx = CHAT_RIGHT_EDGE_HIT_PX,
): boolean {
  try {
    if (!Number.isFinite(clientX)) return false;
    if (containerRect && Number.isFinite(containerRect.width) && containerRect.width > 0) {
      return isPointerOnPhysicalChatBackEdge(clientX, containerRect, edgePx);
    }
    const viewportW = readSafeViewportWidth();
    return clientX > viewportW - edgePx;
  } catch {
    return false;
  }
}

/** إزاحة أفقية سالبة فقط (سحب يمين→يسار — إغلاق المحادثة) */
export function safeChatDismissTranslation(dx: number, capPx: number): number {
  try {
    if (!Number.isFinite(dx) || dx >= 0) return 0;
    const cap = Math.max(MIN_LAYOUT_WIDTH_PX, Number.isFinite(capPx) ? capPx : readSafeViewportWidth());
    return Math.max(-cap, Math.min(0, dx));
  } catch {
    return 0;
  }
}

export function readSafeStackCapPx(
  containerEl: Element | null | undefined,
  fallbackCapRef?: { current: number },
): number {
  try {
    const rect = readSafeContainerRect(containerEl);
    const fromRect = rect?.width;
    const fromRef =
      fallbackCapRef?.current && Number.isFinite(fallbackCapRef.current)
        ? fallbackCapRef.current
        : 0;
    const base = fromRect && fromRect > 0 ? fromRect : fromRef > 0 ? fromRef : readSafeViewportWidth();
    return Math.max(MIN_LAYOUT_WIDTH_PX, Math.min(Math.round(base), APP_COLUMN_MAX_PX));
  } catch {
    return readSafeViewportWidth();
  }
}
