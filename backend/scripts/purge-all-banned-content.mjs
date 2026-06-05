#!/usr/bin/env node
/**
 * يحذف كل المحتوى العام لكل الحسابات المحظورة من posts.json واللقطات.
 *
 *   DATA_ROOT=/var/lib/retweet node backend/scripts/purge-all-banned-content.mjs
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");

async function load(modulePath) {
  return import(pathToFileURL(modulePath).href);
}

const bannedCache = await load(path.join(backendRoot, "src/lib/bannedUserCache.ts"));
const purge = await load(path.join(backendRoot, "src/lib/purgeUserPublicContent.ts"));

await bannedCache.ensureBannedUserCacheLoaded();
const ids = [...(await bannedCache.getBannedUserIdSet())];

console.log("banned accounts:", ids.length);
let ok = 0;
let fail = 0;
for (const userId of ids) {
  try {
    await purge.purgeUserPublicContent(userId);
    ok += 1;
    console.log("purged:", userId);
  } catch (e) {
    fail += 1;
    console.warn("purge failed:", userId, e);
  }
}
console.log(JSON.stringify({ ok, fail, total: ids.length }));
