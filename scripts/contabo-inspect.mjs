#!/usr/bin/env node
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", d => (out += d));
      stream.stderr.on("data", d => (out += d));
      stream.on("close", () => resolve(out.trim()));
    });
  });
}

async function main() {
  if (!PASSWORD) {
    console.error("Set CONTABO_SSH_PASSWORD");
    process.exit(1);
  }
  const conn = await new Promise((res, rej) => {
    const c = new Client();
    c.on("ready", () => res(c)).on("error", rej);
    c.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 45000 });
  });
  const blocks = [
    "echo '=== /root *.tar.gz'; ls -la /root/*.tar.gz 2>/dev/null || echo none",
    "echo '=== /var/lib/retweet/backups'; ls -la /var/lib/retweet/backups 2>/dev/null | head -20 || echo none",
    "echo '=== messages.json'; test -f /var/lib/retweet/db/messages.json && wc -c /var/lib/retweet/db/messages.json || echo missing",
    `node -e "const fs=require('fs');try{const j=JSON.parse(fs.readFileSync('/var/lib/retweet/db/messages.json','utf8'));console.log('message keys:',Object.keys(j).length)}catch(e){console.log('parse err',e.message)}"`,
    "echo '=== pm2'; pm2 list 2>/dev/null || true",
  ];
  for (const cmd of blocks) {
    console.log("\n" + (await exec(conn, cmd)) + "\n");
  }
  conn.end();
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
