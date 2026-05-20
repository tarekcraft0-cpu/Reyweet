/** Supabase أُزيل — المصادقة عبر الخادم المحلي فقط. */

export function supabaseReady(): boolean {
  return false;
}

export function getSupabaseNative(): null {
  return null;
}

export async function supabaseSignUp(
  _email: string,
  _username: string,
  _password: string,
): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "استخدم الخادم المحلي" };
}

export async function supabaseSignIn(
  _identifier: string,
  _password: string,
): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "استخدم الخادم المحلي" };
}

export async function supabaseSignOut(): Promise<void> {
  /* no-op */
}

export async function supabaseResetPasswordEmail(_email: string): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "استخدم الخادم المحلي" };
}
