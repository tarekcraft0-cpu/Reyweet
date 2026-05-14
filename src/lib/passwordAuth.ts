/** تخزين محلي فقط — لا يغني عن خادم حقيقي ولا يحمي من من يتحكم بالجهاز */

const PEPPER = "retweet/auth/v1/local";

export function isLikelyPasswordHash(stored: string): boolean {
  return typeof stored === "string" && /^[a-f0-9]{64}$/i.test(stored);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

export async function hashPassword(plain: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto غير متاح");
  const data = new TextEncoder().encode(`${plain}\n${PEPPER}`);
  const digest = await subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyStoredPassword(
  storedPassword: string,
  plainInput: string,
): Promise<{ ok: boolean; upgradeToHash?: string }> {
  if (isLikelyPasswordHash(storedPassword)) {
    const h = await hashPassword(plainInput);
    return { ok: timingSafeEqualHex(h, storedPassword) };
  }
  if (storedPassword === plainInput) {
    return { ok: true, upgradeToHash: await hashPassword(plainInput) };
  }
  return { ok: false };
}

/** كود تحقق رقمي من 6 خانات — غير قابل للتوقع قدر الإمكان في المتصفح */
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

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** تحقق بسيط للبريد قبل إرسال «كود» وهمي محلياً */
export function validateEmailFormat(email: string): string | null {
  const e = email.trim();
  if (!e) return "أدخل البريد الإلكتروني";
  if (e.length > 254) return "البريد طويل جداً";
  // نمط عملي بسيط — ليس RFC كاملاً
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "صيغة البريد غير صحيحة";
  return null;
}

export function validateNewPasswordPlain(plain: string): string | null {
  if (plain.length < 6) return "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
  if (plain.length > 128) return "كلمة المرور طويلة جداً";
  return null;
}
