/** تطبيع رقم جوال اختياري — أرقام مع + اختياري في البداية */
export function normalizePhone(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  let s = t.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (s.startsWith("+") || t.trimStart().startsWith("+")) return `+${digits}`;
  return digits;
}

/** null = صالح أو فارغ؛ وإلا نص الخطأ */
export function validateOptionalPhone(raw: string): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  const digits = n.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "أدخل رقم جوال صحيح (8–15 رقم)";
  return null;
}
