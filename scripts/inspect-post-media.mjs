#!/usr/bin/env node
/** عيّنة من روابط فيديو/صورة في posts.json */
import { readFileSync } from "node:fs";

const p = process.argv[2] || "D:/RetweetSocial/db/posts.json";
const raw = JSON.parse(readFileSync(p, "utf8"));
const posts = Array.isArray(raw) ? raw : raw.posts || [];

const withMedia = posts.filter(x => (x.video || x.image || "").includes("media") || /^https?:/.test(x.video || x.image || ""));

console.log(`total posts: ${posts.length}, with media urls: ${withMedia.length}\n`);

for (const x of withMedia.slice(0, 25)) {
  console.log(JSON.stringify({
    id: x.id?.slice(0, 12),
    type: x.type,
    video: (x.video || "").slice(0, 120),
    image: (x.image || "").slice(0, 120),
  }));
}

const patterns = {};
for (const x of withMedia) {
  const u = (x.video || x.image || "").trim();
  let key = "other";
  if (u.startsWith("/media/")) key = "/media/ relative";
  else if (u.includes("trycloudflare")) key = "trycloudflare";
  else if (u.includes("109.199.111.29")) key = "contabo ip";
  else if (u.includes("192.168.")) key = "lan";
  else if (u.includes("commondatastorage")) key = "google demo";
  else if (u.startsWith("http")) key = "http other";
  patterns[key] = (patterns[key] || 0) + 1;
}
console.log("\npatterns:", patterns);
