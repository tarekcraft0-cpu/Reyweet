#!/usr/bin/env node
/** فحص شامل: رسائل، ريلز، أفاتار، مقارنة مع الأرشيفات */
import { Client } from "ssh2";

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const T = "u_founder_tareqf";

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
const path=require('path');
const {execSync}=require('child_process');
const T='${T}';
const DATA='/var/lib/retweet';

function loadPosts(p){
  const raw=JSON.parse(fs.readFileSync(p,'utf8'));
  return Array.isArray(raw)?raw:Object.values(raw);
}
function loadUsers(p){
  const raw=JSON.parse(fs.readFileSync(p,'utf8'));
  return Array.isArray(raw)?raw:Object.values(raw);
}
function isRealAvatar(av){
  if(!av||typeof av!=='string') return false;
  const t=av.trim();
  if(t.startsWith('data:')||t.startsWith('/')||t.includes('://')||t.includes('media/')) return true;
  return t.length>4;
}
function stats(dbDir){
  const msgs=JSON.parse(fs.readFileSync(path.join(dbDir,'messages.json'),'utf8'));
  const posts=loadPosts(path.join(dbDir,'posts.json'));
  const users=loadUsers(path.join(dbDir,'users.json'));
  const reelsT=posts.filter(p=>p.userId===T&&p.type==='reel');
  const avatars=users.filter(u=>isRealAvatar(u.avatar)).length;
  const tUser=users.find(u=>u.id===T);
  return {
    messages: Object.keys(msgs).length,
    posts: posts.length,
    reelsT: reelsT.length,
    reelIdsT: reelsT.map(r=>r.id),
    users: users.length,
    usersWithAvatar: avatars,
    tAvatar: tUser?.avatar?.slice(0,80)||null,
  };
}

const cur=stats(path.join(DATA,'db'));
console.log('=== CURRENT ===');
console.log(JSON.stringify(cur,null,2));

const listScript = "find /root /var/lib/retweet/backups -maxdepth 1 -type f \\\\( -name 'retweet-pre-sync-*.tar.gz' -o -name 'retweet-before-repair-*.tar.gz' -o -name 'retweet-*.tar.gz' \\\\) -printf '%T@\\\\t%p\\\\n' 2>/dev/null | sort -n | cut -f2-";
const archives=execSync(listScript,{encoding:'utf8',shell:'/bin/bash'}).trim().split('\\n').filter(Boolean);
console.log('\\n=== ARCHIVES ('+archives.length+') ===');
let best=null;
for (const a of archives) {
  try {
    execSync('rm -rf /tmp/aud && mkdir -p /tmp/aud');
    execSync('tar -xzf "'+a.replace(/"/g,'\\\\"')+'" -C /tmp/aud 2>/dev/null');
    const db=execSync("find /tmp/aud -path '*/db/messages.json' -type f | head -1",{encoding:'utf8',shell:'/bin/bash'}).trim();
    if(!db) continue;
    const s=stats(path.dirname(db));
    const name=a.split('/').pop();
    console.log(name, JSON.stringify(s));
    if(!best||s.messages>best.s.messages||(s.messages===best.s.messages&&s.posts>best.s.posts)) best={name,a,s};
  } catch(e){ console.log(a.split('/').pop(), 'err', e.message); }
}
if(best){
  console.log('\\n=== RICHEST ===', best.name);
  console.log(JSON.stringify(best.s,null,2));
  const onlyInBestPosts=best.s.reelIdsT.filter(id=>!cur.reelIdsT.includes(id));
  console.log('reelsT missing from current:', onlyInBestPosts);
}
`;

const b64 = Buffer.from(script, "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({
    host: "109.199.111.29",
    port: 22,
    username: "root",
    password: PASSWORD,
    readyTimeout: 45000,
  });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
