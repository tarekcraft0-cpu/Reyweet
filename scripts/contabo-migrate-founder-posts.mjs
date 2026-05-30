#!/usr/bin/env node
/** فحص + ترحيل منشورات u_t_account على Contabo */
import { Client } from "ssh2";

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const LEGACY = "u_t_account";
const FOUNDER = "u_founder_tareqf";

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
const LEGACY='${LEGACY}';
const FOUNDER='${FOUNDER}';
const postsPath='/var/lib/retweet/db/posts.json';
const raw=JSON.parse(fs.readFileSync(postsPath,'utf8'));
const map=Array.isArray(raw)?Object.fromEntries(raw.map(p=>[p.id,p])):raw;
const rows=Object.values(map);
const by=(id)=>rows.filter(p=>p.userId===id).sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
const legacy=by(LEGACY);
const founder=by(FOUNDER);
console.log('legacy count', legacy.length, 'newest', legacy[0]?.createdAt||null);
console.log('founder count', founder.length, 'newest', founder[0]?.createdAt||null);
let moved=0;
for (const [id, row] of Object.entries(map)) {
  if (row?.userId!==LEGACY) continue;
  map[id]={...row,userId:FOUNDER,updatedAt:new Date().toISOString()};
  moved++;
}
if (moved>0) {
  const bak=postsPath+'.bak-founder-'+Date.now();
  fs.copyFileSync(postsPath,bak);
  fs.writeFileSync(postsPath,JSON.stringify(map,null,2));
  console.log('MIGRATED', moved, 'backup', bak);
} else console.log('Nothing to migrate');
`;

const b64 = Buffer.from(script, "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({ host: "109.199.111.29", port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
