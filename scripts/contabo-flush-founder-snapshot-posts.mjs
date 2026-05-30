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
const postsPath='/var/lib/retweet/db/posts.json';
const snap=JSON.parse(fs.readFileSync('/var/lib/retweet/snapshots/'+T+'.json','utf8'));
const map=JSON.parse(fs.readFileSync(postsPath,'utf8'));
const isArr=Array.isArray(map);
const store=isArr?Object.fromEntries(map.map(p=>[p.id,p])):map;
let added=0;
for (const p of snap.posts||[]) {
  if (!p?.id||p.userId!==T) continue;
  if (store[p.id]) continue;
  store[p.id]={
    id:p.id,userId:T,type:p.type||'post',text:p.text||'',
    image:p.image,video:p.video,audio:p.audio,
    likes:p.likes||[],reposts:p.reposts||[],comments:[],
    createdAt:new Date(p.createdAt||Date.now()).toISOString(),
    updatedAt:new Date().toISOString(),
  };
  added++;
}
if(added>0){
  const bak=postsPath+'.bak-flush-'+Date.now();
  fs.copyFileSync(postsPath,bak);
  fs.writeFileSync(postsPath,JSON.stringify(isArr?Object.values(store):store,null,2));
}
console.log('added to posts.json',added);
const pa=Object.values(store).filter(p=>p.userId===T).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
console.log('newest',pa[0]?.createdAt,pa[0]?.id);
`;

const b64 = Buffer.from(script, "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({ host: "109.199.111.29", port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
