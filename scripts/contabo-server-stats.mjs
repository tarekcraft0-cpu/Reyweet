#!/usr/bin/env node
import { Client } from "ssh2";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
function exec(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (e, s) => {
      if (e) return rej(e);
      let o = "";
      s.on("data", d => (o += d));
      s.stderr.on("data", d => (o += d));
      s.on("close", () => res(o.trim()));
    });
  });
}
const script = `
const fs=require('fs');
const root='/var/lib/retweet/db';
const follows=JSON.parse(fs.readFileSync(root+'/follows.json','utf8'));
const posts=JSON.parse(fs.readFileSync(root+'/posts.json','utf8'));
const pa=Array.isArray(posts)?posts:Object.values(posts);
const msgs=JSON.parse(fs.readFileSync(root+'/messages.json','utf8'));
const t='u_founder_tareqf';
console.log(JSON.stringify({
  follows: follows.length,
  followersOfT: follows.filter(f=>f.followeeId===t).length,
  posts: pa.length,
  reelsT: pa.filter(p=>p.userId===t&&p.type==='reel').length,
  messages: Object.keys(msgs).length,
},null,2));
`;
const b64 = Buffer.from(script, "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({ host: "109.199.111.29", port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
