import bcrypt from "bcryptjs";
import {
  createUser,
  getUserById,
  listFollows,
  listPosts,
  listStories,
  listUsers,
  replaceFollows,
  replaceStories,
  upsertPost,
  deletePost,
  replaceLikesForPost,
  type FollowRow,
  type PostRow,
  type StoryRow,
  type UserRow,
} from "../db/engine.js";

const FOUNDER_ID = "u_founder_tareqf";
const OFFICIAL_APP_ID = "u_official_retweet";
const SUPPORT_OFFICIAL_ID = "u_support_official";
const OFFICIAL_APP_PASSWORD_HASH =
  "$2a$12$sWqTygUzytIUem6WxJtJde4Aon7PFUZHZ84DikP0jneEo.z72ENva";

const DEMO_USERS: Array<Omit<UserRow, "createdAt" | "updatedAt" | "passwordHash"> & { id: string }> = [
  {
    id: "u_tariq_bot",
    email: "tareq.bot@retweet.app",
    username: "tareq_bot",
    avatar: "RT",
    bio: "بوت طارق رمدي — أدعية وتذكير",
    appTheme: "light",
    appLanguage: "ar",
    isPrivate: false,
  },
  {
    id: OFFICIAL_APP_ID,
    email: "official@retweet.app",
    username: "retweet",
    displayName: "Retweet",
    avatar: "✦",
    bio: "الحساب الرسمي الوحيد لتطبيق Retweet — تحديثات، إعلانات، دعم، وإرشادات الاستخدام.",
    note: "✦ حساب التطبيق الرسمي",
    appTheme: "dark",
    appLanguage: "ar",
    isPrivate: false,
    verified: false,
    founderVerified: false,
    appOfficialVerified: true,
    appOfficialLabel:
      "هذا هو الحساب الرسمي الوحيد لتطبيق Retweet — للإعلانات، التحديثات، الدعم الفني، وسياسات المنصة.",
  },
  {
    id: SUPPORT_OFFICIAL_ID,
    email: "support@retweet.app",
    username: "support",
    displayName: "دعم Retweet",
    avatar: "🛟",
    bio: "حساب الدعم الرسمي — مساعدة المستخدمين والبلاغات وطلبات التوثيق.",
    note: "🛟 دعم Retweet الرسمي",
    appTheme: "light",
    appLanguage: "ar",
    isPrivate: false,
    verified: true,
    verificationStatus: "approved",
    isSubscribed: true,
    subscriptionPlan: "official",
    supportOfficialVerified: true,
    supportOfficialLabel:
      "هذا هو حساب الدعم الرسمي لتطبيق Retweet — للمساعدة، البلاغات، وطلبات التوثيق.",
  },
];

/** روابط قديمة قد تبدو سوداء — تُحذف عند التنظيف */
const STALE_REEL_URLS = new Set([
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
]);

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

async function ensureDemoUsers(hash: string): Promise<void> {
  for (const u of DEMO_USERS) {
    const existing = await getUserById(u.id);
    const passwordHash = u.id === OFFICIAL_APP_ID ? OFFICIAL_APP_PASSWORD_HASH : hash;
    if (existing) continue;
    await createUser({
      ...u,
      passwordHash,
    });
  }
}

async function ensureDemoPosts(): Promise<number> {
  const existing = await listPosts();
  if (existing.length >= 1) return existing.length;

  const rows: PostRow[] = [
    {
      id: "dev_post_official_welcome",
      userId: OFFICIAL_APP_ID,
      type: "post",
      text: "مرحباً بك في Retweet ✦\n\nهذا الحساب الرسمي للتطبيق — تابعنا للتحديثات والدعم.\n\n#Retweet #رسمي",
      image: "✦",
      likes: [],
      reposts: [],
      createdAt: isoAgo(1_800_000),
      updatedAt: isoAgo(1_800_000),
    },
  ];

  for (const row of rows) {
    await upsertPost(row);
  }
  return rows.length;
}

async function ensureDemoStories(): Promise<void> {
  /* لا قصص عينة */
}

async function ensureDemoFollows(): Promise<void> {
  const users = await listUsers();
  const demoIds = DEMO_USERS.map(u => u.id);
  const followerTargets = new Set<string>([...demoIds, FOUNDER_ID]);
  for (const u of users) {
    if (u.id === FOUNDER_ID || u.username === "t") followerTargets.add(u.id);
  }

  const rows: FollowRow[] = await listFollows();
  const key = (a: string, b: string) => `${a}->${b}`;
  const have = new Set(rows.map(r => key(r.followerId, r.followeeId)));
  const add = (followerId: string, followeeId: string) => {
    if (followerId === followeeId) return;
    const k = key(followerId, followeeId);
    if (have.has(k)) return;
    have.add(k);
    rows.push({ followerId, followeeId, createdAt: new Date().toISOString() });
  };

  for (const followerId of followerTargets) {
    for (const peer of demoIds) {
      if (peer === followerId) continue;
      add(followerId, peer);
    }
  }
  for (const demoId of demoIds) {
    add(demoId, OFFICIAL_APP_ID);
  }

  await replaceFollows(rows);
}

/** يحذف الريلزات القديمة ذات الروابط الخاطئة (شاشة سوداء) ويستبدلها برابط صالح */
export async function cleanupStaleReels(): Promise<number> {
  const all = await listPosts();
  let deleted = 0;
  for (const p of all) {
    if (p.type !== "reel") continue;
    const videoUrl = (p.video || p.image || "").trim();
    if (STALE_REEL_URLS.has(videoUrl)) {
      await deletePost(p.id);
      await replaceLikesForPost(p.id, []);
      deleted++;
    }
  }
  return deleted;
}

export async function seedDemoContentIfEmpty(): Promise<void> {
  await ensureDemoDatabaseContent(false);
}

/** يُستدعى عند تشغيل الخادم — يملأ العينة إن كانت القاعدة فارغة */
export async function ensureDemoDatabaseContent(
  force = false,
): Promise<{ seeded: boolean; posts: number }> {
  const postsBefore = (await listPosts()).length;
  if (!force && postsBefore >= 1) {
    await cleanupStaleReels();
    return { seeded: false, posts: postsBefore };
  }

  const hash = await bcrypt.hash("12345678", 12);
  await ensureDemoUsers(hash);
  const added = await ensureDemoPosts();
  await ensureDemoStories();
  await ensureDemoFollows();
  await cleanupStaleReels();

  const postsAfter = (await listPosts()).length;
  return { seeded: force || added > 0 || postsAfter > postsBefore, posts: postsAfter };
}
