/**
 * عميل API لـ React Native — يعادل src/lib/apiBackend.ts (بدون Capacitor / localStorage).
 * العنوان: EXPO_PUBLIC_API_URL أو app.json → expo.extra.apiUrl
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { supabaseReady } from "./supabaseNative";
import type { AppState } from "./types";

const TOKEN_KEY = "retweet_api_token";

function fromEnv(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return (extra?.apiUrl ?? "").trim().replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  return fromEnv();
}

export const apiBackendEnabled = (): boolean => getApiBaseUrl().length > 0;

export async function getApiToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setApiToken(token: string | null): Promise<void> {
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function sanitizeAppStateForSync(state: AppState): AppState {
  return {
    ...state,
    users: state.users.map(u => ({ ...u, password: "" })),
  };
}

async function apiFetch(path: string, init: RequestInit & { token?: string | null } = {}) {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const { token: explicitToken, ...fetchInit } = init;
  const t = explicitToken !== undefined ? explicitToken : await getApiToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  return fetch(url, { ...fetchInit, headers });
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

export async function apiRequestPasswordReset(
  identifier: string,
): Promise<{ ok: true; devCode?: string } | { ok: false; error: string }> {
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

export function authBackendReady(): boolean {
  return apiBackendEnabled() || supabaseReady();
}
