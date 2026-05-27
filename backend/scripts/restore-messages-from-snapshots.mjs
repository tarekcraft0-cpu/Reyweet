#!/usr/bin/env node
/**
 * استعادة رسائل DM من snapshots/*.json إلى db/messages.json
 * يفحص أيضاً مجلدات snapshots في أرشيفات مستخرجة.
 *
 *   DATA_ROOT=D:/RetweetSocial node backend/scripts/restore-messages-from-snapshots.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const MESSAGES_FILE = path.join(DATA_ROOT, "db", "messages.json");

function dmChatId(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeAtomic(file, data) {
  const tmp = `${file}.snap-restore-${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function collectSnapshotDirs() {
  const dirs = new Set([path.join(DATA_ROOT, "snapshots")]);
  const extractRoot = path.join(root, "backups-local", ".merge-extract");
  try {
    for (const name of await fs.readdir(extractRoot)) {
      const p = path.join(extractRoot, name, "RetweetSocial", "snapshots");
      try {
        await fs.access(p);
        dirs.add(p);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  const cmp = path.join(root, "backups-local", ".cmp-may25", "RetweetSocial", "snapshots");
  try {
    await fs.access(cmp);
    dirs.add(cmp);
  } catch {
    /* skip */
  }
  return [...dirs];
}

function messageToRow(chatId, msg, ownerId) {
  const members = chatId.startsWith("dm:") ? chatId.slice(3).split(":") : [];
  const peer = members.find(id => id !== msg.senderId && id !== ownerId) ?? null;
  const receiverId =
    peer && msg.senderId === ownerId
      ? peer
      : peer && msg.senderId !== ownerId
        ? ownerId
        : members.find(id => id !== msg.senderId) ?? null;

  const createdAt = new Date(msg.createdAt || Date.now()).toISOString();
  const extras = {};
  if (msg.durationSec != null) extras.durationSec = msg.durationSec;
  if (msg.shareText) extras.shareText = msg.shareText;
  if (msg.viewOnce) extras.viewOnce = true;
  if (msg.viewOnceOpenedByUserIds) extras.viewOnceOpenedByUserIds = msg.viewOnceOpenedByUserIds;
  if (msg.replyTo) extras.replyTo = msg.replyTo;
  if (msg.parentMessageId) extras.parentMessageId = msg.parentMessageId;
  if (msg.status) extras.status = msg.status;
  if (msg.reactions) extras.reactions = msg.reactions;
  if (msg.forwardedFrom) extras.forwardedFrom = msg.forwardedFrom;

  return {
    id: msg.id,
    chatId: chatId.startsWith("dm:") ? chatId : chatId,
    senderId: msg.senderId,
    receiverId: receiverId || null,
    type: msg.type || "text",
    content: msg.content ?? "",
    createdAt,
    extrasJson: Object.keys(extras).length ? extras : undefined,
  };
}

async function main() {
  const map = await readJson(MESSAGES_FILE, {});
  const before = Object.keys(map).length;
  let added = 0;

  const dirs = await collectSnapshotDirs();
  console.log("[snap-restore] snapshot dirs:", dirs.length);

  for (const dir of dirs) {
    let files;
    try {
      files = (await fs.readdir(dir)).filter(f => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const name of files) {
      const ownerId = name.replace(/\.json$/, "");
      const snap = await readJson(path.join(dir, name), null);
      if (!snap?.chats?.length) continue;
      for (const chat of snap.chats) {
        if (!chat?.id || chat.isChannel) continue;
        const msgs = chat.messages || [];
        if (!msgs.length) continue;
        let chatId = chat.id;
        if (!chat.isGroup && chat.members?.length === 2) {
          chatId = dmChatId(chat.members[0], chat.members[1]);
        }
        for (const msg of msgs) {
          if (!msg?.id || !msg?.senderId) continue;
          if (map[msg.id]) continue;
          map[msg.id] = messageToRow(chatId, msg, ownerId);
          added++;
        }
      }
    }
  }

  await writeAtomic(MESSAGES_FILE, map);
  console.log(`[snap-restore] messages: ${before} → ${Object.keys(map).length} (+${added})`);

  if (added > 0) {
    const restore = path.join(__dirname, "restore-full-database.mjs");
    console.log("[snap-restore] rebuild snapshots…");
    const { execSync } = await import("node:child_process");
    execSync(`node "${restore}"`, {
      stdio: "inherit",
      env: { ...process.env, DATA_ROOT },
    });
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
