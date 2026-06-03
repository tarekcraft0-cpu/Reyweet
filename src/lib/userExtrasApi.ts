import { apiFetch, getApiToken } from "./apiBackend";

export async function apiToggleSavedPost(
  postId: string,
): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "سجّل الدخول أولاً" };
  const res = await apiFetch(`/v1/me/saved/${encodeURIComponent(postId)}/toggle`, {
    method: "POST",
    token,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; saved?: boolean };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الحفظ" };
  return { ok: true, saved: !!data.saved };
}

export async function apiListSavedPostIds(): Promise<
  { ok: true; savedPostIds: string[] } | { ok: false; error: string }
> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "سجّل الدخول أولاً" };
  const res = await apiFetch("/v1/me/saved", { token });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    savedPostIds?: string[];
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحميل" };
  return { ok: true, savedPostIds: data.savedPostIds ?? [] };
}

export async function apiGetLoginHistory(): Promise<
  | {
      ok: true;
      loginHistory: Array<{
        at: string;
        success: boolean;
        ip?: string;
        userAgent?: string;
        deviceLabel?: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "سجّل الدخول أولاً" };
  const res = await apiFetch("/v1/me/login-history", { token });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    loginHistory?: Array<{
      at: string;
      success: boolean;
      ip?: string;
      userAgent?: string;
      deviceLabel?: string;
    }>;
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحميل" };
  return { ok: true, loginHistory: data.loginHistory ?? [] };
}

export type TimeManagementPrefs = {
  dailyLimitMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export async function apiGetTimeManagement(): Promise<
  { ok: true; timeManagement: TimeManagementPrefs } | { ok: false; error: string }
> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "سجّل الدخول أولاً" };
  const res = await apiFetch("/v1/me/time-management", { token });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    timeManagement?: TimeManagementPrefs;
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحميل" };
  return {
    ok: true,
    timeManagement: data.timeManagement ?? {
      dailyLimitMinutes: 0,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    },
  };
}

export async function apiSetTimeManagement(
  prefs: Partial<TimeManagementPrefs>,
): Promise<{ ok: true; timeManagement: TimeManagementPrefs } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "سجّل الدخول أولاً" };
  const res = await apiFetch("/v1/me/time-management", {
    method: "PUT",
    token,
    body: JSON.stringify(prefs),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    timeManagement?: TimeManagementPrefs;
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الحفظ" };
  return {
    ok: true,
    timeManagement: data.timeManagement ?? {
      dailyLimitMinutes: 0,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    },
  };
}

export async function apiSyncScheduledPosts(
  items: Array<{
    id?: string;
    text: string;
    image?: string;
    type?: "post" | "tweet";
    publishAt: string;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = getApiToken();
  if (!token) return { ok: false, error: "سجّل الدخول أولاً" };
  const res = await apiFetch("/v1/me/scheduled-posts/sync", {
    method: "PUT",
    token,
    body: JSON.stringify({ items }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر المزامنة" };
  return { ok: true };
}
