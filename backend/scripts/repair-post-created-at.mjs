#!/usr/bin/env node
/**
 * استعادة createdAt الصحيح لمنشورات posts.json من نسخة احتياطية أو أرشيف tar.
 * يصلح التلويث الجماعي (مثل 2026-06-06T13:54:39.080Z) دون المساس بمنشورات جديدة فعلاً.
 * سكربت مستقل — لا يعتمد على مسارات backend على السيرفر.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_MAGIC = "retweet-enc-v1";
const IV_LEN = 12;
const DATA_ROOT = (process.env.DATA_ROOT || "/var/lib/retweet").replace(/\\/g, "/");
const DB_POSTS = process.env.RETWEET_POSTS_FILE || path.join(DATA_ROOT, "db/posts.json");
const BACKUP_CANDIDATES = [
  "/var/lib/retweet/db/posts.json.bak-flush-1780114710606",
  path.join(path.dirname(DB_POSTS), "posts.json.bak"),
];
const TAR_GLOB_DIR = "/var/lib/retweet/backups";
const DRY_RUN = process.argv.includes("--dry-run");
const MIN_AGE_GAP_MS = 36 * 60 * 60 * 1000;

function deriveKey() {
  const secret = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) return null;
  return crypto.scryptSync(secret, "retweet-data-at-rest-v1", 32);
}

function isEncEnvelope(raw) {
  return !!raw && typeof raw === "object" && raw._enc === SNAPSHOT_MAGIC;
}

function decryptPayload(raw) {
  if (!isEncEnvelope(raw)) return raw;
  const key = deriveKey();
  if (!key) return raw;
  try {
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const data = Buffer.from(raw.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    return null;
  }
}

function peelEncryptionLayers(parsed, maxLayers = 128) {
  let cur = parsed;
  for (let i = 0; i < maxLayers; i++) {
    if (!isEncEnvelope(cur)) return cur;
    const dec = decryptPayload(cur);
    if (dec === null) throw new Error("فشل فك تشفير — تحقق من DATA_ENCRYPTION_KEY");
    if (dec === cur) break;
    cur = dec;
  }
  if (isEncEnvelope(cur)) throw new Error("لا يزال الملف مشفّراً بعد إزالة الطبقات");
  return cur;
}

function decodeStoredJson(parsed, file) {
  if (!isEncEnvelope(parsed)) return parsed;
  return peelEncryptionLayers(parsed);
}

function shouldEncryptStorageFile(file) {
  if (!deriveKey()) return false;
  const norm = path.normalize(file).replace(/\\/g, "/");
  if (!norm.endsWith(".json") || norm.includes(".tmp")) return false;
  return norm.startsWith(`${DATA_ROOT}/`);
}

function encryptPayload(value) {
  const key = deriveKey();
  if (!key) return value;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    _enc: SNAPSHOT_MAGIC,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
}

function encodeStoredJson(file, data) {
  if (isEncEnvelope(data)) return data;
  return shouldEncryptStorageFile(file) ? encryptPayload(data) : data;
}

function coerceTimestamp(raw, fallback = 0) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    if (raw < 1_000_000_000_000) return Math.round(raw * 1000);
    return Math.round(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Date.parse(raw.trim());
    if (Number.isFinite(n) && n > 0) return n;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum < 1_000_000_000_000 ? Math.round(asNum * 1000) : Math.round(asNum);
    }
  }
  return fallback;
}

function toMap(dec) {
  if (Array.isArray(dec)) {
    return Object.fromEntries(dec.filter(p => p?.id).map(p => [p.id, p]));
  }
  if (dec && typeof dec === "object") return { ...dec };
  return {};
}

function loadPostsMap(file) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const dec = decodeStoredJson(raw, file);
  return toMap(dec);
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

function collectFromTarArchives() {
  const out = {};
  if (!fs.existsSync(TAR_GLOB_DIR)) return out;
  const tars = fs
    .readdirSync(TAR_GLOB_DIR)
    .filter(n => n.endsWith(".tar.gz"))
    .map(n => path.join(TAR_GLOB_DIR, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 8);

  for (const tar of tars) {
    try {
      const member = execSync(`tar -tzf ${JSON.stringify(tar)}`, { encoding: "utf8" })
        .split("\n")
        .find(l => l.endsWith("/db/posts.json"));
      if (!member) continue;
      const json = execSync(`tar -xOf ${JSON.stringify(tar)} ${JSON.stringify(member)}`, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const map = toMap(decodeStoredJson(JSON.parse(json), member));
      for (const [id, row] of Object.entries(map)) {
        const ms = coerceTimestamp(row.createdAt, 0);
        if (!ms) continue;
        const prev = out[id];
        if (!prev || ms < prev) out[id] = ms;
      }
    } catch {
      /* skip tar */
    }
  }
  return out;
}

function buildAuthoritativeMap() {
  const auth = {};
  for (const bak of BACKUP_CANDIDATES) {
    const map = loadPostsMap(bak);
    for (const [id, row] of Object.entries(map)) {
      const ms = coerceTimestamp(row.createdAt, 0);
      if (!ms) continue;
      if (!auth[id] || ms < auth[id]) auth[id] = ms;
    }
  }
  const tarMs = collectFromTarArchives();
  for (const [id, ms] of Object.entries(tarMs)) {
    if (!auth[id] || ms < auth[id]) auth[id] = ms;
  }
  return auth;
}

function main() {
  if (!fs.existsSync(DB_POSTS)) {
    console.error("missing", DB_POSTS);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(DB_POSTS, "utf8"));
  const current = toMap(decodeStoredJson(raw, DB_POSTS));
  const authoritative = buildAuthoritativeMap();

  let repaired = 0;
  let skipped = 0;
  const samples = [];

  for (const [id, row] of Object.entries(current)) {
    const curMs = coerceTimestamp(row.createdAt, 0);
    const authMs = authoritative[id];
    if (!authMs || !curMs) {
      skipped++;
      continue;
    }
    if (authMs >= curMs - MIN_AGE_GAP_MS) {
      skipped++;
      continue;
    }
    row.createdAt = isoFromMs(authMs);
    repaired++;
    if (samples.length < 12) {
      samples.push({ id, from: isoFromMs(curMs), to: row.createdAt });
    }
  }

  console.log("repair-post-created-at:", {
    total: Object.keys(current).length,
    repaired,
    skipped,
    authoritative: Object.keys(authoritative).length,
    dryRun: DRY_RUN,
  });
  console.log(JSON.stringify(samples, null, 2));

  if (!repaired || DRY_RUN) return;

  const stamp = Date.now();
  const preBackup = `${DB_POSTS}.pre-repair-${stamp}`;
  fs.copyFileSync(DB_POSTS, preBackup);
  const tmp = `${DB_POSTS}.repair-${stamp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(encodeStoredJson(DB_POSTS, current)), "utf8");
  fs.renameSync(tmp, DB_POSTS);
  console.log("wrote", DB_POSTS, "backup at", preBackup);
}

main();
