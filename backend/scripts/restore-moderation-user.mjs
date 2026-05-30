#!/usr/bin/env node
/**
 * استعادة حساب معطّل من سطر الأوامر (سيرفر الإنتاج).
 *
 *   cd /opt/retweet-api && DATA_ROOT=/var/lib/retweet node backend/scripts/restore-moderation-user.mjs nw3
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const username = process.argv[2]?.trim().replace(/^@/, "");
const noteIdx = process.argv.indexOf("--note");
const note = noteIdx >= 0 ? String(process.argv[noteIdx + 1] || "") : "استعادة يدوية — مراجعة دعم";

if (!username) {
  console.error("Usage: node backend/scripts/restore-moderation-user.mjs <username> [--note text]");
  process.exit(1);
}

process.env.DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(modulePath) {
  return import(pathToFileURL(modulePath).href);
}

const engine = await load(path.join(backendRoot, "src/db/engine.ts"));
const ban = await load(path.join(backendRoot, "src/moderation/banEngine.ts"));
const modStore = await load(path.join(backendRoot, "src/db/moderationStore.ts"));

const row = await engine.findUserByUsername(username);
if (!row) {
  console.error(`User not found: @${username}`);
  process.exit(1);
}

const before = await modStore.getUserModerationState(row.id);
console.log(`@${row.username} (${row.id}) status=${before.accountStatus}`);

if (!ban.isBannedStatus(before.accountStatus) && before.accountStatus !== "RESTRICTED") {
  console.log("Account is not banned — nothing to restore.");
  process.exit(0);
}

const wasPermanent = before.accountStatus === "PERMANENTLY_BANNED";
await ban.restoreAccount(row.id, "script:restore-moderation-user", {
  wrongfulPermanentRestore: wasPermanent,
  note,
});

const after = await modStore.getUserModerationState(row.id);
console.log(`Restored → status=${after.accountStatus}`);
if (row.email) console.log(`Restore email queued for ${row.email}`);
