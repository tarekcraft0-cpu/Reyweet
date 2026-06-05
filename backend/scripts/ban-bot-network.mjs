#!/usr/bin/env node
/**
 * حظر دائم لشبكة بوت: حسابات + أجهزة مرتبطة + عناوين IP.
 *
 *   DATA_ROOT=/var/lib/retweet node backend/scripts/ban-bot-network.mjs 217 666
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const usernames = process.argv
  .slice(2)
  .map(s => s.trim().replace(/^@/, ""))
  .filter(Boolean);

if (!usernames.length) {
  console.error("Usage: node backend/scripts/ban-bot-network.mjs <username> [username...]");
  process.exit(1);
}

process.env.DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");

async function load(modulePath) {
  return import(pathToFileURL(modulePath).href);
}

const engine = await load(path.join(backendRoot, "src/db/engine.ts"));
const ban = await load(path.join(backendRoot, "src/moderation/banEngine.ts"));
const modStore = await load(path.join(backendRoot, "src/db/moderationStore.ts"));
const ipBlock = await load(path.join(backendRoot, "src/lib/ipBlocklist.ts"));
const emailBlock = await load(path.join(backendRoot, "src/lib/emailBlocklist.ts"));
const purge = await load(path.join(backendRoot, "src/lib/purgeUserPublicContent.ts"));

const MOD_ACTOR = "admin:ban-bot-network";
const BAN_REASON = "بوت — حظر دائم من الإدارة";
const BAN_GUIDELINE = "نشاط آلي / شبكة حسابات مرتبطة";

const seedUsers = [];
for (const un of usernames) {
  const row = await engine.findUserByUsername(un);
  if (!row) {
    console.warn("NOT FOUND:", un);
    continue;
  }
  seedUsers.push(row);
}

if (!seedUsers.length) {
  console.error("No seed users found");
  process.exit(1);
}

const linkedIds = new Set(seedUsers.map(u => u.id));
const fingerprints = new Set();
const ips = new Set();

async function absorbUserMeta(userId) {
  const state = await modStore.getUserModerationState(userId);
  for (const fp of state.deviceFingerprints ?? []) {
    if (fp?.trim()) fingerprints.add(fp.trim());
  }
  for (const ip of state.ipAddresses ?? []) {
    if (ip?.trim()) ips.add(ip.trim());
  }
  const user = await engine.getUserById(userId);
  for (const d of user?.trustedDevices ?? []) {
    if (d?.fingerprint?.trim()) fingerprints.add(d.fingerprint.trim());
  }
}

for (const u of seedUsers) {
  await absorbUserMeta(u.id);
}

async function expandByTrustedDevices() {
  const allUsers = await engine.listUsers();
  let found = false;
  for (const u of allUsers) {
    if (linkedIds.has(u.id)) continue;
    for (const d of u.trustedDevices ?? []) {
      const fp = d?.fingerprint?.trim();
      if (fp && fingerprints.has(fp)) {
        linkedIds.add(u.id);
        found = true;
        await absorbUserMeta(u.id);
        break;
      }
    }
  }
  return found;
}

let expanded = true;
while (expanded) {
  expanded = false;
  for (const fp of [...fingerprints]) {
    for (const uid of await modStore.findUsersByDevice(fp)) {
      if (!linkedIds.has(uid)) {
        linkedIds.add(uid);
        expanded = true;
        await absorbUserMeta(uid);
      }
    }
  }
  for (const ip of [...ips]) {
    for (const uid of await modStore.findUsersByIp(ip)) {
      if (!linkedIds.has(uid)) {
        linkedIds.add(uid);
        expanded = true;
        await absorbUserMeta(uid);
      }
    }
  }
  if (await expandByTrustedDevices()) expanded = true;
}

console.log("=== شبكة البوت ===");
console.log("seed:", seedUsers.map(u => `@${u.username} (${u.id})`).join(", "));
console.log("linked accounts:", linkedIds.size);
console.log("fingerprints:", fingerprints.size);
console.log("ips:", [...ips]);

const banned = [];
for (const userId of linkedIds) {
  const user = await engine.getUserById(userId);
  if (!user) continue;
  const before = await modStore.getUserModerationState(userId);
  if (before.accountStatus === "PERMANENTLY_BANNED") {
    console.log("already banned:", `@${user.username}`, userId);
    if (user.email?.trim()) {
      await emailBlock.blockEmailPermanently(user.email, BAN_REASON, [userId]);
      console.log("EMAIL_BLOCKED:", user.email);
    }
    try {
      await purge.purgeUserPublicContent(userId);
      console.log("CONTENT_PURGED:", `@${user.username}`, userId);
    } catch (e) {
      console.warn("PURGE_FAILED:", userId, e);
    }
    banned.push({ id: userId, username: user.username, status: "already" });
    continue;
  }
  await ban.applyModerationAction(userId, MOD_ACTOR, "perm_ban", {
    reason: BAN_REASON,
    guideline: BAN_GUIDELINE,
  });
  if (user.email?.trim()) {
    await emailBlock.blockEmailPermanently(user.email, BAN_REASON, [userId]);
    console.log("EMAIL_BLOCKED:", user.email);
  }
  try {
    await purge.purgeUserPublicContent(userId);
    console.log("CONTENT_PURGED:", `@${user.username}`, userId);
  } catch (e) {
    console.warn("PURGE_FAILED:", userId, e);
  }
  const tokenSec = await load(path.join(backendRoot, "src/lib/tokenSecurity.ts"));
  await tokenSec.invalidateAllUserTokens(userId);
  const { revokeAllTrustedDevices } = await load(path.join(backendRoot, "src/lib/loginSecurity.ts"));
  await revokeAllTrustedDevices(userId);
  console.log("PERM_BANNED:", `@${user.username}`, userId, user.email || "");
  banned.push({ id: userId, username: user.username, email: user.email, status: "banned" });
}

const linkedList = [...linkedIds];
for (const ip of ips) {
  await ipBlock.blockIpPermanently(ip, BAN_REASON, linkedList);
  console.log("IP_BLOCKED:", ip);
}

await ipBlock.ensureIpBlocklistLoaded();

console.log("\n=== ملخص ===");
console.log(JSON.stringify({ bannedCount: banned.length, ipsBlocked: ips.size, banned }, null, 2));
