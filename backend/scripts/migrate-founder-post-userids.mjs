#!/usr/bin/env node
/**
 * ينقل منشورات u_t_account إلى u_founder_tareqf في posts.json على الخادم.
 * Usage (on VPS): node backend/scripts/migrate-founder-post-userids.mjs
 * Or locally with DATA_ROOT:
 *   DATA_ROOT=/var/lib/retweet node backend/scripts/migrate-founder-post-userids.mjs
 */
import fs from "fs";
import path from "path";

const LEGACY = "u_t_account";
const FOUNDER = "u_founder_tareqf";
const DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";
const POSTS_FILE = path.join(DATA_ROOT, "db", "posts.json");

function main() {
  if (!fs.existsSync(POSTS_FILE)) {
    console.error("posts.json not found:", POSTS_FILE);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
  const map = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  let moved = 0;
  for (const [id, row] of Object.entries(map)) {
    if (!row || row.userId !== LEGACY) continue;
    map[id] = { ...row, userId: FOUNDER, updatedAt: new Date().toISOString() };
    moved++;
  }
  if (moved === 0) {
    console.log("No legacy founder posts to migrate.");
    return;
  }
  const backup = POSTS_FILE + `.bak-founder-migrate-${Date.now()}`;
  fs.copyFileSync(POSTS_FILE, backup);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(map, null, 2));
  console.log(`Migrated ${moved} posts from ${LEGACY} -> ${FOUNDER}. Backup: ${backup}`);
}

main();
