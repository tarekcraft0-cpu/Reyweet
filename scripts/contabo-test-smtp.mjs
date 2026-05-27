#!/usr/bin/env node
import { Client } from "ssh2";

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const script = `
cd /opt/retweet/app && node -e "
import('nodemailer').then(async (nm) => {
  const u = process.env.SMTP_USER || process.env.EMAIL_USER;
  const p = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').replace(/\\s+/g,'');
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE !== '0';
  if (!u || !p) { console.log(JSON.stringify({ok:false,error:'missing creds'})); process.exit(1); }
  const tx = nm.default.createTransport({host,port,secure,auth:{user:u,pass:p}});
  try {
    await tx.verify();
    console.log(JSON.stringify({ok:true,host,port,user:u}));
  } catch (e) {
    console.log(JSON.stringify({ok:false,error:e.message}));
    process.exit(1);
  }
});
"
`.trim();

const conn = new Client();
conn.on("ready", () => {
  conn.exec(`bash -lc ${JSON.stringify(script)}`, (err, stream) => {
    if (err) throw err;
    stream.on("data", d => process.stdout.write(d));
    stream.stderr.on("data", d => process.stderr.write(d));
    stream.on("close", c => { conn.end(); process.exit(c ?? 0); });
  });
}).connect({ host: "109.199.111.29", port: 22, username: "root", password: PASSWORD, readyTimeout: 60000 });
