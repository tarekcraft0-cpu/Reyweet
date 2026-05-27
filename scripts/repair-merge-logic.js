/**
 * منطق دمج آمن: لا يُلغى التوثيق، ويدمج المنشورات والرسائل.
 * يُنفَّذ على السيرفر عبر scp أو مضمّناً في سكربت SSH.
 */
const fs = require("fs");
const path = require("path");

const DATA = process.env.DATA_ROOT || "/var/lib/retweet";
const BACKUP_ROOT = process.env.BACKUP_EXTRACT || ""; // مثل /tmp/retweet-recover/retweet
const LOCAL_SRC = process.env.SYNC_SRC || ""; // اختياري: مجلد مزامنة من الجهاز
/** جذور إضافية من أرشيفات VPS — مفرّزة بـ | (من bash) */
function extraBackupRoots() {
  const raw = process.env.EXTRA_BACKUPS || "";
  return raw.split("|").map((s) => s.trim()).filter(Boolean);
}

function ingestDataRoot(treeRoot, bundles) {
  const dbr = path.join(treeRoot, "db");
  if (!fs.existsSync(dbr)) return;
  const u = path.join(dbr, "users.json");
  const p = path.join(dbr, "posts.json");
  const m = path.join(dbr, "messages.json");
  const st = path.join(dbr, "stories.json");
  const lk = path.join(dbr, "likes.json");
  const fo = path.join(dbr, "follows.json");
  const fq = path.join(dbr, "follow_requests.json");
  const sr = path.join(dbr, "streaks.json");
  if (fs.existsSync(u)) bundles.users.push(readJson(u, []));
  if (fs.existsSync(p)) bundles.posts.push(readJson(p, []));
  if (fs.existsSync(m)) bundles.messages.push(readJson(m, {}));
  if (fs.existsSync(st)) bundles.stories.push(readJson(st, []));
  if (fs.existsSync(lk)) bundles.likes.push(readJson(lk, []));
  if (fs.existsSync(fo)) bundles.follows.push(readJson(fo, []));
  if (fs.existsSync(fq)) bundles.followRequests.push(readJson(fq, []));
  if (fs.existsSync(sr)) bundles.streaks.push(readJson(sr, {}));
}

function mergeFollowsArrays(sources) {
  const key = (f) => `${f.followerId}:${f.followeeId}`;
  const byKey = new Map();
  for (const list of sources) {
    for (const f of asArray(list)) {
      if (!f?.followerId || !f?.followeeId) continue;
      const k = key(f);
      const prev = byKey.get(k);
      if (!prev || ts(f.createdAt) >= ts(prev.createdAt)) byKey.set(k, f);
    }
  }
  return [...byKey.values()];
}

function mergeFollowRequestsArrays(sources) {
  const key = (f) => `${f.fromId}:${f.toId}`;
  const byKey = new Map();
  for (const list of sources) {
    for (const f of asArray(list)) {
      if (!f?.fromId || !f?.toId) continue;
      const k = key(f);
      const prev = byKey.get(k);
      if (!prev || ts(f.createdAt) >= ts(prev.createdAt)) byKey.set(k, f);
    }
  }
  return [...byKey.values()];
}

function mergeStreaksMaps(sources) {
  const out = {};
  for (const m of sources) {
    const obj =
      typeof m === "object" && m !== null && !Array.isArray(m)
        ? m
        : Array.isArray(m)
          ? Object.fromEntries(m.filter(Boolean).map((x) => [x.chatId || x.id, x]))
          : {};
    for (const [id, row] of Object.entries(obj)) {
      if (!out[id]) out[id] = row;
      else {
        const ta = typeof out[id].lastExchangeAt === "number" ? out[id].lastExchangeAt : 0;
        const tb = typeof row.lastExchangeAt === "number" ? row.lastExchangeAt : 0;
        out[id] = tb >= ta ? row : out[id];
      }
    }
  }
  return out;
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeAtomic(p, data) {
  const tmp = p + ".repair-" + Date.now() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function asArray(x) {
  return Array.isArray(x) ? x : Object.values(x || {});
}

function ts(x) {
  return new Date(x || 0).getTime();
}

/** دمج توثيق: لا تخفض أبداً */
function mergeVerification(u, v) {
  const rank = { approved: 4, pending: 3, rejected: 2, none: 1 };
  const ru = u.verificationStatus || "none";
  const rv = v.verificationStatus || "none";
  const bestStatus = rank[ru] >= rank[rv] ? ru : rv;
  return {
    verified: !!(u.verified || v.verified),
    founderVerified: !!(u.founderVerified || v.founderVerified),
    appOfficialVerified: !!(u.appOfficialVerified || v.appOfficialVerified),
    founderOfficialLabel: (v.founderOfficialLabel || "").trim() || u.founderOfficialLabel || "",
    appOfficialLabel: (v.appOfficialLabel || "").trim() || u.appOfficialLabel || "",
    verificationStatus: bestStatus,
    verificationBadgeColor: v.verificationBadgeColor || u.verificationBadgeColor,
    verificationRequestedAt: v.verificationRequestedAt || u.verificationRequestedAt,
    verificationRejectReason: v.verificationRejectReason || u.verificationRejectReason,
    isSubscribed: !!(u.isSubscribed || v.isSubscribed),
    subscriptionPlan: v.subscriptionPlan || u.subscriptionPlan,
    subscriptionExpiresAt: v.subscriptionExpiresAt || u.subscriptionExpiresAt,
    canUseAnimatedAvatar: !!(u.canUseAnimatedAvatar || v.canUseAnimatedAvatar),
    storyMaxDuration: Math.max(u.storyMaxDuration || 0, v.storyMaxDuration || 0) || undefined,
    postCharacterLimit: Math.max(u.postCharacterLimit || 0, v.postCharacterLimit || 0) || undefined,
  };
}

/** للملف الشخصي: الحقول العادية من الأحدث، والتوثيق من الاتحاد دائماً */
function mergeUserRow(a, b) {
  if (!a) return { ...b };
  if (!b) return { ...a };
  const newer = ts(b.updatedAt) >= ts(a.updatedAt) ? b : a;
  const older = newer === b ? a : b;
  const ver = mergeVerification(a, b);
  const base = { ...older, ...newer, ...ver };
  // كلمة المرور المشفرة: لا تُفقد
  base.passwordHash = newer.passwordHash || older.passwordHash || base.passwordHash;
  // صورة رفعها المستخدم (/media/) تفوز على الحروف الأولى فقط
  const avA = String(a.avatar || "");
  const avB = String(b.avatar || "");
  if (avA.includes("/media/") && !avB.includes("/media/")) base.avatar = avA;
  else if (avB.includes("/media/") && !avA.includes("/media/")) base.avatar = avB;
  else if (String(avA).length > 15 && String(avB).length <= 4) base.avatar = avA;
  else if (String(avB).length > 15 && String(avA).length <= 4) base.avatar = avB;
  return base;
}

function mergeAllUsers(sources) {
  /** sources: مصفوفة من مصفوفات مستخدمين */
  const byId = new Map();
  for (const list of sources) {
    for (const u of asArray(list)) {
      if (!u?.id) continue;
      const prev = byId.get(u.id);
      byId.set(u.id, prev ? mergeUserRow(prev, u) : { ...u });
    }
  }
  return [...byId.values()];
}

function mergePosts(sources) {
  const byId = new Map();
  for (const list of sources) {
    for (const p of asArray(list)) {
      if (!p?.id) continue;
      const prev = byId.get(p.id);
      if (!prev) {
        byId.set(p.id, { ...p });
        continue;
      }
      const tN = ts(p.updatedAt || p.createdAt);
      const tP = ts(prev.updatedAt || prev.createdAt);
      const chosen = tN >= tP ? { ...prev, ...p, comments: prev.comments || p.comments || [] } : prev;
      byId.set(p.id, chosen);
    }
  }
  return [...byId.values()].sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function mergeMessagesObjects(sources) {
  const out = {};
  for (const m of sources) {
    for (const [id, row] of Object.entries(m || {})) {
      if (!out[id]) out[id] = row;
      else {
        const tA = ts(out[id].createdAt);
        const tB = ts(row.createdAt);
        out[id] = tB >= tA ? row : out[id];
      }
    }
  }
  return out;
}

function mergeStoriesArrays(sources) {
  const byId = new Map();
  for (const list of sources) {
    for (const s of asArray(list)) {
      if (!s?.id) continue;
      const prev = byId.get(s.id);
      if (!prev) byId.set(s.id, { ...s });
      else byId.set(s.id, ts(s.createdAt) >= ts(prev.createdAt) ? { ...prev, ...s } : { ...s, ...prev });
    }
  }
  return [...byId.values()];
}

function mergeLikesArrays(sources) {
  const key = r => `${r.postId}:${r.userId}`;
  const byKey = new Map();
  for (const list of sources) {
    for (const r of asArray(list)) {
      if (!r?.postId || !r?.userId) continue;
      const prev = byKey.get(key(r));
      if (!prev || ts(r.createdAt) >= ts(prev.createdAt)) byKey.set(key(r), r);
    }
  }
  return [...byKey.values()];
}

function main() {
  const db = path.join(DATA, "db");
  /** ترتيب: أقدم مصادر خارجية ثم الوضع الحي ثم نسخة الجهاز */
  const b = {
    users: [],
    posts: [],
    messages: [],
    stories: [],
    likes: [],
    follows: [],
    followRequests: [],
    streaks: [],
  };

  for (const r of extraBackupRoots()) ingestDataRoot(r, b);
  if (BACKUP_ROOT) ingestDataRoot(BACKUP_ROOT, b);

  const curUsers = readJson(path.join(db, "users.json"), []);
  const curPosts = readJson(path.join(db, "posts.json"), []);
  const curMsg = readJson(path.join(db, "messages.json"), {});
  const curStories = readJson(path.join(db, "stories.json"), []);
  const curLikes = readJson(path.join(db, "likes.json"), []);
  const curFollows = readJson(path.join(db, "follows.json"), []);
  const curFr = readJson(path.join(db, "follow_requests.json"), []);
  const curStreaks = readJson(path.join(db, "streaks.json"), {});

  b.users.push(curUsers);
  b.posts.push(curPosts);
  b.messages.push(curMsg);
  b.stories.push(curStories);
  b.likes.push(curLikes);
  if (Array.isArray(curFollows)) b.follows.push(curFollows);
  if (Array.isArray(curFr)) b.followRequests.push(curFr);
  if (curStreaks && typeof curStreaks === "object") b.streaks.push(curStreaks);

  if (LOCAL_SRC) ingestDataRoot(LOCAL_SRC, b);

  const mergedUsers = mergeAllUsers(b.users);
  const mergedPosts = mergePosts(b.posts);
  const mergedMsg = mergeMessagesObjects(b.messages);
  const mergedStories = mergeStoriesArrays(b.stories);
  const mergedLikes = mergeLikesArrays(b.likes);
  const mergedFollows = mergeFollowsArrays(b.follows);
  const mergedFr = mergeFollowRequestsArrays(b.followRequests);
  const mergedStreaks = mergeStreaksMaps(b.streaks);

  writeAtomic(path.join(db, "users.json"), mergedUsers);
  writeAtomic(path.join(db, "posts.json"), mergedPosts);
  writeAtomic(path.join(db, "messages.json"), mergedMsg);
  writeAtomic(path.join(db, "stories.json"), mergedStories);
  writeAtomic(path.join(db, "likes.json"), mergedLikes);
  writeAtomic(path.join(db, "follows.json"), mergedFollows);
  writeAtomic(path.join(db, "follow_requests.json"), mergedFr);
  writeAtomic(path.join(db, "streaks.json"), mergedStreaks);

  const reels = mergedPosts.filter((p) => p.type === "reel").length;
  const verified = mergedUsers.filter(
    (u) => u.verified || u.founderVerified || u.appOfficialVerified,
  ).length;
  console.log("[repair-merge] users", mergedUsers.length, "verified-flags-any", verified);
  console.log("[repair-merge] posts", mergedPosts.length, "reels", reels);
  console.log("[repair-merge] messages", Object.keys(mergedMsg).length);
  console.log("[repair-merge] stories", mergedStories.length, "likes", mergedLikes.length);
  console.log("[repair-merge] follows", mergedFollows.length, "followReq", mergedFr.length);
  console.log("[repair-merge] streaks", Object.keys(mergedStreaks).length);
}

main();
