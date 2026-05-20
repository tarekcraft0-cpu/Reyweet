/**
 * إصلاح chatId في messages.json لمحادثات DM — تشغيل مرة واحدة:
 * node backend/scripts/repair-dm-messages.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = process.env.DB_DIR || path.join(__dirname, "..", "..", "data");
const messagesPath = path.join(dbDir, "messages.json");

function dmChatId(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

async function main() {
  const raw = await fs.readFile(messagesPath, "utf8").catch(() => "{}");
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
  await fs.writeFile(messagesPath, JSON.stringify(map, null, 2), "utf8");
  console.log(`[repair-dm] updated ${fixed} message rows in ${messagesPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
