#!/usr/bin/env node
import { Client } from "ssh2";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
function exec(c,cmd){return new Promise((r,j)=>{c.exec(cmd,(e,s)=>{if(e)return j(e);let o='';s.on('data',d=>o+=d);s.stderr.on('data',d=>o+=d);s.on('close',()=>r(o.trim()))})})}
const script=`
const fs=require('fs');
const paths=[
  '/var/lib/retweet/media/videos/2510ae91-f281-45ec-867d-b614d96a223a.mp4',
  '/var/lib/retweet/media/videos/53fa4b85-91e7-46e8-a023-05d62080ba00.mp4',
  '/var/lib/retweet/media/images/43e06010-4945-496c-aef7-eb5005e32e0e.webp',
];
for(const p of paths) console.log(p, fs.existsSync(p)?'OK':'MISSING');
try {
  const vids=fs.readdirSync('/var/lib/retweet/media/videos');
  console.log('video count', vids.length, 'sample', vids.slice(0,5));
} catch(e){ console.log('no media/videos dir', e.message); }
try {
  const imgs=fs.readdirSync('/var/lib/retweet/media/images');
  console.log('image count', imgs.length);
} catch(e){ console.log('no media/images', e.message); }
`;
const b64=Buffer.from(script,'utf8').toString('base64');
const conn=await new Promise((r,j)=>{const c=new Client();c.on('ready',()=>r(c)).on('error',j);c.connect({host:'109.199.111.29',port:22,username:'root',password:PASSWORD,readyTimeout:45000})});
console.log(await exec(conn,'echo '+b64+' | base64 -d | node'));
conn.end();
