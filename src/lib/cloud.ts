/**
 * Supabase للعميل: عنوان URL + المفتاح القابل للنشر من Vite (`VITE_SUPABASE_*`).
 * عندما يكون `VITE_API_URL` فارغاً (معطّل)، لا يُستدعى خادم Retweet المحلي:
 * - المصادقة: `src/lib/supabaseAuth.ts` يستدعي `getSupabaseClient().auth` (تسجيل / دخول / خروج).
 * - قاعدة البيانات (مزامنة الحالة): `loadCloudState` / `saveCloudState` عبر PostgREST على نفس العميل.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "./types";

/** Trim, strip BOM / zero-width chars, and remove a single layer of wrapping quotes (common in .dev.vars / hand-edited .env). */
function normalizeEnvString(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let s = raw.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s || undefined;
}

function readSupabaseUrl(): string | undefined {
  const raw = normalizeEnvString(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  if (!raw) return undefined;
  return raw.replace(/\/+$/, "");
}

function readSupabaseKey(): string | undefined {
  /** مفتاح anon الـ JWT (يبدأ بـ eyJ) — مطلوب لـ Auth؛ مفتاح publishable القصير وحده غالباً يرجع Invalid API key من الخادم */
  const jwtOverride =
    normalizeEnvString(import.meta.env.VITE_SUPABASE_JWT_ANON as string | undefined) ||
    normalizeEnvString(import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY as string | undefined);
  if (jwtOverride?.startsWith("eyJ")) return jwtOverride;

  const anon = normalizeEnvString(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
  if (anon?.startsWith("eyJ")) return anon;

  const publishable = normalizeEnvString(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);
  if (publishable) return publishable;

  if (anon) return anon;
  return undefined;
}

export const cloudEnabled = !!(readSupabaseUrl() && readSupabaseKey());

/**
 * عنوان إعادة التوجيه لرسائل Supabase (تأكيد البريد، إلخ).
 * - إن وُجد `VITE_SUPABASE_AUTH_REDIRECT_URL` يُستخدم كاملاً (مفيد عندما يختلف عن منفذ الواجهة الحالي).
 * - وإلا في المتصفح: `window.location.origin` (يضم المنفذ الحالي، مثل :8080).
 * يجب إضافة نفس العنوان (أو نمطه) في Supabase → Authentication → URL configuration → Redirect URLs.
 */
export function getAuthEmailRedirectUrl(): string | undefined {
  const explicit = normalizeEnvString(
    import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL as string | undefined,
  );
  if (explicit) return explicit.replace(/\/+$/, "") || undefined;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
}

let supabaseSingleton: SupabaseClient | null | undefined;

/**
 * عميل Supabase واحد للمتصفح: جلسة Auth + طلبات PostgREST (مزامنة الحالة).
 * يُنشأ عند أول استدعاء لتجنّب تهيئة خاطئة أثناء SSR.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  if (supabaseSingleton !== undefined) return supabaseSingleton;

  const url = readSupabaseUrl()!;
  const key = readSupabaseKey()!;
  const isBrowser = typeof window !== "undefined";

  supabaseSingleton = createClient(url, key, {
    auth: {
      persistSession: isBrowser,
      autoRefreshToken: isBrowser,
      detectSessionInUrl: isBrowser,
    },
  });
  return supabaseSingleton;
}

export async function loadCloudState(userId: string): Promise<AppState | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("app_user_state")
    .select("state")
    .eq("user_id", userId)
    .single();
  if (error || !data?.state) return null;
  return data.state as AppState;
}

export async function saveCloudState(userId: string, state: AppState): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.from("app_user_state").upsert(
    {
      user_id: userId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
