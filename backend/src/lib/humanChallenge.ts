import crypto from "node:crypto";
import type { Request } from "express";
import { isAuthStrictMode } from "./botGuard.js";

type Challenge = { id: string; exp: number; used: boolean };

const challenges = new Map<string, Challenge>();
const TTL_MS = 8 * 60 * 1000;

function sweep(): void {
  if (Math.random() > 0.05) return;
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.used || c.exp < now) challenges.delete(id);
  }
}

export function issueHumanChallenge(): { challengeId: string; expiresInSec: number } {
  sweep();
  const id = crypto.randomBytes(18).toString("hex");
  challenges.set(id, { id, exp: Date.now() + TTL_MS, used: false });
  return { challengeId: id, expiresInSec: Math.floor(TTL_MS / 1000) };
}

export function consumeHumanChallenge(challengeId: string | undefined): boolean {
  if (!isAuthStrictMode()) return true;
  const id = (challengeId || "").trim();
  if (!id || id.length < 16) return false;
  const row = challenges.get(id);
  if (!row || row.used || row.exp < Date.now()) return false;
  row.used = true;
  return true;
}

export function humanChallengeFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = (body as Record<string, unknown>).humanChallengeId;
  return typeof raw === "string" ? raw.trim() : undefined;
}

export function assertValidHumanChallenge(req: Request, body?: unknown): { ok: true } | { ok: false; error: string } {
  if (!isAuthStrictMode()) return { ok: true };
  const id = humanChallengeFromBody(body);
  if (!consumeHumanChallenge(id)) {
    return { ok: false, error: "انتهت جلسة التحقق — أعد تحميل صفحة الدخول" };
  }
  return { ok: true };
}
