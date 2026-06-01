#!/usr/bin/env node
/**
 * حذف حسابات باليوزرنيم من قاعدة الإنتاج (VPS).
 * Usage: DATA_ROOT=/var/lib/retweet node scripts/delete-users-by-username.mjs user lina_art sata_q
 */
import { deleteUserAccount } from "../src/lib/deleteUserAccount.ts";
import { listUsers } from "../src/db/engine.ts";

const names = process.argv
  .slice(2)
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

if (names.length === 0) {
  console.error("Usage: node scripts/delete-users-by-username.mjs <username> ...");
  process.exit(1);
}

const want = new Set(names);
const users = await listUsers();
const targets = users.filter(u => want.has(String(u.username || "").toLowerCase()));

if (targets.length === 0) {
  console.log("No matching users found for:", [...want].join(", "));
  process.exit(0);
}

console.log("Will delete:");
for (const u of targets) {
  console.log(`  ${u.id}\t@${u.username}\t${u.email || ""}`);
}

for (const u of targets) {
  const result = await deleteUserAccount(u.id);
  if (result.ok) {
    console.log(`✓ deleted @${u.username} (${u.id})`);
  } else {
    console.error(`✗ @${u.username}: ${result.error}`);
  }
}

const remaining = (await listUsers()).filter(u =>
  want.has(String(u.username || "").toLowerCase()),
);
if (remaining.length === 0) {
  console.log("\nDone — no matching usernames left.");
} else {
  console.error("\nSome accounts still exist:", remaining.map(u => u.username).join(", "));
  process.exit(1);
}
