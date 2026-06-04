/**
 * DATA_ROOT=/var/lib/retweet node backend/scripts/lookup-user-by-username.mjs L
 */
import fs from "node:fs/promises";
import path from "node:path";

const username = process.argv[2]?.trim().replace(/^@/, "").toLowerCase();
if (!username) {
  console.error("Usage: node backend/scripts/lookup-user-by-username.mjs <username>");
  process.exit(1);
}

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");

let raw = await fs.readFile(usersFile, "utf8");
raw = raw.replace(/^\uFEFF/, "").trim();
const map = JSON.parse(raw);
const hits = Object.values(map).filter(
  u => String(u.username || "").toLowerCase() === username,
);

if (!hits.length) {
  console.log(JSON.stringify({ found: false, username }));
  process.exit(0);
}

console.log(
  JSON.stringify(
    {
      found: true,
      count: hits.length,
      users: hits.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName || "",
        phone: u.phone || "",
      })),
    },
    null,
    2,
  ),
);
