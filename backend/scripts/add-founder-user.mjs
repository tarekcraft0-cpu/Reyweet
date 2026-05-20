import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");

const USER_ID = "u_founder_tareqf";
const now = new Date().toISOString();

const newUser = {
  id: USER_ID,
  email: "tareqf330@gmail.com",
  username: "tareqf",
  passwordHash: "$2a$12$Z0RawR.uW/K.R062XUUQZuBi6qh9FHZLkP57oeTE/IDx98fIgZ2ua",
  avatar: "TA",
  bio: "الحساب الرسمي لمنشئ ومطوّر تطبيق Retweet. هذا الحساب الوحيد المعتمد للدعم الفني، الإعلانات، والتواصل الرسمي من فريق التطوير.",
  note: "🏛 الحساب الرسمي لصاحب التطبيق — منشئ Retweet",
  profileLink: "",
  verified: false,
  founderVerified: true,
  appTheme: "light",
  appLanguage: "ar",
  createdAt: now,
  updatedAt: now,
};

let raw = await fs.readFile(usersFile, "utf8").catch(() => "{}");
raw = raw.replace(/^\uFEFF/, "").trim() || "{}";
const map = JSON.parse(raw);
if (map[USER_ID]) {
  console.error("الحساب موجود مسبقاً:", USER_ID);
  process.exit(1);
}
const dup = Object.values(map).find(
  u =>
    u.email?.toLowerCase() === newUser.email.toLowerCase() ||
    u.username?.toLowerCase() === newUser.username.toLowerCase(),
);
if (dup) {
  console.error("البريد أو اسم المستخدم مستخدم:", dup.id);
  process.exit(1);
}
map[USER_ID] = newUser;
const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);
console.log("تم إنشاء الحساب:", newUser.username, newUser.email, USER_ID);
