/** يزيل الروابط من حساب @t في users.json على القرص D */
import fs from "node:fs";
import path from "node:path";

const DATA_ROOT = process.env.DATA_ROOT || "D:/RetweetSocial";
const usersFile = path.join(DATA_ROOT, "db", "users.json");
const map = JSON.parse(fs.readFileSync(usersFile, "utf8").replace(/^\uFEFF/, ""));
const id = Object.keys(map).find(k => map[k].username === "t") || "u_founder_tareqf";
if (!map[id]) {
  console.error("founder user not found");
  process.exit(1);
}
map[id].bio = map[id].bio || "";
map[id].profileLink = "";
map[id].officialSiteUrl = "";
map[id].updatedAt = new Date().toISOString();
fs.writeFileSync(usersFile, JSON.stringify(map, null, 2) + "\n", "utf8");
console.log("cleaned founder profile links for", id);
