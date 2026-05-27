#!/usr/bin/env node
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
const T='${T}';
const snap=JSON.parse(fs.readFileSync('/var/lib/retweet/snapshots/'+T+'.json','utf8'));
const posts=JSON.parse(fs.readFileSync('/var/lib/retweet/db/posts.json','utf8'));
const pa=Array.isArray(posts)?posts:Object.values(posts);
const reels=pa.filter(p=>p.userId===T&&p.type==='reel');
const dms=(snap.chats||[]).filter(c=>!c.isGroup&&!c.isChannel);
console.log('snapshot chats total', (snap.chats||[]).length);
console.log('snapshot DMs', dms.length, 'total msgs in DMs', dms.reduce((n,c)=>n+(c.messages||[]).length,0));
console.log('reels in db:', reels.map(r=>({id:r.id,video:r.video?.slice(0,60),image:r.image?.slice(0,60)})));
for (const r of reels) {
  for (const f of [r.video,r.image].filter(Boolean)) {
    const p=f.startsWith('/')?'/var/lib/retweet'+f.replace(/^\\/media\\//,'/'):null;
    if(p) console.log('file', p, fs.existsSync(p)?'EXISTS':'MISSING');
  }
}
const av=T snap.users?.find?.(()=>false);
const tu=(snap.users||[]).find(u=>u.id===T);
console.log('t in snapshot users', !!tu, 'avatar', tu?.avatar?.slice(0,80));
console.log('top DMs by msg count:');
dms.sort((a,b)=>(b.messages||[]).length-(a.messages||[]).length).slice(0,8).forEach(c=>{
  const peer=c.members.find(m=>m!==T);
  const u=(snap.users||[]).find(x=>x.id===peer);
  console.log(' ', u?.username||peer, (c.messages||[]).length, 'msgs', c.id);
});
`;

const b64 = Buffer.from(script.replace("const av=T snap","const av=snap"), "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({ host: "109.199.111.29", port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
