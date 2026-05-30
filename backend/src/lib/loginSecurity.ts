import type { Request } from "express";
import type { UserRow } from "../db/engine.js";
import { updateUser } from "../db/engine.js";

export type TrustedDevice = {
  fingerprint: string;
  label?: string;
  userAgent?: string;
  lastSeenAt: string;
  createdAt: string;
};

const MAX_TRUSTED_DEVICES = 20;

export function getDeviceFingerprintFromRequest(
  req: Request,
  body?: { deviceFingerprint?: string },
): string {
  const fromBody =
    typeof body?.deviceFingerprint === "string"
      ? body.deviceFingerprint.trim().slice(0, 128)
      : "";
  const fromHeader = String(req.headers["x-device-fingerprint"] || "")
    .trim()
    .slice(0, 128);
  return fromBody || fromHeader;
}

export function getDeviceLabelFromRequest(
  req: Request,
  body?: { deviceLabel?: string },
): string {
  const fromBody =
    typeof body?.deviceLabel === "string"
      ? body.deviceLabel.trim().slice(0, 120)
      : "";
  if (fromBody) return fromBody;
  const ua = String(req.headers["user-agent"] || "").trim();
  return ua.slice(0, 120) || "جهاز غير معروف";
}

export function isDeviceTrusted(user: UserRow, fingerprint: string): boolean {
  const fp = fingerprint.trim();
  if (!fp) return false;
  return (user.trustedDevices ?? []).some(d => d.fingerprint === fp);
}

/** هل نطلب كود بريد بعد كلمة المرور؟ */
export function needsLoginEmailOtp(
  user: UserRow,
  fingerprint: string,
  globalLoginOtpRequired: boolean,
): { required: boolean; reason?: "two_factor" | "new_device" | "policy" } {
  if (globalLoginOtpRequired) {
    return { required: true, reason: "policy" };
  }
  if (user.twoFactorEnabled === true) {
    return { required: true, reason: "two_factor" };
  }
  const fp = fingerprint.trim();
  if (!fp || !isDeviceTrusted(user, fp)) {
    return { required: true, reason: "new_device" };
  }
  return { required: false };
}

export async function trustDeviceForUser(
  userId: string,
  fingerprint: string,
  label: string,
  req: Request,
): Promise<void> {
  const fp = fingerprint.trim();
  if (!fp) return;
  const { getUserById } = await import("../db/engine.js");
  const user = await getUserById(userId);
  if (!user) return;

  const now = new Date().toISOString();
  const ua = String(req.headers["user-agent"] || "").slice(0, 200);
  let list: TrustedDevice[] = [...(user.trustedDevices ?? [])];
  const idx = list.findIndex(d => d.fingerprint === fp);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx]!,
      label: label || list[idx]!.label,
      userAgent: ua || list[idx]!.userAgent,
      lastSeenAt: now,
    };
  } else {
    list.push({
      fingerprint: fp,
      label: label || undefined,
      userAgent: ua || undefined,
      createdAt: now,
      lastSeenAt: now,
    });
  }
  list.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  if (list.length > MAX_TRUSTED_DEVICES) {
    list = list.slice(0, MAX_TRUSTED_DEVICES);
  }
  await updateUser(userId, { trustedDevices: list });
}

export async function revokeAllTrustedDevices(userId: string): Promise<void> {
  await updateUser(userId, { trustedDevices: [] });
}

export function securitySummary(user: UserRow) {
  return {
    twoFactorEnabled: user.twoFactorEnabled === true,
    trustedDeviceCount: (user.trustedDevices ?? []).length,
    trustedDevices: (user.trustedDevices ?? []).map(d => ({
      fingerprint: d.fingerprint.slice(0, 8) + "…",
      label: d.label || "جهاز",
      lastSeenAt: d.lastSeenAt,
      createdAt: d.createdAt,
    })),
  };
}
