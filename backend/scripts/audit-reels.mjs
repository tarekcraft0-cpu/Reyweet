#!/usr/bin/env node
/** عرض الريلز + أصحابها — للتدقيق على VPS */
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT, DB_DIR } from "../src/config.ts";
import { listUsers } from "../src/db/engine.ts";

const reelsFile = path.join(DB_DIR, "reels.json");
const postsFile = path.join(DB_DIR, "posts.json");

const raw = JSON.parse(await fs.readFile(reelsFile, "utf8").catch(() => "{}"));
const reels = typeof raw === "object" && raw && !Array.isArray(raw) ? Object.values(raw) : [];

const postsRaw = JSON.parse(await fs.readFile(postsFile, "utf8").catch(() => "{}"));
const postReels = Object.values(postsRaw || {}).filter(
  p => p && typeof p === "object" && p.type === "reel",
);

const users = await listUsers();
const byId = new Map(users.map(u => [u.id, u]));

console.log(`DATA_ROOT=${DATA_ROOT}`);
console.log(`reels.json: ${reels.length}, posts reel: ${postReels.length}\n`);

const rows = [];
for (const r of reels) {
  if (!r || typeof r !== "object") continue;
  const u = byId.get(r.userId);
  rows.push({
    id: r.id,
    userId: r.userId,
    username: u?.username || "?",
    video: r.videoUrl || "",
    caption: (r.caption || "").slice(0, 40),
  });
}
for (const p of postReels) {
  if (rows.some(x => x.id === p.id)) continue;
  const u = byId.get(p.userId);
  rows.push({
    id: p.id,
    userId: p.userId,
    username: u?.username || "?",
    video: p.video || "",
    caption: (p.text || "").slice(0, 40),
    fromPostsOnly: true,
  });
}

rows.sort((a, b) => a.username.localeCompare(b.username));
for (const r of rows) {
  console.log(`${r.username}\t${r.userId}\t${r.id}\t${r.video}\t${r.caption}`);
}
