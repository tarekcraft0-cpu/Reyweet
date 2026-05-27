#!/usr/bin/env node
/** يتحقق من وجود ملفات /media/videos المشار إليها في posts.json على السيرفر */
import { Client } from "ssh2";
import { readFileSync } from "node:fs";

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const localDb = process.argv[2] || "D:/RetweetSocial/db/posts.json";

const raw = JSON.parse(readFileSync(localDb, "utf8"));
const posts = Array.isArray(raw) ? raw : raw.posts || [];
const paths = new Set();
for (const p of posts) {
  for (const field of [p.video, p.image]) {
    const m = String(field || "").match(/(\/media\/(?:videos|images)\/[^\s?#"']+)/i);
    if (m) paths.add(m[1]);
  }
}
const list = [...paths].slice(0, 40);
const checkCmd = list
  .map(rel => {
    const f = `/var/lib/retweet/media${rel.replace(/^\/media/, "")}`;
    return `[ -f '${f}' ] && echo OK:${rel} || echo MISSING:${rel}`;
  })
  .join("; ");

const conn = new Client();
conn.on("ready", () => {
  conn.exec(checkCmd, (err, stream) => {
    if (err) { console.error(err); process.exit(1); }
    let out = "";
    stream.on("data", d => { out += d; process.stdout.write(d); });
    stream.on("close", () => {
      const missing = out.split(/\r?\n/).filter(l => l.startsWith("MISSING:"));
      const ok = out.split(/\r?\n/).filter(l => l.startsWith("OK:"));
      console.log(`\nSummary: ${ok.length} exist, ${missing.length} missing (of ${list.length} checked)`);
      conn.end();
    });
  });
}).connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
