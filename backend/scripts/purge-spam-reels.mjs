#!/usr/bin/env node
/**
 * حذف ريلز وهمية/تالفة: عينات Google، حسابات demo محذوفة، ملفات فيديو مفقودة.
 * Usage: DATA_ROOT=/var/lib/retweet npx tsx scripts/purge-spam-reels.mjs [--dry-run]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT, DB_DIR } from "../src/config.ts";
import { deletePost, listPosts, listUsers } from "../src/db/engine.ts";
import { deleteReelRow } from "../src/db/reels.ts";
import { deleteReelFiles } from "../src/lib/reelsService.ts";
import { deleteUserAccount } from "../src/lib/deleteUserAccount.ts";

const dryRun = process.argv.includes("--dry-run");

const REMOVED_USER_IDS = new Set(["u_omar", "u_lina", "u_sara"]);

const SAMPLE_VIDEO_RE =
  /commondatastorage\.googleapis\.com\/gtv-videos-bucket\/sample/i;

function resolveVideoPath(videoUrl) {
  const v = String(videoUrl || "").trim();
  if (!v || v.startsWith("http")) return null;
  const rel = v.replace(/^\//, "");
  return path.join(DATA_ROOT, rel);
}

async function fileMissing(videoUrl) {
  const abs = resolveVideoPath(videoUrl);
  if (!abs) return false;
  try {
    await fs.access(abs);
    return false;
  } catch {
    return true;
  }
}

function shouldPurgeVideo(videoUrl, userId) {
  const v = String(videoUrl || "").trim();
  if (!v) return true;
  if (REMOVED_USER_IDS.has(userId)) return true;
  if (SAMPLE_VIDEO_RE.test(v)) return true;
  return false;
}

async function purgeReelRow(row) {
  const reason = REMOVED_USER_IDS.has(row.userId)
    ? "demo-user"
    : SAMPLE_VIDEO_RE.test(row.videoUrl || "")
      ? "sample-url"
      : "missing-file";
  console.log(`  reel ${row.id} @${row.userId} (${reason}) ${row.videoUrl || ""}`);
  if (dryRun) return;
  await deleteReelFiles(row);
  await deleteReelRow(row.id);
  try {
    await deletePost(row.postId ?? row.id);
  } catch {
    /* ignore */
  }
}

async function purgePostReel(p) {
  const reason = REMOVED_USER_IDS.has(p.userId)
    ? "demo-user"
    : SAMPLE_VIDEO_RE.test(p.video || "")
      ? "sample-url"
      : (await fileMissing(p.video || ""))
        ? "missing-file"
        : null;
  if (!reason) return false;
  console.log(`  post ${p.id} @${p.userId} (${reason}) ${p.video || ""}`);
  if (!dryRun) await deletePost(p.id);
  return true;
}

const reelsPath = path.join(DB_DIR, "reels.json");
const raw = JSON.parse(await fs.readFile(reelsPath, "utf8").catch(() => "{}"));
const map = typeof raw === "object" && raw && !Array.isArray(raw) ? raw : {};
let reelCount = 0;
for (const row of Object.values(map)) {
  if (!row || typeof row !== "object") continue;
  let purge = shouldPurgeVideo(row.videoUrl, row.userId);
  if (!purge && (await fileMissing(row.videoUrl))) purge = true;
  if (!purge) continue;
  reelCount++;
  await purgeReelRow(row);
}

const posts = await listPosts();
let postOnly = 0;
for (const p of posts) {
  if (!p || p.type !== "reel") continue;
  const mapHas = map[p.id];
  if (mapHas) continue;
  if (await purgePostReel(p)) postOnly++;
}

let usersRemoved = 0;
for (const uid of REMOVED_USER_IDS) {
  const users = await listUsers();
  if (!users.some(u => u.id === uid)) continue;
  console.log(`  delete user ${uid}`);
  if (!dryRun) {
    await deleteUserAccount(uid);
    usersRemoved++;
  }
}

console.log(
  `\n${dryRun ? "[dry-run] " : ""}Purged ${reelCount} reel(s), ${postOnly} post-only reel(s), ${usersRemoved} demo user(s).`,
);
