import { apiFetch } from "./apiBackend";
import type { NotificationPrefs } from "./notificationPrefs";

export type PushPlatform = "ios" | "android" | "web";

export type PushStatusResponse = {
  configured: boolean;
  store: string;
  tokenCount: number;
  prefs?: NotificationPrefs & { messagePush?: boolean };
};

const DEVICE_ID_KEY = "retweet_device_id_v1";

export function getPushDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `ephemeral_${Date.now()}`;
  }
}

export async function apiRegisterPushToken(
  token: string,
  platform: PushPlatform,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch("/v1/push/register", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      token,
      platform,
      deviceId: getPushDeviceId(),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر حفظ رمز الإشعار" };
  return { ok: true };
}

export async function apiUnregisterPushToken(token: string): Promise<void> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return;
  await apiFetch("/v1/push/register", {
    method: "DELETE",
    token: authToken,
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
}

export async function apiFetchPushStatus(): Promise<PushStatusResponse | null> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return null;
  const res = await apiFetch("/v1/push/status", { method: "GET", token: authToken });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as PushStatusResponse | null;
}

export async function apiSyncNotificationPrefs(
  prefs: NotificationPrefs,
): Promise<boolean> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return false;
  const res = await apiFetch("/v1/push/prefs", {
    method: "PUT",
    token: authToken,
    body: JSON.stringify({
      ...prefs,
      messagePush: prefs.pushEnabled,
    }),
  });
  return res.ok;
}

export async function apiFetchNotificationPrefsFromServer(): Promise<NotificationPrefs | null> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return null;
  const res = await apiFetch("/v1/push/prefs", { method: "GET", token: authToken });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { prefs?: NotificationPrefs };
  return data.prefs ?? null;
}

export async function apiSendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch("/v1/push/send", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({
      title: "Reyweet",
      body: "إشعار تجريبي — الإشعارات تعمل ✓",
      data: { type: "CUSTOM" },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    success?: boolean;
    noTokens?: boolean;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.noTokens
        ? "لم يُسجَّل رمز الجهاز بعد — فعّل إذن الإشعارات ثم أعد المحاولة"
        : data.error || "تعذّر الإرسال",
    };
  }
  return { ok: !!data.success };
}
