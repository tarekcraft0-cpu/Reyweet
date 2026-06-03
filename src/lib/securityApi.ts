import { apiFetch } from "./apiBackend";

export type SecuritySummary = {
  twoFactorEnabled: boolean;
  totpEnabled?: boolean;
  totpConfigured?: boolean;
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

export async function apiTotpSetup(
  password: string,
): Promise<
  | { ok: true; secret: string; provisioningUri: string }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/v1/me/totp/setup", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    secret?: string;
    provisioningUri?: string;
    error?: string;
  };
  if (!res.ok || !data.secret) return { ok: false, error: data.error || "تعذر الإعداد" };
  return {
    ok: true,
    secret: data.secret,
    provisioningUri: data.provisioningUri || "",
  };
}

export async function apiTotpEnable(
  password: string,
  code: string,
): Promise<{ ok: true; data: SecuritySummary } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/totp/enable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
  const data = (await res.json().catch(() => ({}))) as SecuritySummary & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر التفعيل" };
  return { ok: true, data };
}

export async function apiTotpDisable(
  password: string,
): Promise<{ ok: true; data: SecuritySummary } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/totp/disable", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  const data = (await res.json().catch(() => ({}))) as SecuritySummary & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الإيقاف" };
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
