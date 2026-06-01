import { apiFetch } from "./apiBackend";

export type PushPlatform = "ios" | "android" | "web";

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
