#!/usr/bin/env node
import { Client } from "ssh2";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const T = "u_founder_tareqf";
const AML = "46bcd465-4d34-4c95-a396-15ee5b2f6b41";
function exec(c,cmd){return new Promise((r,j)=>{c.exec(cmd,(e,s)=>{if(e)return j(e);let o='';s.on('data',d=>o+=d);s.on('close',()=>r(o.trim()))})})}
const script=`
const fs=require('fs');
const T='${T}';
const snap=JSON.parse(fs.readFileSync('/var/lib/retweet/snapshots/'+T+'.json','utf8'));
const dm=snap.chats.find(c=>c.members.includes('${AML}'));
if(!dm){console.log('no aml chat'); process.exit(0);}
const hid=dm.hiddenMessageIdsByUser?.[T]||[];
console.log('aml chat msgs', (dm.messages||[]).length, 'hidden for t', hid.length);
if(hid.length) console.log('sample hidden', hid.slice(0,3));
`;
const b64=Buffer.from(script,'utf8').toString('base64');
const conn=await new Promise((r,j)=>{const c=new Client();c.on('ready',()=>r(c)).on('error',j);c.connect({host:'109.199.111.29',port:22,username:'root',password:PASSWORD})});
console.log(await exec(conn,'echo '+b64+' | base64 -d | node'));
conn.end();
