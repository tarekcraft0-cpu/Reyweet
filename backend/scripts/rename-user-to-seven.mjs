/**
 * يغيّر @udyycy → @7 ويحدّث اللقطات على D:
 * node backend/scripts/rename-user-to-seven.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const USER_ID = "5d658fe5-bd19-4b4d-be92-a1e0e755215b";
const NEW_USERNAME = "7";
const OLD_USERNAME = "udyycy";

const usersFile = path.join(DATA_ROOT, "db", "users.json");
const snapshotsDir = path.join(DATA_ROOT, "snapshots");

async function patchSnapshots() {
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
      if (u.id !== USER_ID && u.username?.toLowerCase() !== OLD_USERNAME) return u;
      changed = true;
      return {
        ...u,
        id: USER_ID,
        username: NEW_USERNAME,
        avatar: u.avatar && u.avatar.length > 2 && !u.avatar.startsWith("http") ? u.avatar : u.avatar || "7",
      };
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
  console.error("اسم @7 مستخدم من حساب آخر:", taken.id);
  process.exit(1);
}

const now = new Date().toISOString();
map[USER_ID] = {
  ...u,
  username: NEW_USERNAME,
  avatar: u.avatar === "UD" || u.avatar?.toUpperCase() === "UD" ? "7" : u.avatar,
  verified: u.verified === true,
  updatedAt: now,
};

const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);

const snaps = await patchSnapshots();
console.log(`تم: @${OLD_USERNAME} → @${NEW_USERNAME} (${u.email}) — لقطات محدّثة: ${snaps}`);
