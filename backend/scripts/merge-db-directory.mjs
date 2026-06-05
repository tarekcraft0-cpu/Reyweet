#!/usr/bin/env node
/**
 * دمج مجلد db قديم (من أرشيف نسخ احتياطية) داخل DATA_ROOT الحالي بدون حذف ما هو أحدث.
 *
 *   DATA_ROOT=/var/lib/retweet MERGE_SRC=/tmp/extracted/RetweetSocial node backend/scripts/merge-db-directory.mjs
 *
 * يبحث تلقائياً عن MERGE_SRC/db أو MERGE_SRC إذا كان يحوي messages.json مباشرة.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const ENC_MAGIC = "retweet-enc-v1";

function deriveKey() {
  const secret = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) return null;
  return crypto.scryptSync(secret, "retweet-data-at-rest-v1", 32);
}

function isEncEnvelope(raw) {
  return !!raw && typeof raw === "object" && raw._enc === ENC_MAGIC;
}

function decryptStored(raw) {
  if (!isEncEnvelope(raw)) return raw;
  const key = deriveKey();
  if (!key) {
    console.warn("[merge-db] users/posts مشفّرة — عيّن DATA_ENCRYPTION_KEY لفكها قبل الدمج");
    return raw;
  }
  try {
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const data = Buffer.from(raw.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    console.warn("[merge-db] فشل فك تشفير ملف — يُستخدم المحتوى كما هو");
    return raw;
  }
}

function encryptStored(data) {
  const key = deriveKey();
  if (!key) return data;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(data), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return {
    _enc: ENC_MAGIC,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: enc.toString("base64"),
  };
}

function shouldEncryptTarget(file) {
  return !!deriveKey() && path.normalize(file).replace(/\\/g, "/").startsWith(`${DATA_ROOT.replace(/\\/g, "/")}/`);
}

async function readJson(file, fallback, { decrypt = false } = {}) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim() || "null") ?? fallback;
    return decrypt ? decryptStored(parsed) : parsed;
  } catch {
    return fallback;
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.merge-${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const payload = shouldEncryptTarget(file) ? encryptStored(data) : data;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function resolveDbDir(mergeSrc) {
  const base = path.resolve(mergeSrc);
  try {
    await fs.access(path.join(base, "db", "messages.json"));
    return path.join(base, "db");
  } catch {
    /* continue */
  }
  try {
    await fs.access(path.join(base, "messages.json"));
    return base;
  } catch {
    return null;
  }
}

function msgTime(row) {
  const t = row?.createdAt;
  if (!t) return 0;
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : 0;
}

function mergeMessageMaps(current, incoming) {
  const out = { ...(current || {}) };
  let added = 0;
  let replacedNewer = 0;
  for (const [id, row] of Object.entries(incoming || {})) {
    const key = row?.id || id;
    if (!key) continue;
    const prev = out[key];
    if (!prev) {
      out[key] = row?.id ? row : { ...row, id: key };
      added++;
      continue;
    }
    if (msgTime(row) > msgTime(prev)) {
      out[key] = row?.id ? row : { ...row, id: key };
      replacedNewer++;
    }
  }
  return { out, added, replacedNewer };
}

function asPostArray(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function mergePosts(currentRaw, incomingRaw) {
  const cur = asPostArray(currentRaw);
  const inc = asPostArray(incomingRaw);
  const byId = new Map(cur.map(p => [p.id, p]));
  let added = 0;
  let updated = 0;
  for (const p of inc) {
    if (!p?.id) continue;
    const prev = byId.get(p.id);
    if (!prev) {
      byId.set(p.id, p);
      added++;
      continue;
    }
    const tInc = new Date(p.updatedAt || p.createdAt || 0).getTime();
    const tPrev = new Date(prev.updatedAt || prev.createdAt || 0).getTime();
    if (tInc >= tPrev) {
      byId.set(p.id, { ...prev, ...p, comments: prev.comments?.length ? prev.comments : p.comments });
      updated++;
    }
  }
  const merged = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );
  return { merged, added, updated };
}

function mergeUserMaps(current, incoming) {
  const out = { ...(current || {}) };
  let added = 0;
  for (const [id, u] of Object.entries(incoming || {})) {
    if (!u?.id && !id) continue;
    const uid = u?.id || id;
    const prev = out[uid];
    if (!prev) {
      out[uid] = u;
      added++;
      continue;
    }
    const tInc = new Date(u.updatedAt || 0).getTime();
    const tPrev = new Date(prev.updatedAt || 0).getTime();
    out[uid] = tInc >= tPrev ? { ...prev, ...u } : { ...u, ...prev };
  }
  return { out, added };
}

async function main() {
  const mergeSrc = process.env.MERGE_SRC?.trim();
  if (!mergeSrc) {
    console.error("عيّن MERGE_SRC=مسار مجلد مستخرج من النسخة الاحتياطية");
    process.exit(1);
  }

  const dbDir = await resolveDbDir(mergeSrc);
  if (!dbDir) {
    console.error("MERGE_SRC لا يحوي db/messages.json ولا messages.json —", mergeSrc);
    process.exit(1);
  }

  const targetDb = path.join(DATA_ROOT, "db");
  await fs.mkdir(targetDb, { recursive: true });

  console.log("[merge-db] DATA_ROOT=", DATA_ROOT);
  console.log("[merge-db] MERGE_SRC db →", dbDir);

  /* messages.json */
  const tp = path.join(targetDb, "messages.json");
  const mp = path.join(dbDir, "messages.json");
  const [curMsg, incMsg] = await Promise.all([readJson(tp, {}, { decrypt: true }), readJson(mp, {})]);
  const { out: nextMsg, added: msgAdded, replacedNewer: msgRepl } = mergeMessageMaps(curMsg, incMsg);
  await writeAtomic(tp, nextMsg);
  console.log(`[merge-db] messages: +${msgAdded} جديد، استبدال أحدث لـ ${msgRepl} ← الإجمالي ${Object.keys(nextMsg).length}`);

  /* posts.json */
  const postsPath = path.join(targetDb, "posts.json");
  const postsIncPath = path.join(dbDir, "posts.json");
  try {
    await fs.access(postsIncPath);
    const [curPosts, incPosts] = await Promise.all([
      readJson(postsPath, [], { decrypt: true }),
      readJson(postsIncPath, []),
    ]);
    const { merged, added, updated } = mergePosts(curPosts, incPosts);
    await writeAtomic(postsPath, merged);
    console.log(`[merge-db] posts: +${added} منشور، تحديث ${updated} ← الإجمالي ${merged.length}`);
  } catch {
    /* optional */
  }

  /* users.json — كائن key→user */
  try {
    const usersPath = path.join(targetDb, "users.json");
    const usersIncPath = path.join(dbDir, "users.json");
    await fs.access(usersIncPath);
    let curUsers = await readJson(usersPath, {}, { decrypt: true });
    let incUsers = await readJson(usersIncPath, {});
    if (Array.isArray(curUsers)) {
      curUsers = Object.fromEntries(curUsers.filter(u => u?.id).map(u => [u.id, u]));
    }
    if (Array.isArray(incUsers)) {
      incUsers = Object.fromEntries(incUsers.filter(u => u?.id).map(u => [u.id, u]));
    }
    const { out: mergedUsers, added } = mergeUserMaps(curUsers, incUsers);
    await writeAtomic(usersPath, mergedUsers);
    console.log(`[merge-db] users: +${added} ← الإجمالي ${Object.keys(mergedUsers).length}`);
  } catch {
    /* optional */
  }

  try {
    const followsPath = path.join(targetDb, "follows.json");
    const followsIncPath = path.join(dbDir, "follows.json");
    await fs.access(followsIncPath);
    const curFollows = await readJson(followsPath, [], { decrypt: true });
    const incFollows = await readJson(followsIncPath, []);
    const curArr = Array.isArray(curFollows) ? curFollows : [];
    const incArr = Array.isArray(incFollows) ? incFollows : [];
    const key = f => `${f.followerId}:${f.followeeId}`;
    const map = new Map(curArr.map(f => [key(f), f]));
    let fAdded = 0;
    for (const f of incArr) {
      if (!f?.followerId || !f?.followeeId) continue;
      const k = key(f);
      if (!map.has(k)) {
        map.set(k, f);
        fAdded++;
      }
    }
    await writeAtomic(followsPath, [...map.values()]);
    console.log(`[merge-db] follows: +${fAdded} ← الإجمالي ${map.size}`);
  } catch {
    /* optional */
  }

  console.log("[merge-db] تم دمج الطبقة من:", dbDir);
}

main().catch(e => {
  console.error("[merge-db] فشل", e);
  process.exit(1);
});
