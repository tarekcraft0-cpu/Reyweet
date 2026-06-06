#!/usr/bin/env node
import "dotenv/config";
import { listUsers } from "../src/db/engine.ts";
import jwt from "jsonwebtoken";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT } from "../src/config.ts";
import { decodeStoredJson } from "../src/lib/encryptedStorage.ts";

function call(path, headers) {
  return new Promise(resolve => {
    const req = http.request(
      { hostname: "127.0.0.1", port: 3000, path, method: "GET", headers },
      res => {
        let d = "";
        res.on("data", c => (d += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, len: d.length, body: d.slice(0, 200) }),
        );
      },
    );
    req.on("error", e => resolve({ status: 0, body: String(e) }));
    req.end();
  });
}

const users = await listUsers();
const modFile = path.join(DATA_ROOT, "moderation", "user_states.json");
let modDb = { users: {} };
try {
  const raw = JSON.parse((await fs.readFile(modFile, "utf8")).replace(/^\uFEFF/, "").trim());
  modDb = decodeStoredJson(raw, modFile);
} catch { /* */ }

let active = null;
let banned = 0;
for (const row of users) {
  const st = modDb.users?.[row.id];
  const status = st?.accountStatus || "ACTIVE";
  if (status === "PERMANENTLY_BANNED" || status === "BANNED" || status === "TEMP_BANNED") {
    banned++;
    continue;
  }
  if (!active && row.username) active = row;
}
console.log("stats", "total", users.length, "banned", banned);
if (!active) {
  console.log("no active user — trying first user anyway");
  active = users.find(u => u.username) || users[0];
}
if (!active) {
  console.log("no users");
  process.exit(0);
}
const secret = process.env.JWT_SECRET || "";
const token = jwt.sign(
  { sub: active.id, userId: active.id, tv: active.tokenVersion ?? 1 },
  secret,
  { expiresIn: "1h" },
);
const auth = `Bearer ${token}`;
console.log("user", active.username, "id", active.id);
console.log("TOKEN|" + token);
console.log("dir", JSON.stringify(await call("/v1/users/directory", { Authorization: auth, "Accept-Language": "ar" })));
console.log("feed", JSON.stringify(await call("/v1/feed/posts?limit=3", { Authorization: auth, "Accept-Language": "ar" })));
