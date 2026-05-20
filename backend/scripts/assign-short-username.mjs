/**
 * تعيين اسم مستخدم قصير (حرف واحد) لحساب موجود + تحديث اللقطات
 * node backend/scripts/assign-short-username.mjs <userId> <newUsername>
 * مثال: node backend/scripts/assign-short-username.mjs 863b808b-0c26-4d9f-b1c5-b9b586e31d44 1
 */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");
const snapshotsDir = path.join(DATA_ROOT, "snapshots");

const USER_ID = process.argv[2]?.trim();
const NEW_USERNAME = process.argv[3]?.trim()?.toLowerCase();

if (!USER_ID || !NEW_USERNAME || NEW_USERNAME.length > 2) {
  console.error("الاستخدام: node assign-short-username.mjs <userId> <username>");
  process.exit(1);
}

async function patchSnapshots(targetId, newName) {
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
      if (u.id !== targetId) return u;
      changed = true;
      return { ...u, username: newName };
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
const u = map[USER_ID];
if (!u) {
  console.error("الحساب غير موجود:", USER_ID);
  process.exit(1);
}
const taken = Object.values(map).find(
  x => x.id !== USER_ID && String(x.username).toLowerCase() === NEW_USERNAME,
);
if (taken) {
  console.error(`@${NEW_USERNAME} مستخدم من:`, taken.id, taken.email);
  process.exit(1);
}

const now = new Date().toISOString();
map[USER_ID] = {
  ...u,
  username: NEW_USERNAME,
  updatedAt: now,
};

const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);

const snaps = await patchSnapshots(USER_ID, NEW_USERNAME);
console.log(`تم: @${u.username} → @${NEW_USERNAME} (${u.email}) — لقطات: ${snaps}`);
