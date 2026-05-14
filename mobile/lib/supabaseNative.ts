import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

import {
  normalizeEmail,
  validateEmailFormat,
  validateNewPasswordPlain,
  validateUsernameFormat,
} from "@/lib/authUtils";

function normalizeEnvString(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let s = raw.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s || undefined;
}

function readUrl(): string | undefined {
  const fromEnv = normalizeEnvString(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const extra = Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined;
  return normalizeEnvString(extra?.supabaseUrl)?.replace(/\/+$/, "");
}

function readKey(): string | undefined {
  const jwtOverride =
    normalizeEnvString(process.env.EXPO_PUBLIC_SUPABASE_JWT_ANON) ||
    normalizeEnvString(process.env.EXPO_PUBLIC_SUPABASE_LEGACY_ANON_KEY);
  if (jwtOverride?.startsWith("eyJ")) return jwtOverride;

  const anon = normalizeEnvString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  if (anon?.startsWith("eyJ")) return anon;

  const pub = normalizeEnvString(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (pub) return pub;

  if (anon) return anon;
  const extra = Constants.expoConfig?.extra as { supabaseAnonKey?: string } | undefined;
  return normalizeEnvString(extra?.supabaseAnonKey);
}

/** روابط البريد (تأكيد، استعادة) — يجب أن يطابق إدخالاً في Supabase → Redirect URLs */
function readAuthEmailRedirectUrl(): string | undefined {
  const explicit = normalizeEnvString(process.env.EXPO_PUBLIC_SUPABASE_AUTH_REDIRECT_URL);
  if (explicit) return explicit.replace(/\/+$/, "") || undefined;
  const webApp = normalizeEnvString(process.env.EXPO_PUBLIC_WEB_APP_URL);
  if (webApp) return webApp.replace(/\/+$/, "") || undefined;
  return undefined;
}

export function supabaseReady(): boolean {
  return !!(readUrl() && readKey());
}

let singleton: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseReady()) return null;
  if (singleton !== undefined) return singleton;
  const url = readUrl()!;
  const key = readKey()!;
  singleton = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return singleton;
}

export async function supabaseSignUp(
  email: string,
  username: string,
  password: string,
): Promise<{ ok: true; accessToken: string; userId: string } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير مهيأ" };
  const nameErr = validateUsernameFormat(username.trim());
  if (nameErr) return { ok: false, error: nameErr };
  const emailErr = validateEmailFormat(email);
  if (emailErr) return { ok: false, error: emailErr };
  const pwdErr = validateNewPasswordPlain(password);
  if (pwdErr) return { ok: false, error: pwdErr };

  const emailRedirectTo = readAuthEmailRedirectUrl();
  const { data, error } = await sb.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: { username: username.trim() },
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });
  if (error) return { ok: false, error: error.message };
  const userId = data.user?.id;
  const accessToken = data.session?.access_token;
  if (!userId) return { ok: false, error: "لم يُرجع الخادم معرف مستخدم" };
  if (!accessToken) {
    return {
      ok: false,
      error: "تحقق من بريدك واضغط رابط التأكيد، ثم سجّل الدخول.",
    };
  }
  return { ok: true, accessToken, userId };
}

export async function supabaseSignIn(
  identifier: string,
  password: string,
): Promise<{ ok: true; accessToken: string; userId: string } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير مهيأ" };
  const idTrim = identifier.trim();
  if (validateEmailFormat(idTrim) !== null) {
    return {
      ok: false,
      error: "أدخل البريد الإلكتروني في خانة اسم المستخدم (Supabase).",
    };
  }
  const email = normalizeEmail(idTrim);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  const userId = data.user?.id;
  const accessToken = data.session?.access_token;
  if (!userId || !accessToken) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, accessToken, userId };
}

export async function supabaseSignOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

export async function supabaseResetPasswordEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase غير مهيأ" };
  const e = normalizeEmail(email);
  if (validateEmailFormat(e) !== null) return { ok: false, error: "أدخل بريداً صحيحاً" };
  const redirectTo = readAuthEmailRedirectUrl();
  const { error } = await sb.auth.resetPasswordForEmail(e, {
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
