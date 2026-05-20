import type { ID, User } from "./types";
import { isReservedShortUsername, isShortUsernameException } from "./shortUsernameAccounts";

export const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** يزيل العربية والرموز ويحوّل للأحرف الصغيرة أثناء الكتابة */
export function sanitizeUsernameInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 30);
}

export { isShortUsernameException, isPrivilegedAvatarUser, isSevenAccount } from "./shortUsernameAccounts";

/** @deprecated استخدم isShortUsernameException */
export function isFounderUsernameException(username: string, userId?: ID): boolean {
  return isShortUsernameException(username, userId);
}

/** رسالة خطأ بالعربية أو null إن كان الاسم مسموحاً */
export function validateUsernameFormat(username: string, userId?: ID): string | null {
  const t = username.trim();
  if (!t) return "أدخل اسم مستخدم";
  if (isShortUsernameException(t, userId)) return null;
  if (ARABIC_RE.test(t)) return "ممنوع الحروف العربية في اسم المستخدم";
  if (/[A-Z]/.test(t)) return "استخدم أحرفاً إنجليزية صغيرة فقط (a-z)";
  if (t.length < 3) return "اسم المستخدم يجب أن يكون 3 أحرف فأكثر";
  if (t.length > 30) return "اسم المستخدم طويل جداً";
  if (!USERNAME_RE.test(t)) {
    return "يُسمح بـ a-z و 0-9 و _ فقط — بدون عربي أو أحرف كبيرة أو رموز";
  }
  return null;
}

export function isUsernameTaken(username: string, users: User[], exceptUserId?: ID): boolean {
  const tl = normalizeUsername(username);
  if (isReservedShortUsername(tl, exceptUserId)) return true;
  return users.some(u => u.id !== exceptUserId && u.username.toLowerCase() === tl);
}
