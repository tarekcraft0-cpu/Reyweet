#!/usr/bin/env node
/**
 * استعادة posts / messages / chats / users من كل اللقطات + messages.json
 * ثم إعادة بناء snapshots لكل مستخدم بحالة مكتملة.
 *
 * Usage: node backend/scripts/restore-full-database.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const DB_DIR = path.join(DATA_ROOT, "db");
const SNAPSHOTS_DIR = path.join(DATA_ROOT, "snapshots");

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

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.restore-${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function rowFromPost(p) {
  return {
    id: p.id,
    userId: p.userId,
    type: p.type || "post",
    text: p.text || "",
    image: p.image,
    video: p.video,
    likes: Array.isArray(p.likes) ? p.likes : [],
    reposts: Array.isArray(p.reposts) ? p.reposts : [],
    createdAt: new Date(p.createdAt || Date.now()).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function messageRowToClient(row) {
  const ex = row.extrasJson ?? {};
  return {
    id: row.id,
    senderId: row.senderId,
    type: row.type,
    content: row.content,
    createdAt: new Date(row.createdAt).getTime(),
    durationSec: typeof ex.durationSec === "number" ? ex.durationSec : undefined,
    shareText: typeof ex.shareText === "string" ? ex.shareText : undefined,
    viewOnce: ex.viewOnce === true,
    viewOnceOpenedByUserIds: Array.isArray(ex.viewOnceOpenedByUserIds)
      ? ex.viewOnceOpenedByUserIds
      : undefined,
    replyTo: ex.replyTo,
    parentMessageId: typeof ex.parentMessageId === "string" ? ex.parentMessageId : undefined,
    status:
      ex.status === "delivered" || ex.status === "read" || ex.status === "sent"
        ? ex.status
        : undefined,
    reactions: ex.reactions,
    forwardedFrom: ex.forwardedFrom,
  };
}

function mergeMessages(local, remote) {
  const byId = new Map();
  for (const m of local || []) byId.set(m.id, m);
  for (const m of remote || []) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function mergeChat(prev, next) {
  if (!prev) return next;
  return {
    ...prev,
    ...next,
    members:
      next.isGroup || next.isChannel
        ? [...new Set([...(prev.members || []), ...(next.members || [])])]
        : next.members?.length >= (prev.members || []).length
          ? next.members
          : prev.members,
    admins: [...new Set([...(prev.admins || []), ...(next.admins || [])])],
    messages: mergeMessages(prev.messages, next.messages),
    lastOpenAtByUser: { ...(prev.lastOpenAtByUser || {}), ...(next.lastOpenAtByUser || {}) },
    lastReadMessageIdByUser: {
      ...(prev.lastReadMessageIdByUser || {}),
      ...(next.lastReadMessageIdByUser || {}),
    },
  };
}

function inferDmMembers(userId, rows) {
  const peerCounts = new Map();
  for (const row of rows) {
    if (row.senderId === userId && row.receiverId) {
      peerCounts.set(row.receiverId, (peerCounts.get(row.receiverId) ?? 0) + 1);
    } else if (row.receiverId === userId && row.senderId !== userId) {
      peerCounts.set(row.senderId, (peerCounts.get(row.senderId) ?? 0) + 1);
    }
  }
  let bestPeer = null;
  let best = 0;
  for (const [peer, n] of peerCounts) {
    if (n > best) {
      best = n;
      bestPeer = peer;
    }
  }
  if (!bestPeer) return null;
  return [userId, bestPeer];
}

function draftChatFromRows(chatId, userId, rows, catalogChat) {
  if (catalogChat) {
    return mergeChat(catalogChat, {
      ...catalogChat,
      messages: rows.map(messageRowToClient),
    });
  }
  const dmMembers = chatId.startsWith("dm:") ? inferDmMembers(userId, rows) : null;
  if (dmMembers) {
    return {
      id: chatId,
      isGroup: false,
      isChannel: false,
      members: dmMembers,
      admins: [],
      messages: rows.map(messageRowToClient),
      request: false,
      lastOpenAtByUser: {},
      lastReadMessageIdByUser: {},
    };
  }
  const senders = [...new Set(rows.map(r => r.senderId).filter(Boolean))];
  const members = [...new Set([userId, ...senders])];
  return {
    id: chatId,
    isGroup: !chatId.startsWith("channel_"),
    isChannel: chatId.startsWith("channel_"),
    name: chatId.startsWith("channel_") ? "قناة" : "مجموعة",
    members,
    admins: senders.slice(0, 1),
    messages: rows.map(messageRowToClient),
    request: false,
    lastOpenAtByUser: {},
    lastReadMessageIdByUser: {},
  };
}

async function main() {
  console.log("[restore] DATA_ROOT =", DATA_ROOT);

  const postsPath = path.join(DB_DIR, "posts.json");
  const messagesPath = path.join(DB_DIR, "messages.json");
  const usersPath = path.join(DB_DIR, "users.json");
  const chatsCatalogPath = path.join(DB_DIR, "chats.json");

  let postsRaw = await readJson(postsPath, []);
  const postsList = Array.isArray(postsRaw) ? [...postsRaw] : Object.values(postsRaw);
  const postsById = new Map(postsList.map(p => [p.id, p]));

  const messagesMap = await readJson(messagesPath, {});
  const messageRows = Object.values(messagesMap);

  let usersRaw = await readJson(usersPath, []);
  const usersList = Array.isArray(usersRaw) ? [...usersRaw] : Object.values(usersRaw);
  const usersById = new Map(usersList.map(u => [u.id, u]));

  const chatCatalog = new Map();
  const snapFiles = (await fs.readdir(SNAPSHOTS_DIR)).filter(f => f.endsWith(".json"));

  let restoredPosts = 0;
  for (const name of snapFiles) {
    const snap = await readJson(path.join(SNAPSHOTS_DIR, name), null);
    if (!snap) continue;
    for (const p of snap.posts || []) {
      if (!p?.id || !p?.userId || postsById.has(p.id)) continue;
      postsById.set(p.id, rowFromPost(p));
      restoredPosts++;
    }
    for (const c of snap.chats || []) {
      if (!c?.id) continue;
      const prev = chatCatalog.get(c.id);
      chatCatalog.set(c.id, prev ? mergeChat(prev, { ...c, messages: c.messages || [] }) : { ...c });
    }
    for (const u of snap.users || []) {
      if (!u?.id) continue;
      const prev = usersById.get(u.id);
      if (!prev) {
        usersById.set(u.id, { ...u, password: "" });
        continue;
      }
      usersById.set(u.id, {
        ...prev,
        username: prev.username || u.username,
        displayName: prev.displayName || u.displayName,
        bio: prev.bio || u.bio,
        avatar: prev.avatar || u.avatar,
      });
    }
  }

  const mergedPosts = [...postsById.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  await writeJsonAtomic(postsPath, mergedPosts);
  console.log(`[restore] posts: ${postsList.length} → ${mergedPosts.length} (+${restoredPosts})`);

  await writeJsonAtomic(chatsCatalogPath, Object.fromEntries(chatCatalog));
  console.log(`[restore] chat catalog: ${chatCatalog.size} محادثة`);

  const messagesByUser = new Map();
  for (const row of messageRows) {
    const ids = new Set();
    if (row.senderId) ids.add(row.senderId);
    if (row.receiverId) ids.add(row.receiverId);
    for (const uid of ids) {
      const list = messagesByUser.get(uid) ?? [];
      list.push(row);
      messagesByUser.set(uid, list);
    }
  }

  let rebuiltSnaps = 0;
  for (const name of snapFiles) {
    const userId = name.replace(/\.json$/, "");
    const snap = await readJson(path.join(SNAPSHOTS_DIR, name), null);
    if (!snap) continue;

    const userRows = messagesByUser.get(userId) ?? [];
    const byChat = new Map();
    for (const row of userRows) {
      if (!row.chatId) continue;
      const list = byChat.get(row.chatId) ?? [];
      list.push(row);
      byChat.set(row.chatId, list);
    }

    const chatsById = new Map((snap.chats || []).map(c => [c.id, { ...c, messages: c.messages || [] }]));
    for (const c of snap.chats || []) {
      if (c?.id) chatsById.set(c.id, mergeChat(chatsById.get(c.id), c));
    }

    for (const [chatId, rows] of byChat) {
      const catalogChat = chatCatalog.get(chatId);
      const draft = draftChatFromRows(chatId, userId, rows, catalogChat);
      const prev = chatsById.get(chatId);
      chatsById.set(chatId, prev ? mergeChat(prev, draft) : draft);
    }

    const postsByIdSnap = new Map((snap.posts || []).map(p => [p.id, p]));
    for (const p of mergedPosts) postsByIdSnap.set(p.id, p);

    const usersByIdSnap = new Map((snap.users || []).map(u => [u.id, u]));
    for (const u of usersById.values()) {
      const prev = usersByIdSnap.get(u.id);
      usersByIdSnap.set(u.id, prev ? { ...prev, ...u, password: "" } : { ...u, password: "" });
    }

    const nextSnap = {
      ...snap,
      currentUserId: snap.currentUserId || userId,
      posts: [...postsByIdSnap.values()].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      ),
      users: [...usersByIdSnap.values()],
      chats: [...chatsById.values()].map(c => ({
        ...c,
        messages: mergeMessages(c.messages, []),
      })),
    };

    const tmp = path.join(SNAPSHOTS_DIR, `${name}.restore-${Date.now()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(nextSnap, null, 2), "utf8");
    await fs.rename(tmp, path.join(SNAPSHOTS_DIR, name));
    rebuiltSnaps++;
  }

  console.log(`[restore] أُعيد بناء ${rebuiltSnaps} لقطة مستخدم`);
  console.log("[restore] تم — أعد تشغيل الخادم وحدّث الصفحة (Ctrl+Shift+R)");
}

main().catch(err => {
  console.error("[restore] failed", err);
  process.exit(1);
});
