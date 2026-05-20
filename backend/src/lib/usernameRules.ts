import { isReservedShortUsername, isShortUsernameException } from "./shortUsernameAccounts.js";

/** أحرف إنجليزية صغيرة وأرقام وشرطة سفلية فقط */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
export const FOUNDER_ACCOUNT_ID = "u_founder_tareqf";

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isFounderUsernameException(username: string, userId?: string): boolean {
  return isShortUsernameException(username, userId);
}

export function validateUsernameFormat(username: string, userId?: string): string | null {
  const t = username.trim();
  if (!t) return "أدخل اسم مستخدم";
  if (isShortUsernameException(t, userId)) return null;
  if (ARABIC_RE.test(t)) return "ممنوع الحروف العربية في اسم المستخدم";
  if (/[A-Z]/.test(t)) return "استخدم أحرفاً إنجليزية صغيرة فقط (a-z)";
  if (t.length < 3) return "اسم المستخدم يجب أن يكون 3 أحرف فأكثر";
  if (t.length > 30) return "اسم المستخدم طويل جداً";
  if (!USERNAME_PATTERN.test(t)) {
    return "يُسمح بـ a-z و 0-9 و _ فقط — بدون عربي أو أحرف كبيرة أو رموز";
  }
  return null;
}

export { isReservedShortUsername, getUserIdForReservedShortUsername } from "./shortUsernameAccounts.js";
