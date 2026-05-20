import fs from "node:fs/promises";
import path from "node:path";

const usersFile = path.join(process.env.DATA_ROOT || "D:/RetweetSocial", "db", "users.json");
const raw = (await fs.readFile(usersFile, "utf8")).replace(/^\uFEFF/, "");
const map = JSON.parse(raw);
const id = "u_founder_tareqf";
if (!map[id]) process.exit(1);
map[id].bio = "";
map[id].founderOfficialLabel =
  "هذا الحساب (@t) هو حساب صاحب التطبيق ومؤسسه؛ يُعرض المحتوى والتوجيه الرسمي لـ Retweet من هنا.";
map[id].avatar = "T";
const tmp = `${usersFile}.utf8.tmp`;
await fs.writeFile(tmp, JSON.stringify(map, null, 2), { encoding: "utf8" });
await fs.rename(tmp, usersFile);
console.log("OK");
