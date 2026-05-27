#!/usr/bin/env node
/**
 * يستعيد المنشورات الموجودة في snapshots/ وغير موجودة في db/posts.json
 * Usage: node backend/scripts/restore-posts-from-snapshots.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const POSTS_FILE = path.join(DATA_ROOT, "db", "posts.json");
const SNAPSHOTS_DIR = path.join(DATA_ROOT, "snapshots");

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

async function main() {
  const raw = await fs.readFile(POSTS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? [...parsed] : Object.values(parsed);
  const byId = new Map(list.map(p => [p.id, p]));

  const files = await fs.readdir(SNAPSHOTS_DIR);
  let restored = 0;
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    try {
      const snap = JSON.parse(await fs.readFile(path.join(SNAPSHOTS_DIR, name), "utf8"));
      for (const p of snap.posts || []) {
        if (!p?.id || !p?.userId || byId.has(p.id)) continue;
        byId.set(p.id, rowFromPost(p));
        restored++;
        console.log(`  + ${p.id} (${p.userId}) from ${name}`);
      }
    } catch {
      /* skip corrupt snapshot */
    }
  }

  const merged = [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const tmp = `${POSTS_FILE}.restore-${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, POSTS_FILE);
  console.log(`\n[restore] كان ${list.length} منشور → الآن ${merged.length} (+${restored} مستعاد)`);
  console.log(`[restore] الملف: ${POSTS_FILE}`);
}

main().catch(err => {
  console.error("[restore] failed", err);
  process.exit(1);
});
