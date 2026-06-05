import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_ROOT } from "../config.js";

const FILE = path.join(DATA_ROOT, "moderation", "blocked_ips.json");

export type BlockedIpEntry = {
  ip: string;
  reason: string;
  bannedAt: number;
  linkedUserIds?: string[];
};

type BlockedIpsDb = { ips: BlockedIpEntry[] };

const memSet = new Set<string>();
let memLoadedAt = 0;
const MEM_TTL_MS = 6_000;

async function refreshMem(): Promise<void> {
  const now = Date.now();
  if (memLoadedAt && now - memLoadedAt < MEM_TTL_MS) return;
  const db = await readDb();
  memSet.clear();
  for (const e of db.ips) {
    const ip = e.ip?.trim();
    if (ip) memSet.add(ip);
  }
  memLoadedAt = now;
}

function invalidateMem(): void {
  memLoadedAt = 0;
}

async function readDb(): Promise<BlockedIpsDb> {
  try {
    const raw = (await fs.readFile(FILE, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!raw) return { ips: [] };
    const parsed = JSON.parse(raw) as BlockedIpsDb;
    return { ips: Array.isArray(parsed.ips) ? parsed.ips : [] };
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return { ips: [] };
    return { ips: [] };
  }
}

async function writeDb(data: BlockedIpsDb): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, FILE);
  invalidateMem();
}

export async function listBlockedIps(): Promise<BlockedIpEntry[]> {
  const db = await readDb();
  return db.ips;
}

/** فحص متزامن — يعتمد على كاش محمّل مسبقاً */
export function isIpPermanentlyBlockedSync(ip: string): boolean {
  const norm = ip.trim();
  if (!norm || norm === "unknown") return false;
  return memSet.has(norm);
}

export async function ensureIpBlocklistLoaded(): Promise<void> {
  await refreshMem();
}

export async function isIpPermanentlyBlocked(ip: string): Promise<boolean> {
  await refreshMem();
  return isIpPermanentlyBlockedSync(ip);
}

export async function blockIpPermanently(
  ip: string,
  reason: string,
  linkedUserIds?: string[],
): Promise<void> {
  const norm = ip.trim();
  if (!norm || norm === "unknown") return;
  const db = await readDb();
  const existing = db.ips.find(e => e.ip === norm);
  if (existing) {
    existing.reason = reason;
    existing.bannedAt = Date.now();
    existing.linkedUserIds = [...new Set([...(existing.linkedUserIds ?? []), ...(linkedUserIds ?? [])])];
  } else {
    db.ips.push({
      ip: norm,
      reason,
      bannedAt: Date.now(),
      linkedUserIds: linkedUserIds?.length ? linkedUserIds : undefined,
    });
  }
  await writeDb(db);
  memSet.add(norm);
  memLoadedAt = Date.now();
}

export async function unblockIp(ip: string): Promise<boolean> {
  const norm = ip.trim();
  const db = await readDb();
  const before = db.ips.length;
  db.ips = db.ips.filter(e => e.ip !== norm);
  if (db.ips.length === before) return false;
  await writeDb(db);
  memSet.delete(norm);
  return true;
}
