#!/usr/bin/env node
/**
 * إصلاح ملفات db المشفّرة بطبقات متراكمة — يعيد حفظها بطبقة واحدة.
 * Usage: CONTABO_SSH_PASSWORD=... node scripts/repair-double-encryption.mjs
 */
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASS = process.env.CONTABO_SSH_PASSWORD || process.argv[2] || "";
if (!PASS) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

const remoteRepair = `
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

const DB = "/var/lib/retweet/db";
const KEY = process.env.DATA_ENCRYPTION_KEY?.trim();
if (!KEY || KEY.length < 16) {
  console.error("DATA_ENCRYPTION_KEY missing");
  process.exit(1);
}
const derived = crypto.scryptSync(KEY, "retweet-data-at-rest-v1", 32);

function isEnc(raw) {
  return raw && typeof raw === "object" && raw._enc === "retweet-enc-v1";
}

function decryptOnce(raw) {
  try {
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const data = Buffer.from(raw.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", derived, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } catch {
    return null;
  }
}

function peel(raw, max = 20000) {
  let cur = raw;
  let layers = 0;
  while (isEnc(cur) && layers < max) {
    const dec = decryptOnce(cur);
    if (dec === null) break;
    cur = dec;
    layers++;
  }
  return { cur, layers, stillEnc: isEnc(cur) };
}

function encryptOnce(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derived, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { _enc: "retweet-enc-v1", iv: iv.toString("base64"), tag: tag.toString("base64"), data: enc.toString("base64") };
}

const files = fs.readdirSync(DB).filter(f => f.endsWith(".json") && !f.includes(".tmp"));
let fixed = 0;
let skipped = 0;
const report = [];

for (const name of files) {
  const full = path.join(DB, name);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(full, "utf8").replace(/^\\uFEFF/, "").trim());
  } catch (e) {
    report.push({ name, error: String(e) });
    continue;
  }
  if (!isEnc(raw)) {
    skipped++;
    continue;
  }
  const { cur, layers, stillEnc } = peel(raw);
  if (stillEnc) {
    report.push({ name, error: "still encrypted after peel", layers });
    continue;
  }
  const payload = JSON.stringify(encryptOnce(cur));
  const tmp = full + "." + randomUUID() + ".repair.tmp";
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, full);
  fixed++;
  const count = Array.isArray(cur) ? cur.length : Object.keys(cur || {}).length;
  report.push({ name, layers, count, ok: true });
}

console.log(JSON.stringify({ fixed, skipped, report }, null, 2));
`;

const b64 = Buffer.from(remoteRepair, "utf8").toString("base64");

const script = `
set -e
pm2 stop retweet-api || true
echo ${b64} | base64 -d > /tmp/repair-double-enc.mjs
set -a
source /opt/retweet/app/.env
set +a
cd /opt/retweet/app && node /tmp/repair-double-enc.mjs
pm2 start retweet-api || pm2 restart retweet-api
sleep 3
curl -sS http://127.0.0.1:3000/health
`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(script, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      stream.on("data", d => process.stdout.write(d));
      stream.stderr.on("data", d => process.stderr.write(d));
      stream.on("close", code => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .on("error", e => {
    console.error("SSH failed:", e.message);
    process.exit(1);
  })
  .connect({ host: HOST, port: 22, username: "root", password: PASS, readyTimeout: 120000 });
