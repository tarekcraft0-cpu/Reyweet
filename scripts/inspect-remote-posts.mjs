#!/usr/bin/env node
import { Client } from "ssh2";

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const HOST = process.env.CONTABO_HOST || "109.199.111.29";

const script = `
const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('/var/lib/retweet/db/posts.json','utf8'));
const posts=Array.isArray(raw)?raw:(raw.posts||[]);
const withMedia=posts.filter(x=>{
  const u=(x.video||x.image||'').trim();
  return u && (u.includes('media')||/^https?:/.test(u));
});
const patterns={};
for(const x of withMedia){
  const u=(x.video||x.image||'').trim();
  let k='other';
  if(u.startsWith('/media/'))k='relative';
  else if(u.includes('trycloudflare'))k='trycloudflare';
  else if(u.includes('109.199.111.29'))k='contabo';
  else if(u.includes('192.168.'))k='lan';
  else if(u.includes('commondatastorage'))k='google';
  else if(u.startsWith('http'))k='http-other';
  patterns[k]=(patterns[k]||0)+1;
}
console.log(JSON.stringify({total:posts.length,withMedia:withMedia.length,patterns,samples:withMedia.slice(0,8).map(x=>({type:x.type,v:(x.video||'').slice(0,100),i:(x.image||'').slice(0,100)}))},null,2));
`.trim();

const conn = new Client();
conn.on("ready", () => {
  conn.exec(`node -e ${JSON.stringify(script)}`, (err, stream) => {
    if (err) { console.error(err); process.exit(1); }
    stream.on("data", d => process.stdout.write(d));
    stream.stderr.on("data", d => process.stderr.write(d));
    stream.on("close", code => { conn.end(); process.exit(code ?? 0); });
  });
}).connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
