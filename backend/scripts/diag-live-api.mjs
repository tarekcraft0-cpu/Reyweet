#!/usr/bin/env node
import { listUsers, listPosts } from "/opt/retweet/app/src/db/engine.ts";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { execSync } from "node:child_process";

const users = await listUsers();
const posts = await listPosts();
console.log("listUsers type", Array.isArray(users) ? "array" : typeof users, "len", users?.length);
console.log("listPosts len", posts?.length);

const sample = users.find?.((u) => u?.username) || users[0];
if (!sample) process.exit(0);
console.log("sample", sample.id, sample.username);

const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
const token = jwt.sign({ sub: sample.id, userId: sample.id }, secret, { expiresIn: "1h" });
const ingressSecret = process.env.RETWEET_INGRESS_SECRET || process.env.RETWEET_APP_SIGNING_SECRET;
const t = Date.now().toString();
const sig = crypto.createHmac("sha256", ingressSecret).update(t).digest("hex");
const hdr = `-H "Authorization: Bearer ${token}" -H "X-Retweet-Ingress-Time: ${t}" -H "X-Retweet-Ingress-Sig: ${sig}"`;

for (const [label, url] of [
  ["app-state", "http://127.0.0.1:3000/v1/app-state"],
  ["directory", "http://127.0.0.1:3000/v1/users/directory"],
  ["feed", "http://127.0.0.1:3000/v1/feed/posts?limit=10"],
]) {
  try {
    const raw = execSync(`curl -s -m 45 ${hdr} "${url}"`, { maxBuffer: 80 * 1024 * 1024 }).toString();
    if (raw.startsWith("<") || !raw.trim().startsWith("{")) {
      console.log(label, "non-json", raw.slice(0, 120));
      continue;
    }
    const j = JSON.parse(raw);
    if (j.error) {
      console.log(label, "error", j.error);
      continue;
    }
    if (label === "app-state") {
      const st = j.state || {};
      console.log(label, "users", (st.users || []).length, "posts", (st.posts || []).length, "chats", (st.chats || []).length);
    } else if (label === "directory") {
      console.log(label, "users", (j.users || []).length);
    } else {
      console.log(label, "posts", (j.posts || []).length);
    }
  } catch (e) {
    console.log(label, "ERR", String(e.message || e).slice(0, 300));
  }
}
