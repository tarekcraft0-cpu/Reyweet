/** نفس قواعد الويب — للتحقق قبل التسجيل على الخادم */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmailFormat(email: string): string | null {
  const e = email.trim();
  if (!e) return "أدخل البريد الإلكتروني";
  if (e.length > 254) return "البريد طويل جداً";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "صيغة البريد غير صحيحة";
  return null;
}

export function validateNewPasswordPlain(plain: string): string | null {
  if (plain.length < 6) return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
  if (plain.length > 128) return "كلمة المرور طويلة جداً";
  return null;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

export function validateUsernameFormat(username: string): string | null {
  const t = username.trim();
  if (!t) return "أدخل اسم مستخدم";
  if (t.length < 3) return "اسم المستخدم يجب أن يكون 3 أحرف على الأقل";
  if (t.length > 30) return "اسم المستخدم طويل جداً";
  if (!USERNAME_RE.test(t)) {
    return "يُسمح بالحروف الإنجليزية والأرقام و _ فقط";
  }
  return null;
}

export function generateOtpDigits(): string {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    const n = 100000 + (buf[0]! % 900000);
    return String(n);
  }
  return String(100000 + Math.floor(Math.random() * 900000));
}
