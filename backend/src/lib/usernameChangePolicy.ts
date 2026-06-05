/** بعد تغيير @username — لا يُسمح بتغيير ثانٍ قبل انتهاء هذه المدة */
export const USERNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function usernameChangeAvailableAt(lastChangedAt: number | undefined | null): number | null {
  const last = lastChangedAt ?? 0;
  if (last <= 0) return null;
  return last + USERNAME_CHANGE_COOLDOWN_MS;
}

export function canChangeUsernameNow(lastChangedAt: number | undefined | null, now = Date.now()): boolean {
  const availableAt = usernameChangeAvailableAt(lastChangedAt);
  if (availableAt == null) return true;
  return now >= availableAt;
}

export function usernameChangeDaysRemaining(
  lastChangedAt: number | undefined | null,
  now = Date.now(),
): number {
  const availableAt = usernameChangeAvailableAt(lastChangedAt);
  if (availableAt == null || now >= availableAt) return 0;
  return Math.ceil((availableAt - now) / (24 * 60 * 60 * 1000));
}
