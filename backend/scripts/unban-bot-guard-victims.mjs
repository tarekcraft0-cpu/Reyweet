#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_ROOT } from "../src/config.ts";
import { decodeStoredJson, encodeStoredJson } from "../src/lib/encryptedStorage.ts";

const BOT_REASON = /بوت|bot-guard|browser_signals|دخول آلي|session:|آلي أو بوت/i;
const file = path.join(DATA_ROOT, "moderation", "user_states.json");

const rawText = (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "").trim();
const db = decodeStoredJson(JSON.parse(rawText), file);
const users = db.users || {};

let restored = 0;
let bannedTotal = 0;
for (const [id, st] of Object.entries(users)) {
  if (!st || typeof st !== "object") continue;
  if (!["PERMANENTLY_BANNED", "BANNED", "TEMP_BANNED"].includes(st.accountStatus)) continue;
  bannedTotal++;
  const reason = String(st.banReason || "");
  const guideline = String(st.banGuideline || "");
  if (!BOT_REASON.test(reason) && !BOT_REASON.test(guideline)) {
    console.log("skip", id, st.accountStatus, reason.slice(0, 50));
    continue;
  }
  users[id] = {
    ...st,
    accountStatus: "ACTIVE",
    banReason: undefined,
    banGuideline: undefined,
    banExpiresAt: null,
    shadowBanned: false,
    restrictedUntil: undefined,
    updatedAt: Date.now(),
  };
  restored++;
  console.log("restored", id, reason.slice(0, 40));
}

if (restored > 0) {
  const payload = JSON.stringify(encodeStoredJson(file, { ...db, users }));
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, file);
}
console.log("done restored", restored, "bannedTotal", bannedTotal);
