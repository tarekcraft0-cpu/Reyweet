import { getUserById, updateUser } from "../db/engine.js";

/** إصدار JWT — يُرفع عند تغيير كلمة المرور أو إبطال الجلسات */
export async function getUserTokenVersion(userId: string): Promise<number> {
  const user = await getUserById(userId);
  return user?.tokenVersion ?? 1;
}

export async function invalidateAllUserTokens(userId: string): Promise<number> {
  const user = await getUserById(userId);
  if (!user) return 1;
  const next = (user.tokenVersion ?? 1) + 1;
  await updateUser(userId, { tokenVersion: next });
  return next;
}

/** رفض توكن قديم بعد إبطال الجلسات */
export function isTokenVersionValid(
  tokenTv: number | undefined,
  userTv: number | undefined,
): boolean {
  const current = userTv ?? 1;
  if (tokenTv == null || !Number.isFinite(tokenTv)) return true;
  return tokenTv >= current;
}
