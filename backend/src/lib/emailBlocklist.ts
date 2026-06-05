import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_ROOT } from "../config.js";

const FILE = path.join(DATA_ROOT, "moderation", "blocked_emails.json");

export type BlockedEmailEntry = {
  email: string;
  reason: string;
  bannedAt: number;
  linkedUserIds?: string[];
};

type BlockedEmailsDb = { emails: BlockedEmailEntry[] };

const memSet = new Set<string>();
let memLoadedAt = 0;
const MEM_TTL_MS = 6_000;

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function refreshMem(): Promise<void> {
  const now = Date.now();
  if (memLoadedAt && now - memLoadedAt < MEM_TTL_MS) return;
  const db = await readDb();
  memSet.clear();
  for (const e of db.emails) {
    const em = normEmail(e.email || "");
    if (em) memSet.add(em);
  }
  memLoadedAt = now;
}

function invalidateMem(): void {
  memLoadedAt = 0;
}

async function readDb(): Promise<BlockedEmailsDb> {
  try {
    const raw = (await fs.readFile(FILE, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!raw) return { emails: [] };
    const parsed = JSON.parse(raw) as BlockedEmailsDb;
    return { emails: Array.isArray(parsed.emails) ? parsed.emails : [] };
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { emails: [] };
    return { emails: [] };
  }
}

async function writeDb(data: BlockedEmailsDb): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, FILE);
  invalidateMem();
}

export async function ensureEmailBlocklistLoaded(): Promise<void> {
  await refreshMem();
}

export function isEmailPermanentlyBlockedSync(email: string): boolean {
  const norm = normEmail(email);
  if (!norm) return false;
  return memSet.has(norm);
}

export async function isEmailPermanentlyBlocked(email: string): Promise<boolean> {
  await refreshMem();
  return isEmailPermanentlyBlockedSync(email);
}

export async function blockEmailPermanently(
  email: string,
  reason: string,
  linkedUserIds?: string[],
): Promise<void> {
  const norm = normEmail(email);
  if (!norm) return;
  const db = await readDb();
  const existing = db.emails.find(e => normEmail(e.email) === norm);
  if (existing) {
    existing.reason = reason;
    existing.bannedAt = Date.now();
    existing.linkedUserIds = [
      ...new Set([...(existing.linkedUserIds ?? []), ...(linkedUserIds ?? [])]),
    ];
  } else {
    db.emails.push({
      email: norm,
      reason,
      bannedAt: Date.now(),
      linkedUserIds: linkedUserIds?.length ? linkedUserIds : undefined,
    });
  }
  await writeDb(db);
  memSet.add(norm);
  memLoadedAt = Date.now();
}

export async function listBlockedEmails(): Promise<BlockedEmailEntry[]> {
  const db = await readDb();
  return db.emails;
}
