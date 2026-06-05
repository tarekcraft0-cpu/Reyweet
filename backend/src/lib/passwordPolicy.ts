import { z } from "zod";

const HAS_LETTER = /[a-zA-Z\u0600-\u06FF]/;
const HAS_DIGIT = /\d/;

export const passwordSchema = z
  .string()
  .min(8, "كلمة المرور 8 أحرف على الأقل")
  .max(128)
  .refine(v => HAS_LETTER.test(v), "أدخل حروفاً في كلمة المرور")
  .refine(v => HAS_DIGIT.test(v), "أدخل أرقاماً في كلمة المرور");

export function validatePasswordPlain(pwd: string): string | null {
  const r = passwordSchema.safeParse(pwd);
  return r.success ? null : r.error.issues[0]?.message ?? "كلمة مرور غير صالحة";
}
