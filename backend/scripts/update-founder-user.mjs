import fs from "node:fs/promises";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");
const USER_ID = "u_founder_tareqf";

let raw = await fs.readFile(usersFile, "utf8");
raw = raw.replace(/^\uFEFF/, "").trim();
const map = JSON.parse(raw);
const u = map[USER_ID];
if (!u) {
  console.error("الحساب غير موجود:", USER_ID);
  process.exit(1);
}

const now = new Date().toISOString();
map[USER_ID] = {
  ...u,
  username: "t",
  avatar: "T",
  bio: "",
  note: undefined,
  profileLink: "https://reyweet.vercel.app",
  officialSiteUrl: "https://reyweet.vercel.app",
  founderVerified: true,
  verified: false,
  founderOfficialLabel:
    "هذا الحساب (@t) هو حساب صاحب التطبيق ومؤسسه؛ يُعرض المحتوى والتوجيه الرسمي لـ Retweet من هنا.",
  updatedAt: now,
};

const tmp = `${usersFile}.${Date.now()}.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
await fs.rename(tmp, usersFile);
console.log("تم التحديث: @t —", u.email);
