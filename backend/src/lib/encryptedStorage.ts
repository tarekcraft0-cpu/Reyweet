import path from "node:path";
import fs from "node:fs/promises";
import { DATA_ROOT } from "../config.js";
import {
  dataEncryptionEnabled,
  decryptPayload,
  encryptPayload,
} from "./dataEncryption.js";

function isEncEnvelope(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === "object" &&
    (raw as { _enc?: string })._enc === "retweet-enc-v1"
  );
}

/** ملفات JSON الحساسة — تُشفَّر بالكامل على القرص */
export function shouldEncryptStorageFile(file: string): boolean {
  if (!dataEncryptionEnabled()) return false;
  const norm = path.normalize(file).replace(/\\/g, "/");
  if (!norm.endsWith(".json") || norm.includes(".tmp")) return false;
  const root = DATA_ROOT.replace(/\\/g, "/");
  return norm.startsWith(`${root}/`);
}

export function decodeStoredJson<T>(parsed: unknown, file: string): T {
  if (!isEncEnvelope(parsed)) return parsed as T;
  const dec = decryptPayload(parsed);
  if (dec === null) {
    throw new Error(`فشل فك تشفير ${path.basename(file)} — تحقق من DATA_ENCRYPTION_KEY`);
  }
  return dec as T;
}

export function encodeStoredJson(file: string, data: unknown): unknown {
  return shouldEncryptStorageFile(file) ? encryptPayload(data) : data;
}

/** ترحيل الملفات القديمة (نص صريح) إلى نسخة مشفّرة */
export async function migratePlainJsonFilesToEncrypted(): Promise<number> {
  if (!dataEncryptionEnabled()) return 0;
  let migrated = 0;
  async function migrateDir(dir: string): Promise<void> {
    let entries: { name: string; isDir: boolean }[] = [];
    try {
      const raw = await fs.readdir(dir, { withFileTypes: true });
      entries = raw.map(d => ({ name: d.name, isDir: d.isDirectory() }));
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDir) {
        if (ent.name === "media" || ent.name === "uploads") continue;
        await migrateDir(full);
        continue;
      }
      if (!ent.name.endsWith(".json") || ent.name.includes(".tmp")) continue;
      try {
        const raw = await fs.readFile(full, "utf8");
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim()) as unknown;
        if (isEncEnvelope(parsed)) continue;
        const enc = encryptPayload(parsed);
        const tmp = `${full}.enc-mig.tmp`;
        await fs.writeFile(tmp, JSON.stringify(enc), "utf8");
        await fs.rename(tmp, full);
        migrated += 1;
      } catch {
        /* skip corrupt */
      }
    }
  }
  await migrateDir(DATA_ROOT);
  return migrated;
}
