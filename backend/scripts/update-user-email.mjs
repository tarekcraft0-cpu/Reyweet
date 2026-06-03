/**
 * تحديث بريد مستخدم بالاسم @username
 * DATA_ROOT=/var/lib/retweet node backend/scripts/update-user-email.mjs 5vp irrichcaushu@gmail.com
 */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usernameArg = process.argv[2]?.trim().toLowerCase();
const newEmailArg = process.argv[3]?.trim().toLowerCase();

if (!usernameArg || !newEmailArg || !newEmailArg.includes("@")) {
  console.error("Usage: node backend/scripts/update-user-email.mjs <username> <new-email>");
  process.exit(1);
}

const usersFile = path.join(DATA_ROOT, "db", "users.json");
const snapshotsDir = path.join(DATA_ROOT, "snapshots");

async function patchSnapshots(userId, newEmail) {
  let files;
  try {
    files = await fs.readdir(snapshotsDir);
  } catch {
    return 0;
  }
  let n = 0;
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(snapshotsDir, f);
    let state;
    try {
      state = JSON.parse(await fs.readFile(p, "utf8"));
    } catch {
      continue;
    }
    if (!state?.users?.length) continue;
    let changed = false;
    state.users = state.users.map(u => {
      if (u.id !== userId) return u;
      changed = true;
      return { ...u, email: newEmail };
    });
    if (!changed) continue;
    const tmp = `${p}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmp, p);
    n++;
  }
  return n;
}

let raw = await fs.readFile(usersFile, "utf8");
raw = raw.replace(/^\uFEFF/, "").trim();
const map = JSON.parse(raw);
const entry = Object.entries(map).find(
  ([, u]) => String(u.username).toLowerCase() === usernameArg,
);
if (!entry) {
  console.error("الحساب غير موجود: @" + usernameArg);
  process.exit(1);
}
const [userId, u] = entry;
const emailTaken = Object.values(map).find(
  x => x.id !== userId && String(x.email).trim().toLowerCase() === newEmailArg,
);
if (emailTaken) {
  console.error("البريد مستخدم من حساب آخر:", emailTaken.username, emailTaken.id);
  process.exit(1);
}

const oldEmail = u.email;
const now = new Date().toISOString();
map[userId] = { ...u, email: newEmailArg, updatedAt: now };

const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);

const snaps = await patchSnapshots(userId, newEmailArg);
console.log(`تم: @${u.username} (${oldEmail}) → ${newEmailArg} — لقطات: ${snaps}`);
