#!/usr/bin/env node
/**
 * إبطال جميع جلسات JWT — شغّله على السيرفر بعد اختراق بوتات تيليجرام.
 * DATA_ROOT=/var/lib/retweet node backend/scripts/revoke-all-sessions.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");

const raw = await fs.readFile(usersFile, "utf8");
const users = JSON.parse(raw);
let n = 0;
for (const u of Object.values(users)) {
  if (!u || typeof u !== "object") continue;
  const row = u;
  row.tokenVersion = (row.tokenVersion ?? 1) + 1;
  row.trustedDevices = [];
  n++;
}
await fs.writeFile(usersFile, JSON.stringify(users, null, 2), "utf8");
console.log(`Revoked sessions for ${n} users.`);
