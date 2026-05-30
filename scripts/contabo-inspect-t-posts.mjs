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
const posts=JSON.parse(fs.readFileSync('/var/lib/retweet/db/posts.json','utf8'));
const pa=Array.isArray(posts)?posts:Object.values(posts);
const dbT=pa.filter(p=>p.userId===T&&!p.type||p.type==='post'||p.type==='tweet').sort((a,b)=>(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
const snap=JSON.parse(fs.readFileSync('/var/lib/retweet/snapshots/'+T+'.json','utf8'));
const snapT=(snap.posts||[]).filter(p=>p.userId===T).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
console.log('posts.json @t', dbT.length, 'newest3:', dbT.slice(0,3).map(p=>({id:p.id,at:p.createdAt,text:(p.text||'').slice(0,40)})));
console.log('snapshot @t', snapT.length, 'newest3:', snapT.slice(0,3).map(p=>({id:p.id,at:new Date(p.createdAt).toISOString(),text:(p.text||'').slice(0,40)})));
const snapOnly=snapT.filter(sp=>!dbT.some(dp=>dp.id===sp.id));
console.log('in snapshot NOT in posts.json:', snapOnly.length, snapOnly.slice(0,5).map(p=>({id:p.id,at:new Date(p.createdAt).toISOString()})));
`;

const b64 = Buffer.from(script, "utf8").toString("base64");
const conn = await new Promise((res, rej) => {
  const c = new Client();
  c.on("ready", () => res(c)).on("error", rej);
  c.connect({ host: "109.199.111.29", port: 22, username: "root", password: process.env.CONTABO_SSH_PASSWORD || PASSWORD, readyTimeout: 45000 });
});
console.log(await exec(conn, `echo ${b64} | base64 -d | node`));
conn.end();
