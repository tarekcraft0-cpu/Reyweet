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
const {execSync}=require('child_process');
const listScript = "find /root /var/lib/retweet/backups -maxdepth 1 -type f \\\\( -name 'retweet-pre-sync-*.tar.gz' -o -name 'retweet-before-repair-*.tar.gz' -o -name 'retweet-*.tar.gz' \\\\) -printf '%T@\\\\t%p\\\\n' 2>/dev/null | sort -n | cut -f2-";
const archives=execSync(listScript,{encoding:'utf8',shell:'/bin/bash'}).trim().split('\\n').filter(Boolean);
const cur=JSON.parse(fs.readFileSync('/var/lib/retweet/db/messages.json','utf8'));
const posts=JSON.parse(fs.readFileSync('/var/lib/retweet/db/posts.json','utf8'));
const pa=Array.isArray(posts)?posts:Object.values(posts);
console.log('CURRENT messages:', Object.keys(cur).length, 'posts:', pa.length);
for (const a of archives) {
  try {
    execSync('rm -rf /tmp/msgchk && mkdir -p /tmp/msgchk');
    execSync('tar -xzf "'+a.replace(/"/g,'\\\\"')+'" -C /tmp/msgchk 2>/dev/null');
    const msgPath=execSync("find /tmp/msgchk -path '*/db/messages.json' -type f | head -1",{encoding:'utf8',shell:'/bin/bash'}).trim();
    if (!msgPath) { console.log('  ', a.split('/').pop(), 'no messages.json'); continue; }
    const m=JSON.parse(fs.readFileSync(msgPath,'utf8'));
    let postCount='?';
    try {
      const pp=msgPath.replace('messages.json','posts.json');
      const p=JSON.parse(fs.readFileSync(pp,'utf8'));
      postCount=(Array.isArray(p)?p:Object.values(p)).length;
    } catch {}
    console.log('  ', a.split('/').pop(), 'messages:', Object.keys(m).length, 'posts:', postCount);
  } catch(e) { console.log('  ', a.split('/').pop(), 'err', e.message); }
}
`;

const b64 = Buffer.from(script, "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({
    host: process.env.CONTABO_HOST || "109.199.111.29",
    port: 22,
    username: "root",
    password: PASSWORD,
    readyTimeout: 45000,
  });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
