/**
 * حذف حساب باليوزر من users.json والمنشورات والمتابعات واللقطات.
 * الاستخدام: node backend/scripts/delete-user-by-username.mjs omar.dev
 */
import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const USERNAME = (process.argv[2] || "").trim().toLowerCase();

if (!USERNAME) {
  console.error("الاستخدام: node backend/scripts/delete-user-by-username.mjs <username>");
  process.exit(1);
}

const usersFile = path.join(DATA_ROOT, "db", "users.json");
const postsFile = path.join(DATA_ROOT, "db", "posts.json");
const likesFile = path.join(DATA_ROOT, "db", "likes.json");
const followsFile = path.join(DATA_ROOT, "db", "follows.json");
const storiesFile = path.join(DATA_ROOT, "db", "stories.json");
const snapshotsDir = path.join(DATA_ROOT, "snapshots");

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "").trim());
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  const tmp = `${file}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function stripId(id, removed) {
  return id && !removed.has(id);
}

async function patchSnapshots(removedId) {
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
    const users = (state.users || []).filter(u => u.id !== removedId);
    if (users.length === (state.users || []).length) continue;
    state.users = users.map(u => ({
      ...u,
      followers: (u.followers || []).filter(id => id !== removedId),
      following: (u.following || []).filter(id => id !== removedId),
    }));
    state.posts = (state.posts || [])
      .filter(p => p.userId !== removedId)
      .map(p => ({
        ...p,
        likes: (p.likes || []).filter(id => id !== removedId),
        comments: (p.comments || []).filter(c => c.userId !== removedId),
      }));
    state.chats = (state.chats || [])
      .map(c => ({
        ...c,
        members: (c.members || []).filter(id => id !== removedId),
        messages: (c.messages || []).filter(m => m.senderId !== removedId),
      }))
      .filter(c => (c.members || []).length > 0);
    if (state.currentUserId === removedId) state.currentUserId = null;
    await writeJson(p, state);
    n++;
  }
  return n;
}

const usersMap = await readJson(usersFile, {});
const entry = Object.values(usersMap).find(
  u => String(u.username || "").toLowerCase() === USERNAME,
);
if (!entry) {
  console.log(`لم يُعثر على @${USERNAME} في ${usersFile}`);
  process.exit(0);
}

const removedId = entry.id;
delete usersMap[removedId];
await writeJson(usersFile, usersMap);

const postsMap = await readJson(postsFile, {});
let postsDeleted = 0;
for (const [id, p] of Object.entries(postsMap)) {
  if (p.userId === removedId) {
    delete postsMap[id];
    postsDeleted++;
    continue;
  }
  p.likes = (p.likes || []).filter(uid => uid !== removedId);
}
await writeJson(postsFile, postsMap);

const likes = await readJson(likesFile, []);
const likesNext = likes.filter(l => l.userId !== removedId);
await writeJson(likesFile, likesNext);

const follows = await readJson(followsFile, []);
const followsNext = follows.filter(
  f => f.followerId !== removedId && f.followeeId !== removedId,
);
await writeJson(followsFile, followsNext);

const storiesMap = await readJson(storiesFile, {});
for (const [id, s] of Object.entries(storiesMap)) {
  if (s.userId === removedId) delete storiesMap[id];
  else s.viewedByUserIds = (s.viewedByUserIds || []).filter(uid => uid !== removedId);
}
await writeJson(storiesFile, storiesMap);

const snaps = await patchSnapshots(removedId);
console.log(
  `تم حذف @${USERNAME} (${removedId}) — منشورات: ${postsDeleted} — لقطات: ${snaps}`,
);
