import type { Request } from "express";
import { linkDeviceAndIp } from "../db/moderationStore.js";
import { clientIpFromRequest } from "./botAutoBan.js";
import { getDeviceFingerprintFromRequest } from "./loginSecurity.js";

const lastRecorded = new Map<string, number>();
const GAP_MS = 3 * 60 * 1000;

/** يسجّل IP (وبصمة الجهاز إن وُجدت) لكل مستخدم نشط — بحد أقصى مرة كل 3 دقائق لكل IP */
export async function recordUserIpActivity(userId: string, req: Request): Promise<void> {
  if (!userId) return;
  const ip = clientIpFromRequest(req);
  if (!ip || ip === "unknown") return;
  const fp = getDeviceFingerprintFromRequest(req);
  const key = `${userId}:${ip}:${fp || ""}`;
  const now = Date.now();
  const prev = lastRecorded.get(key);
  if (prev && now - prev < GAP_MS) return;
  lastRecorded.set(key, now);
  try {
    await linkDeviceAndIp(userId, fp || undefined, ip);
  } catch (e) {
    console.warn("[ip-activity] record failed:", userId, ip, e);
  }
}
