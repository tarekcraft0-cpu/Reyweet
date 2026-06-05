#!/usr/bin/env node
/**
 * يتحقق أن ملفات JSON تحت DATA_ROOT مشفّرة.
 *   DATA_ROOT=/var/lib/retweet node backend/scripts/verify-encryption.mjs
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";
const root = process.env.DATA_ROOT;

async function walk(dir, out = []) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "media" || ent.name === "uploads" || ent.name === "backups") continue;
      await walk(full, out);
      continue;
    }
    if (ent.name.endsWith(".json") && !ent.name.includes(".tmp")) out.push(full);
  }
  return out;
}

const files = await walk(root);
let plain = 0;
let enc = 0;
for (const f of files) {
  try {
    const raw = (await fs.readFile(f, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    if (parsed?._enc === "retweet-enc-v1") enc += 1;
    else plain += 1;
  } catch {
    /* skip */
  }
}
console.log(JSON.stringify({ dataRoot: root, encrypted: enc, plain, total: enc + plain }, null, 2));
process.exit(plain > 0 ? 1 : 0);
