/** يُطلق حدثاً عاماً لعرض تنبيه «سجّل الدخول» (يستمع له `App`). */
export function notifyGuestActionBlocked(): void {
  try {
    window.dispatchEvent(new CustomEvent("retweet-guest-blocked", { bubbles: true }));
  } catch {
    /* ignore */
  }
}
