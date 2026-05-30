import { apiFetch } from "./apiBackend";

export type SecuritySummary = {
  twoFactorEnabled: boolean;
  trustedDeviceCount: number;
  trustedDevices: Array<{
    fingerprint: string;
    label: string;
    lastSeenAt: string;
    createdAt: string;
  }>;
};

export async function apiGetSecurity(): Promise<
  { ok: true; data: SecuritySummary } | { ok: false; error: string }
> {
  const res = await apiFetch("/v1/me/security");
  const data = (await res.json().catch(() => ({}))) as SecuritySummary & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التحميل" };
  return { ok: true, data };
}

export async function apiSetTwoFactor(
  enabled: boolean,
  password: string,
): Promise<{ ok: true; data: SecuritySummary } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/two-factor", {
    method: "PUT",
    body: JSON.stringify({ enabled, password }),
  });
  const data = (await res.json().catch(() => ({}))) as SecuritySummary & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الحفظ" };
  return { ok: true, data };
}

export async function apiRevokeTrustedDevices(
  password: string,
): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/trusted-devices/revoke-all", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التنفيذ" };
  return { ok: true, message: data.message };
}
