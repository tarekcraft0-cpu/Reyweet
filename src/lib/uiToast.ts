export function emitUiToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("retweet-ui-toast", { detail: { message } }));
}

