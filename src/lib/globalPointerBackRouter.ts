import { isChatNavBackEdge, isChatNavBackSwipe } from "@/lib/chatNavStack";
import {
  CHAT_EDGE_SWIPE_HIT_PX,
  isDismissSwipeDelta,
  isPointerOnDismissEdge,
  resolveDismissRtl,
  type DismissGestureProfile,
} from "@/lib/edgeSwipeDismiss";
/**
 * طبقة سحب للخلف — يُسجَّل كل SlideDismissShell / غرفة محادثة.
 * يعادل تهيئة GestureBinding / pointerRouter في Flutter.
 */
export type PointerBackLayer = {
  id: number;
  getContainer: () => HTMLElement | null;
  isActive: () => boolean;
  dismissProfile?: DismissGestureProfile;
  onEdgePointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
};

let nextLayerId = 1;
let installed = false;
const layers: PointerBackLayer[] = [];
let activePointerId: number | null = null;
let activeLayerId: number | null = null;
let gestureStartX = 0;
let gestureStartY = 0;
let dragCommitted = false;

function topLayer(): PointerBackLayer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (L.isActive()) return L;
  }
  return undefined;
}

function isHeaderBackButton(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest("[data-chat-back-btn], [data-profile-back-btn]");
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (isHeaderBackButton(target)) return true;
  return !!target.closest(
    "button, a, input, select, textarea, label, [role='switch'], [role='button'], [data-no-dismiss-drag], [data-profile-menu-btn], [data-chat-privacy-menu-btn], [data-profile-menu], [data-chat-privacy-menu]",
  );
}

function installDocumentRouter() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || activePointerId != null) return;
    const layer = topLayer();
    if (!layer) return;
    const root = layer.getContainer();
    if (!root || !root.contains(e.target as Node)) return;
    const rect = root.getBoundingClientRect();
    const profile = layer.dismissProfile ?? "app";
    if (isInteractiveTarget(e.target)) return;
    if (document.documentElement.dataset.chatThreadOpen === "1" && profile === "app") return;
    if (
      profile === "chat"
        ? !isChatNavBackEdge(e.clientX, rect, CHAT_EDGE_SWIPE_HIT_PX)
        : !isPointerOnDismissEdge(e.clientX, rect, profile)
    ) {      return;
    }
    gestureStartX = e.clientX;
    gestureStartY = e.clientY;
    dragCommitted = false;
    activePointerId = e.pointerId;
    activeLayerId = layer.id;
    layer.onEdgePointerDown(e);
  };

  const onMove = (e: PointerEvent) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    const layer = layers.find(L => L.id === activeLayerId);
    if (!layer) return;

    if (!dragCommitted) {
      const dx = e.clientX - gestureStartX;
      const dy = e.clientY - gestureStartY;
      if (Math.hypot(dx, dy) < 10) return;
      const profile = layer.dismissProfile ?? "app";
      const horizontal =
        profile === "chat"
          ? isChatNavBackSwipe(dx, dy)
          : isDismissSwipeDelta(dx, dy, resolveDismissRtl(profile), profile);
      if (!horizontal) {
        activePointerId = null;
        activeLayerId = null;
        dragCommitted = false;
        return;
      }
      dragCommitted = true;
    }

    layer.onPointerMove(e);
    if (dragCommitted) e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    const layer = layers.find(L => L.id === activeLayerId);
    activePointerId = null;
    activeLayerId = null;
    dragCommitted = false;
    layer?.onPointerUp(e);
  };

  const onCancel = (e: PointerEvent) => {
    if (activePointerId == null || e.pointerId !== activePointerId) return;
    const layer = layers.find(L => L.id === activeLayerId);
    activePointerId = null;
    activeLayerId = null;
    dragCommitted = false;
    /** Safari iOS: pointercancel بعد pointerup — لا تُنهِ الإيماءة مرتين */
    layer?.onPointerUp(e);
  };

  const resetActivePointer = () => {
    activePointerId = null;
    activeLayerId = null;
    dragCommitted = false;
  };

  document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  document.addEventListener("pointermove", onMove, { capture: true, passive: false });
  document.addEventListener("pointerup", onUp, { capture: true });
  document.addEventListener("pointercancel", onCancel, { capture: true });
  document.addEventListener("touchend", resetActivePointer, { capture: true, passive: true });
  document.addEventListener("touchcancel", resetActivePointer, { capture: true, passive: true });
  window.addEventListener("blur", resetActivePointer);
  document.addEventListener("visibilitychange", resetActivePointer);
}

/**
 * يُستدعى مرة عند إقلاع التطبيق (main.tsx / WebAppRoot).
 * يعادل: GestureBinding.instance.pointerRouter في Flutter.
 */
export function warmGlobalPointerBackRouter(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.retweetPointerRouter = "1";
  installDocumentRouter();
}

export function registerPointerBackLayer(handlers: Omit<PointerBackLayer, "id">): () => void {
  warmGlobalPointerBackRouter();
  const layer: PointerBackLayer = { id: nextLayerId++, ...handlers };
  layers.push(layer);
  return () => {
    const idx = layers.findIndex(L => L.id === layer.id);
    if (idx >= 0) layers.splice(idx, 1);
    if (activeLayerId === layer.id) {
      activePointerId = null;
      activeLayerId = null;
      dragCommitted = false;
    }
  };
}
