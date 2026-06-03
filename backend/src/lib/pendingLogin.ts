import crypto from "node:crypto";

type Pending = {
  userId: string;
  deviceFingerprint: string;
  deviceLabel: string;
  expiresAt: number;
};

const pending = new Map<string, Pending>();

export function createPendingLogin(
  userId: string,
  deviceFingerprint: string,
  deviceLabel: string,
): string {
  const id = crypto.randomBytes(24).toString("hex");
  pending.set(id, {
    userId,
    deviceFingerprint,
    deviceLabel,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return id;
}

export function consumePendingLogin(id: string): Pending | null {
  const row = pending.get(id);
  pending.delete(id);
  if (!row || Date.now() > row.expiresAt) return null;
  return row;
}
