import { apiFetch } from "./apiBackend";

export type PushPlatform = "ios" | "android" | "web";

export async function apiRegisterPushToken(
  token: string,
  platform: PushPlatform,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authToken = (await import("./apiBackend")).getApiToken();
  if (!authToken) return { ok: false, error: "غير مسجّل" };
  const res = await apiFetch("/v1/push/register", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({ token, platform }),
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
