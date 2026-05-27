import { startTransition } from "react";

/** CSS variables owned by interactive back gestures — cleared on dismiss */
export const SETTINGS_DISMISS_PULL_CSS_VAR = "--retweet-settings-dismiss-pull";
export const GENERIC_DISMISS_PULL_CSS_VAR = "--retweet-dismiss-pull";

export function blurActiveElement(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      active.blur();
    } catch {
      /* ignore */
    }
  }
}

export function cleanupDismissCssVar(varName?: string): void {
  if (typeof document === "undefined" || !varName) return;
  try {
    document.documentElement.style.removeProperty(varName);
  } catch {
    /* ignore */
  }
}

/**
 * Runs a navigation pop/close: blurs inputs, then dismisses inside a transition
 * so React state updates do not block the slide animation.
 */
export function runNavigationDismiss(onDismiss: () => void, opts?: { immediate?: boolean }): void {
  blurActiveElement();
  if (opts?.immediate) {
    startTransition(() => onDismiss());
    return;
  }
  startTransition(() => onDismiss());
}
