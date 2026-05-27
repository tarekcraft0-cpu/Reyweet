#!/usr/bin/env node
/**
 * توحيد chatId في messages.json إلى dm:A:B + إعادة بناء snapshots
 * DATA_ROOT=/var/lib/retweet node backend/scripts/repair-dm-message-ids.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const MESSAGES_FILE = path.join(DATA_ROOT, "db", "messages.json");

function dmChatId(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

async function main() {
  const raw = await fs.readFile(MESSAGES_FILE, "utf8").catch(() => "{}");
  const map = JSON.parse(raw || "{}");
  let fixed = 0;
  for (const row of Object.values(map)) {
    if (!row?.receiverId || !row?.senderId) continue;
    const canonical = dmChatId(row.senderId, row.receiverId);
    if (row.chatId !== canonical) {
      row.chatId = canonical;
      fixed++;
    }
  }
  const tmp = `${MESSAGES_FILE}.repair-${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
  await fs.rename(tmp, MESSAGES_FILE);
  console.log(`[repair-dm] messages.json: ${fixed} rows → canonical dm:*`);

  const restore = path.join(__dirname, "restore-full-database.mjs");
  execSync(`node "${restore}"`, {
    stdio: "inherit",
    env: { ...process.env, DATA_ROOT },
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
