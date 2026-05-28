import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_ROOT } from "../config.js";
import type {
  GroupAuditEntry,
  GroupRegistryRecord,
  GroupSettings,
} from "../../../src/lib/groupTypes.js";
import { DEFAULT_GROUP_SETTINGS } from "../../../src/lib/groupTypes.js";

const REGISTRY_FILE = path.join(DATA_ROOT, "group_registry.json");
const AUDIT_FILE = path.join(DATA_ROOT, "group_audit.json");

type RegistryFile = { groups: Record<string, GroupRegistryRecord> };
type AuditFile = { entries: GroupAuditEntry[] };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export async function getGroupRecord(chatId: string): Promise<GroupRegistryRecord | null> {
  const db = await readJson<RegistryFile>(REGISTRY_FILE, { groups: {} });
  return db.groups[chatId] ?? null;
}

export async function saveGroupRecord(record: GroupRegistryRecord): Promise<void> {
  const db = await readJson<RegistryFile>(REGISTRY_FILE, { groups: {} });
  db.groups[record.chatId] = { ...record, updatedAt: Date.now() };
  await writeJsonAtomic(REGISTRY_FILE, db);
}

export async function deleteGroupRecord(chatId: string): Promise<void> {
  const db = await readJson<RegistryFile>(REGISTRY_FILE, { groups: {} });
  delete db.groups[chatId];
  await writeJsonAtomic(REGISTRY_FILE, db);
}

export async function appendGroupAudit(entry: Omit<GroupAuditEntry, "id" | "at">): Promise<void> {
  const db = await readJson<AuditFile>(AUDIT_FILE, { entries: [] });
  const row: GroupAuditEntry = {
    id: randomUUID(),
    at: Date.now(),
    ...entry,
  };
  db.entries.unshift(row);
  db.entries = db.entries.slice(0, 5000);
  await writeJsonAtomic(AUDIT_FILE, db);
}

export async function listGroupAudit(chatId: string, limit = 50): Promise<GroupAuditEntry[]> {
  const db = await readJson<AuditFile>(AUDIT_FILE, { entries: [] });
  return db.entries.filter(e => e.chatId === chatId).slice(0, limit);
}

export function settingsFromRecord(s?: Partial<GroupSettings>): GroupSettings {
  return { ...DEFAULT_GROUP_SETTINGS, ...s };
}
