#!/usr/bin/env node
/** إزالة hiddenMessageIdsByUser الفاسدة من كل snapshots */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const SNAPSHOTS = path.join(DATA_ROOT, "snapshots");

function sanitizeChat(chat, ownerId) {
  const msgs = chat.messages || [];
  const hidden = chat.hiddenMessageIdsByUser?.[ownerId];
  if (!hidden?.length || msgs.length === 0) return { chat, fixed: false };
  const msgIds = new Set(msgs.map(m => m.id));
  const validHidden = hidden.filter(id => msgIds.has(id));
  if (validHidden.length < Math.max(5, Math.ceil(msgs.length * 0.9))) {
    return { chat, fixed: false };
  }
  const rest = { ...(chat.hiddenMessageIdsByUser || {}) };
  delete rest[ownerId];
  return {
    chat: {
      ...chat,
      hiddenMessageIdsByUser: Object.keys(rest).length ? rest : undefined,
    },
    fixed: true,
  };
}

async function main() {
  let files;
  try {
    files = (await fs.readdir(SNAPSHOTS)).filter(f => f.endsWith(".json"));
  } catch {
    console.log("[fix-hidden] no snapshots");
    return;
  }
  let fixedChats = 0;
  for (const name of files) {
    const ownerId = name.replace(/\.json$/, "");
    const p = path.join(SNAPSHOTS, name);
    const state = JSON.parse(await fs.readFile(p, "utf8"));
    let changed = false;
    const chats = (state.chats || []).map(c => {
      const { chat, fixed } = sanitizeChat(c, ownerId);
      if (fixed) {
        fixedChats++;
        changed = true;
      }
      return chat;
    });
    if (changed) {
      await fs.writeFile(p, JSON.stringify({ ...state, chats }, null, 2), "utf8");
    }
  }
  console.log(`[fix-hidden] repaired ${fixedChats} chats in ${files.length} snapshots`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
