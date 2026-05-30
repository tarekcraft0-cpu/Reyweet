/**
 * إنشاء/تحديث حساب الدعم الرسمي @support على السيرفر.
 * DATA_ROOT=/var/lib/retweet node backend/scripts/add-support-user.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");

const USER_ID = "u_support_official";
const PASSWORD_PLAIN = process.env.SUPPORT_ACCOUNT_PASSWORD?.trim() || "Support@Retweet2026!";
const now = new Date().toISOString();

const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 12);

const newUser = {
  id: USER_ID,
  email: "support@retweet.app",
  username: "support",
  displayName: "دعم Retweet",
  passwordHash,
  avatar: "🛟",
  bio: "حساب الدعم الرسمي لتطبيق Retweet — مساعدة المستخدمين، البلاغات، طلبات التوثيق، والحظر.",
  note: "🛟 دعم Retweet الرسمي",
  profileLink: "",
  verified: true,
  verificationStatus: "approved",
  verificationBadgeColor: "blue",
  isSubscribed: true,
  subscriptionPlan: "official",
  subscriptionExpiresAt: null,
  founderVerified: false,
  appOfficialVerified: false,
  supportOfficialVerified: true,
  supportOfficialLabel:
    "هذا هو حساب الدعم الرسمي لتطبيق Retweet — للمساعدة، البلاغات، طلبات التوثيق، واستفسارات الحساب. لا تتعامل مع حسابات أخرى تدّعي أنها فريق الدعم.",
  appTheme: "light",
  appLanguage: "ar",
  isPrivate: false,
  createdAt: now,
  updatedAt: now,
};

let raw = await fs.readFile(usersFile, "utf8").catch(() => "{}");
raw = raw.replace(/^\uFEFF/, "").trim() || "{}";
const map = JSON.parse(raw);

const dup = Object.values(map).find(
  u =>
    u.id !== USER_ID &&
    (u.email?.toLowerCase() === newUser.email.toLowerCase() ||
      u.username?.toLowerCase() === newUser.username.toLowerCase()),
);
if (dup) {
  console.error("البريد أو اسم المستخدم مستخدم لحساب آخر:", dup.id, dup.username);
  process.exit(1);
}

if (map[USER_ID]) {
  map[USER_ID] = {
    ...map[USER_ID],
    ...newUser,
    createdAt: map[USER_ID].createdAt || now,
    passwordHash: process.env.SUPPORT_ACCOUNT_PASSWORD ? passwordHash : map[USER_ID].passwordHash,
  };
  console.log("تم تحديث حساب الدعم:", USER_ID);
} else {
  map[USER_ID] = newUser;
  console.log("تم إنشاء حساب الدعم:", USER_ID);
}

const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);

console.log("\n--- بيانات الدخول (احفظها بأمان) ---");
console.log("المعرّف:", USER_ID);
console.log("اسم المستخدم: @support");
console.log("البريد:", newUser.email);
console.log("كلمة المرور:", PASSWORD_PLAIN);
console.log("\nصلاحيات: لوحة طلبات التوثيق + لوحة الإشراف (حظر/طعون/بلاغات)");
