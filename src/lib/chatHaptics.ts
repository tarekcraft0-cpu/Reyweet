/** اهتزاز خفيف للتفاعلات (Capacitor / Android WebView / متصفحات مدعومة) */
export function chatHapticLight(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* ignore */
  }
}

export function chatHapticMedium(): void {
  try {
    navigator.vibrate?.(14);
  } catch {
    /* ignore */
  }
}

export function chatHapticSuccess(): void {
  try {
    navigator.vibrate?.([10, 40, 12]);
  } catch {
    /* ignore */
  }
}
