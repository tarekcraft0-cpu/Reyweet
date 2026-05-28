export function hapticLight() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* ignore */
  }
}

export function hapticMedium() {
  try {
    navigator.vibrate?.(24);
  } catch {
    /* ignore */
  }
}
