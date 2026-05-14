import { getAuthEmailRedirectUrl, getSupabaseClient } from "./cloud";
import { normalizeEmail, validateEmailFormat, validateNewPasswordPlain } from "./passwordAuth";
import { validateUsernameFormat } from "./usernameRules";

export async function supabaseSignUp(
  email: string,
  username: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "إعدادات Supabase غير مكتملة" };
  const nameErr = validateUsernameFormat(username.trim());
  if (nameErr) return { ok: false, error: nameErr };
  const emailErr = validateEmailFormat(email);
  if (emailErr) return { ok: false, error: emailErr };
  const pwdErr = validateNewPasswordPlain(password);
  if (pwdErr) return { ok: false, error: pwdErr };

  const emailRedirectTo = getAuthEmailRedirectUrl();
  const { data, error } = await sb.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: { username: username.trim() },
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  if (error) {
    let msg = error.message;
    if (/invalid api key/i.test(msg)) {
      msg +=
        " — انسخ مفتاح **anon public** الطويل (JWT يبدأ بـ eyJ) من Supabase → Project Settings → API، وضعه في `.env.local` كـ `VITE_SUPABASE_JWT_ANON=...` أو استبدل `VITE_SUPABASE_ANON_KEY` به (مفتاح publishable القصير ذو البادئة sb_ لا يكفي لبعض عمليات Auth).";
    }
    return { ok: false, error: msg };
  }
  const userId = data.user?.id;
  if (!userId) return { ok: false, error: "لم يُرجع الخادم معرف مستخدم" };
  if (!data.session) {
    return {
      ok: false,
      error: "تحقق من بريدك واضغط رابط التأكيد لإكمال التسجيل، ثم سجّل الدخول.",
    };
  }
  return { ok: true, userId };
}

export async function supabaseSignIn(
  identifier: string,
  password: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "إعدادات Supabase غير مكتملة" };
  const idTrim = identifier.trim();
  if (validateEmailFormat(idTrim) !== null) {
    return {
      ok: false,
      error: "مع Supabase أدخل البريد الإلكتروني في خانة اسم المستخدم (لا يكفي اليوزر وحده).",
    };
  }
  const email = normalizeEmail(idTrim);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    let msg = error.message;
    if (/invalid api key/i.test(msg)) {
      msg +=
        " — انسخ مفتاح **anon public** الطويل (JWT يبدأ بـ eyJ) من Supabase → Project Settings → API، وضعه في `.env.local` كـ `VITE_SUPABASE_JWT_ANON=...` أو استبدل `VITE_SUPABASE_ANON_KEY` به (مفتاح publishable القصير ذو البادئة sb_ لا يكفي لبعض عمليات Auth).";
    }
    return { ok: false, error: msg };
  }
  const userId = data.user?.id;
  if (!userId) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, userId };
}

export async function supabaseSignOut(): Promise<void> {
  const sb = getSupabaseClient();
  if (sb) await sb.auth.signOut();
}
