#!/usr/bin/env node
/** حذف مباشر من posts.json — عند فشل deletePost بالكاش */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DB_DIR } from "../src/config.ts";

const SAMPLE_RE = /commondatastorage\.googleapis\.com\/gtv-videos-bucket\/sample/i;
const DEMO_USERS = new Set(["u_omar", "u_lina", "u_sara"]);

const file = path.join(DB_DIR, "posts.json");
const raw = JSON.parse(await fs.readFile(file, "utf8"));
let removed = 0;
for (const [id, p] of Object.entries(raw)) {
  if (!p || typeof p !== "object") {
    delete raw[id];
    removed++;
    continue;
  }
  const v = `${p.video || ""} ${p.image || ""}`;
  const isReel = p.type === "reel" || !!p.video;
  if (
    isReel &&
    (DEMO_USERS.has(p.userId) || SAMPLE_RE.test(v))
  ) {
    delete raw[id];
    removed++;
  }
}
const tmp = `${file}.${randomUUID()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(raw, null, 2), "utf8");
await fs.rename(tmp, file);
console.log(`Scrubbed ${removed} spam post(s) from posts.json`);
