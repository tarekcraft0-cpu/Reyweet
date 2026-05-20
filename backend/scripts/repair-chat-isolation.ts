/**
 * إصلاح messages.json + snapshots بعد عزل DM
 * npx tsx backend/scripts/repair-chat-isolation.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_ROOT, DB_DIR, SNAPSHOTS_DIR } from "../src/config.js";
import { scopeAppStateToOwner } from "../src/lib/scopeAppState.js";
import type { AppState } from "../../src/lib/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function dmChatId(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

async function repairMessagesJson(): Promise<number> {
  const messagesPath = path.join(DB_DIR, "messages.json");
  const raw = await fs.readFile(messagesPath, "utf8").catch(() => "{}");
  const map = JSON.parse(raw || "{}") as Record<
    string,
    { chatId?: string; senderId?: string; receiverId?: string | null }
  >;
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
  console.log(`[repair] messages.json: ${fixed} rows → canonical dm:* ids`);
  return fixed;
}

async function repairSnapshots(): Promise<number> {
  let count = 0;
  let files: string[];
  try {
    files = await fs.readdir(SNAPSHOTS_DIR);
  } catch {
    console.warn(`[repair] no snapshots dir: ${SNAPSHOTS_DIR}`);
    return 0;
  }
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const userId = name.replace(/\.json$/, "");
    const p = path.join(SNAPSHOTS_DIR, name);
    const raw = await fs.readFile(p, "utf8");
    const state = JSON.parse(raw) as AppState;
    const scoped = scopeAppStateToOwner(userId, {
      ...state,
      currentUserId: userId,
    });
    await fs.writeFile(p, JSON.stringify(scoped, null, 2), "utf8");
    count++;
  }
  console.log(`[repair] snapshots: re-scoped ${count} files in ${SNAPSHOTS_DIR}`);
  return count;
}

async function main() {
  console.log(`[repair] DATA_ROOT=${DATA_ROOT}`);
  await repairMessagesJson();
  await repairSnapshots();
  console.log("[repair] done");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
