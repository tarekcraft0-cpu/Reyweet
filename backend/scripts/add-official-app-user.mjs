import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");

const USER_ID = "u_official_retweet";
const now = new Date().toISOString();

const newUser = {
  id: USER_ID,
  email: "official@retweet.app",
  username: "retweet",
  displayName: "Retweet",
  passwordHash: "$2a$12$sWqTygUzytIUem6WxJtJde4Aon7PFUZHZ84DikP0jneEo.z72ENva",
  avatar: "✦",
  bio: "الحساب الرسمي الوحيد لتطبيق Retweet — تحديثات، إعلانات، دعم، وإرشادات الاستخدام.",
  note: "✦ حساب التطبيق الرسمي",
  profileLink: "",
  verified: false,
  founderVerified: false,
  appOfficialVerified: true,
  appOfficialLabel:
    "هذا هو الحساب الرسمي الوحيد لتطبيق Retweet — للإعلانات، التحديثات، الدعم الفني، وسياسات المنصة. أي حساب آخر يدّعي تمثيل التطبيق غير معتمد.",
  appTheme: "dark",
  appLanguage: "ar",
  createdAt: now,
  updatedAt: now,
};

let raw = await fs.readFile(usersFile, "utf8").catch(() => "{}");
raw = raw.replace(/^\uFEFF/, "").trim() || "{}";
const map = JSON.parse(raw);
if (map[USER_ID]) {
  map[USER_ID] = { ...map[USER_ID], ...newUser, createdAt: map[USER_ID].createdAt || now };
  console.log("تم تحديث الحساب الرسمي:", USER_ID);
} else {
  const dup = Object.values(map).find(
    u =>
      u.email?.toLowerCase() === newUser.email.toLowerCase() ||
      u.username?.toLowerCase() === newUser.username.toLowerCase(),
  );
  if (dup && dup.id !== USER_ID) {
    console.error("البريد أو اسم المستخدم مستخدم:", dup.id);
    process.exit(1);
  }
  map[USER_ID] = newUser;
  console.log("تم إنشاء الحساب الرسمي:", newUser.username, newUser.email, USER_ID);
}
const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);
console.log("\n--- بيانات الدخول ---");
console.log("المعرّف:", USER_ID);
console.log("اسم المستخدم: @retweet");
console.log("البريد: official@retweet.app");
console.log("كلمة المرور: Retweet@Official2026!");
