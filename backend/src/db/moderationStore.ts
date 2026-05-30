import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DATA_ROOT } from "../config.js";
import type {
  ModerationAppeal,
  ModerationReport,
  UserModerationState,
} from "../../../src/lib/moderationTypes.js";

const DIR = path.join(DATA_ROOT, "moderation");
const REPORTS_FILE = path.join(DIR, "reports.json");
const APPEALS_FILE = path.join(DIR, "appeals.json");
const USER_STATES_FILE = path.join(DIR, "user_states.json");
const AUDIT_FILE = path.join(DIR, "audit.json");

type ReportsDb = { reports: ModerationReport[] };
type AppealsDb = { appeals: ModerationAppeal[] };
type UserStatesDb = { users: Record<string, UserModerationState> };
type AuditDb = { entries: AuditEntry[] };

export type AuditEntry = {
  id: string;
  actorId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  immutableHash: string;
  at: number;
};

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function hashEntry(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function appendModerationAudit(entry: Omit<AuditEntry, "id" | "at" | "immutableHash">): Promise<void> {
  const db = await readJson<AuditDb>(AUDIT_FILE, { entries: [] });
  const body = { ...entry, at: Date.now() };
  const row: AuditEntry = {
    id: randomUUID(),
    ...body,
    immutableHash: hashEntry(body),
  };
  db.entries.unshift(row);
  db.entries = db.entries.slice(0, 10_000);
  await writeJsonAtomic(AUDIT_FILE, db);
}

export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const db = await readJson<AuditDb>(AUDIT_FILE, { entries: [] });
  return db.entries.slice(0, limit);
}

export async function saveReport(report: ModerationReport): Promise<void> {
  const db = await readJson<ReportsDb>(REPORTS_FILE, { reports: [] });
  const i = db.reports.findIndex(r => r.id === report.id);
  if (i >= 0) db.reports[i] = report;
  else db.reports.unshift(report);
  db.reports = db.reports.slice(0, 50_000);
  await writeJsonAtomic(REPORTS_FILE, db);
}

export async function getReport(id: string): Promise<ModerationReport | null> {
  const db = await readJson<ReportsDb>(REPORTS_FILE, { reports: [] });
  return db.reports.find(r => r.id === id) ?? null;
}

export async function listReports(filter?: {
  status?: string;
  reportedUserId?: string;
  q?: string;
  limit?: number;
}): Promise<ModerationReport[]> {
  const db = await readJson<ReportsDb>(REPORTS_FILE, { reports: [] });
  let rows = db.reports;
  if (filter?.status) rows = rows.filter(r => r.status === filter.status);
  if (filter?.reportedUserId) rows = rows.filter(r => r.reportedUserId === filter.reportedUserId);
  if (filter?.q?.trim()) {
    const q = filter.q.toLowerCase();
    rows = rows.filter(
      r =>
        r.id.toLowerCase().includes(q) ||
        r.reporterId.toLowerCase().includes(q) ||
        r.reportedUserId.toLowerCase().includes(q),
    );
  }
  return rows.slice(0, filter?.limit ?? 200);
}

export async function countRecentReportsByReporter(reporterId: string, sinceMs: number): Promise<number> {
  const db = await readJson<ReportsDb>(REPORTS_FILE, { reports: [] });
  return db.reports.filter(r => r.reporterId === reporterId && r.createdAt >= sinceMs).length;
}

/** يمنع النقر المزدوج فقط — نفس البلاغ خلال ثوانٍ قليلة */
export async function findDuplicateReport(
  reporterId: string,
  reportedUserId: string,
  category: string,
  targetId?: string,
  withinMs = 90 * 1000,
): Promise<ModerationReport | null> {
  const db = await readJson<ReportsDb>(REPORTS_FILE, { reports: [] });
  const since = Date.now() - withinMs;
  return (
    db.reports.find(
      r =>
        r.reporterId === reporterId &&
        r.reportedUserId === reportedUserId &&
        r.category === category &&
        (r.targetId || undefined) === (targetId || undefined) &&
        r.createdAt >= since,
    ) ?? null
  );
}

export async function getUserModerationState(userId: string): Promise<UserModerationState> {
  const db = await readJson<UserStatesDb>(USER_STATES_FILE, { users: {} });
  const existing = db.users[userId];
  if (existing) return existing;
  return {
    userId,
    accountStatus: "ACTIVE",
    violationCount: 0,
    violations: [],
    deviceFingerprints: [],
    ipAddresses: [],
    updatedAt: Date.now(),
  };
}

export async function saveUserModerationState(state: UserModerationState): Promise<void> {
  const db = await readJson<UserStatesDb>(USER_STATES_FILE, { users: {} });
  db.users[state.userId] = { ...state, updatedAt: Date.now() };
  await writeJsonAtomic(USER_STATES_FILE, db);
}

export async function dismissUserModerationNotice(
  userId: string,
  noticeId: string,
): Promise<boolean> {
  const state = await getUserModerationState(userId);
  if (!state.pendingNotice || state.pendingNotice.id !== noticeId) return false;
  state.pendingNotice = undefined;
  await saveUserModerationState(state);
  return true;
}

export async function saveAppeal(appeal: ModerationAppeal): Promise<void> {
  const db = await readJson<AppealsDb>(APPEALS_FILE, { appeals: [] });
  const i = db.appeals.findIndex(a => a.id === appeal.id);
  if (i >= 0) db.appeals[i] = appeal;
  else db.appeals.unshift(appeal);
  await writeJsonAtomic(APPEALS_FILE, db);
}

export async function getAppeal(id: string): Promise<ModerationAppeal | null> {
  const db = await readJson<AppealsDb>(APPEALS_FILE, { appeals: [] });
  return db.appeals.find(a => a.id === id) ?? null;
}

export async function listAppeals(filter?: { status?: string; userId?: string }): Promise<ModerationAppeal[]> {
  const db = await readJson<AppealsDb>(APPEALS_FILE, { appeals: [] });
  let rows = db.appeals;
  if (filter?.status) rows = rows.filter(a => a.status === filter.status);
  if (filter?.userId) rows = rows.filter(a => a.userId === filter.userId);
  return rows.slice(0, 200);
}

export async function getActiveAppealForUser(userId: string): Promise<ModerationAppeal | null> {
  const db = await readJson<AppealsDb>(APPEALS_FILE, { appeals: [] });
  return (
    db.appeals.find(
      a =>
        a.userId === userId &&
        (a.status === "pending" || a.status === "under_review"),
    ) ?? null
  );
}

export async function hasRejectedAppealPermanent(userId: string): Promise<boolean> {
  const state = await getUserModerationState(userId);
  return state.accountStatus === "PERMANENTLY_BANNED";
}

export async function linkDeviceAndIp(
  userId: string,
  fingerprint?: string,
  ip?: string,
): Promise<void> {
  const state = await getUserModerationState(userId);
  if (fingerprint && !state.deviceFingerprints.includes(fingerprint)) {
    state.deviceFingerprints.push(fingerprint);
  }
  if (ip && !state.ipAddresses.includes(ip)) {
    state.ipAddresses.push(ip);
  }
  await saveUserModerationState(state);
}

export async function findUsersByDevice(fingerprint: string): Promise<string[]> {
  const db = await readJson<UserStatesDb>(USER_STATES_FILE, { users: {} });
  return Object.values(db.users)
    .filter(u => u.deviceFingerprints.includes(fingerprint))
    .map(u => u.userId);
}

export async function findUsersByIp(ip: string): Promise<string[]> {
  const db = await readJson<UserStatesDb>(USER_STATES_FILE, { users: {} });
  return Object.values(db.users)
    .filter(u => u.ipAddresses.includes(ip))
    .map(u => u.userId);
}
