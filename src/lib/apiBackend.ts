import { Capacitor } from "@capacitor/core";
import type { AppState } from "./types";

const TOKEN_KEY = "retweet_api_token";

/** عنوان الخادم: عيّن VITE_API_URL و VITE_API_URL_MOBILE إلى http://<IPv4-الكمبيوتر>:8788 لنفس شبكة الـ Wi‑Fi (الآيفون لا يصل إلى localhost للكمبيوتر). */
export function getApiBaseUrl(): string {
  let raw = "";
  try {
    if (Capacitor.isNativePlatform()) {
      raw = (import.meta.env.VITE_API_URL_MOBILE as string | undefined)?.trim() || (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "";
    } else {
      raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "";
    }
  } catch {
    raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || "";
  }
  return raw.replace(/\/$/, "");
}

export const apiBackendEnabled = (): boolean => getApiBaseUrl().length > 0;

export function getApiToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setApiToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** إزالة كلمات المرور قبل الإرسال للخادم */
export function sanitizeAppStateForSync(state: AppState): AppState {
  return {
    ...state,
    users: state.users.map(u => ({ ...u, password: "" })),
  };
}

const API_FETCH_TIMEOUT_MS = 25_000;

async function apiFetch(path: string, init: RequestInit & { token?: string | null } = {}) {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const t = init.token ?? getApiToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), API_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, headers, signal: ctl.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    const msg = aborted
      ? "انتهت مهلة الاتصال بالخادم — تحقق من تشغيل الـ API ومن أن VITE_API_URL يطابق عنوان جهازك على الشبكة"
      : "تعذر الاتصال بالخادم";
    return new Response(JSON.stringify({ error: msg }), {
      status: aborted ? 504 : 503,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiLogin(
  identifier: string,
  password: string,
): Promise<{ ok: true; token: string; userId: string } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string; user?: { id: string } };
  if (!res.ok) return { ok: false, error: data.error || "فشل تسجيل الدخول" };
  if (!data.token || !data.user?.id) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, token: data.token, userId: data.user.id };
}

export async function apiRegister(
  email: string,
  username: string,
  password: string,
): Promise<{ ok: true; token: string; userId: string } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string; user?: { id: string } };
  if (!res.ok) return { ok: false, error: data.error || "فشل إنشاء الحساب" };
  if (!data.token || !data.user?.id) return { ok: false, error: "استجابة غير صالحة" };
  return { ok: true, token: data.token, userId: data.user.id };
}

export async function pullRemoteAppState(token: string): Promise<AppState | null> {
  const res = await apiFetch("/v1/app-state", { method: "GET", token });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { state?: AppState } | null;
  return data?.state ?? null;
}

export async function pushRemoteAppState(token: string, state: AppState): Promise<boolean> {
  const body = JSON.stringify({ state: sanitizeAppStateForSync(state) });
  const res = await apiFetch("/v1/app-state", { method: "PUT", body, token });
  return res.ok;
}

export async function apiChangePassword(
  token: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/password", {
    method: "PUT",
    body: JSON.stringify({ oldPassword, newPassword }),
    token,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "فشل تغيير كلمة المرور" };
  return { ok: true };
}

export async function apiRequestPasswordReset(identifier: string): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim() }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; devCode?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الطلب" };
  return { ok: true, devCode: data.devCode };
}

export async function apiCompletePasswordReset(
  identifier: string,
  code: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch("/auth/complete-password-reset", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim(), code: code.trim(), newPassword }),
    token: null,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحقق" };
  return { ok: true };
}
