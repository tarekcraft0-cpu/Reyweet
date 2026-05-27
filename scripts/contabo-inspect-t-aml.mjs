#!/usr/bin/env node
/** فحص محادثة t ↔ aml على السيرفر */
import { Client } from "ssh2";

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const T = "u_founder_tareqf";
const AML = "46bcd465-4d34-4c95-a396-15ee5b2f6b41";

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
const AML='${AML}';
function dm(a,b){const[x,y]=a<b?[a,b]:[b,a];return 'dm:'+x+':'+y;}
const cid=dm(T,AML);
const m=JSON.parse(fs.readFileSync('/var/lib/retweet/db/messages.json','utf8'));
const rows=Object.values(m).filter(r=>
  (r.senderId===T&&r.receiverId===AML)||(r.senderId===AML&&r.receiverId===T)||
  r.chatId===cid
);
const byChatId=Object.values(m).filter(r=>r.chatId===cid);
const snapT=JSON.parse(fs.readFileSync('/var/lib/retweet/snapshots/'+T+'.json','utf8'));
const snapA=JSON.parse(fs.readFileSync('/var/lib/retweet/snapshots/'+AML+'.json','utf8'));
function dmChat(snap,uid,peer){
  const c=(snap.chats||[]).find(c=>!c.isGroup&&!c.isChannel&&c.members.includes(uid)&&c.members.includes(peer));
  return c?{id:c.id,msgs:(c.messages||[]).length}:null;
}
console.log(JSON.stringify({
  canonicalChatId: cid,
  messagesJsonBetween: rows.length,
  messagesJsonByCanonicalChatId: byChatId.length,
  snapshotT: dmChat(snapT,T,AML),
  snapshotAml: dmChat(snapA,AML,T),
},null,2));
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
