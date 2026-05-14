import type { ID, User } from "./types";

const USERNAME_RE = /^[a-zA-Z0-9_]{1,30}$/;

/** رسالة خطأ بالعربية أو null إن كان الاسم مسموحاً */
export function validateUsernameFormat(username: string, _userId?: ID): string | null {
  const t = username.trim();
  if (!t) return "أدخل اسم مستخدم";
  if (t.length > 30) return "اسم المستخدم طويل جداً";
  if (!USERNAME_RE.test(t)) {
    return "يُسمح بالحروف الإنجليزية والأرقام وشرطة سفلية (_) فقط — ممنوع العربية أو الرموز أو الشرطة العلوية (-)";
  }
  return null;
}

export function isUsernameTaken(username: string, users: User[], exceptUserId?: ID): boolean {
  const tl = username.trim().toLowerCase();
  return users.some(u => u.id !== exceptUserId && u.username.toLowerCase() === tl);
}
