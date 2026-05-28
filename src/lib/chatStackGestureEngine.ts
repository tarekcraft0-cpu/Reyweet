import { NAV_HIDE_PROGRESS_CSS_VAR } from "@/hooks/useBottomNavSheet";
import {
  chatStackOpenFromLeftTransforms,
  SLIDE_DISMISS_EASE,
  SLIDE_DISMISS_MS,
} from "@/hooks/useSlideDismissBack";
import { chatStackDismissTransforms } from "@/lib/edgeSwipeDismiss";

/** 0…1 — تقدّم فتح المحادثة (سحب يسار→يمين) */
export const CHAT_STACK_PROGRESS_VAR = "--retweet-chat-stack-progress";

export const CHAT_STACK_OPEN_FRACTION = 0.5;
/** سرعة أفقية (px/ms) لإكمال الفتح/الإلغاء بالزخم */
export const CHAT_STACK_FLING_VX = 0.42;

export function clampStackProgress(p: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(p) ? p : 0));
}

export function publishChatStackCssProgress(progress: number): number {
  const clamped = clampStackProgress(progress);
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(CHAT_STACK_PROGRESS_VAR, String(clamped));
  }
  return clamped;
}

export function clearChatStackCssProgress(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(CHAT_STACK_PROGRESS_VAR);
}

/** يحرّك الشريط السفلي مع تقدّم المكدس (فتح أو إغلاق) دون إخفاء مفاجئ */
export function syncStackNavHideProgress(progress: number | null): void {
  if (typeof document === "undefined") return;
  if (progress == null) {
    document.documentElement.style.removeProperty(NAV_HIDE_PROGRESS_CSS_VAR);
    return;
  }
  document.documentElement.style.setProperty(
    NAV_HIDE_PROGRESS_CSS_VAR,
    String(clampStackProgress(progress)),
  );
}

export type StackLayerRefs = {
  inboxEl: HTMLDivElement | null;
  roomEl: HTMLDivElement | null;
};

export function applyOpenStackTransforms(
  progress: number,
  cap: number,
  layers: StackLayerRefs,
  animate: boolean,
  tapOpen = false,
): void {
  const { inbox, room } = chatStackOpenFromLeftTransforms(progress, cap);
  const transition = animate
    ? `transform ${tapOpen ? 280 : SLIDE_DISMISS_MS}ms ${tapOpen ? "cubic-bezier(0.22, 1, 0.36, 1)" : SLIDE_DISMISS_EASE}`
    : "none";
  if (layers.inboxEl) {
    layers.inboxEl.style.transform = inbox;
    layers.inboxEl.style.transition = transition;
  }
  if (layers.roomEl) {
    layers.roomEl.style.transform = room;
    layers.roomEl.style.transition = transition;
  }
}

export function applyCloseStackTransforms(
  dragTx: number,
  cap: number,
  layers: StackLayerRefs,
  animate: boolean,
): number {
  const { progress, inbox, room } = chatStackDismissTransforms(dragTx, cap);
  const transition = animate ? `transform ${SLIDE_DISMISS_MS}ms ${SLIDE_DISMISS_EASE}` : "none";
  if (layers.inboxEl) {
    layers.inboxEl.style.transform = inbox;
    layers.inboxEl.style.transition = transition;
  }
  if (layers.roomEl) {
    layers.roomEl.style.transform = room;
    layers.roomEl.style.transition = transition;
  }
  return progress;
}

/** إنهاء سحب فتح المحادثة من القائمة */
export function chatStackOpenReleaseTarget(
  px: number,
  cap: number,
  velocityX: number,
): { commit: boolean; targetProgress: number } {
  const w = Math.max(260, cap);
  const progress = w > 0 ? px / w : 0;
  if (velocityX >= CHAT_STACK_FLING_VX) return { commit: true, targetProgress: 1 };
  if (velocityX <= -CHAT_STACK_FLING_VX) return { commit: false, targetProgress: 0 };
  const threshold = Math.max(w * CHAT_STACK_OPEN_FRACTION, 64);
  if (px >= threshold) return { commit: true, targetProgress: 1 };
  return { commit: false, targetProgress: 0 };
}

export function sampleGestureVelocity(
  clientX: number,
  sample: { x: number; t: number },
  prevVx: number,
): { vx: number; sample: { x: number; t: number } } {
  const now = performance.now();
  const dt = now - sample.t;
  if (dt > 0 && dt < 100) {
    return { vx: (clientX - sample.x) / dt, sample: { x: clientX, t: now } };
  }
  return { vx: prevVx, sample: { x: clientX, t: now } };
}
