#!/usr/bin/env node
/** تشخيص VPS — قراءة فقط */
import { Client } from "ssh2";
import fs from "node:fs";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASS = process.env.CONTABO_SSH_PASSWORD || process.argv[2] || "";

if (!PASS) {
  console.error("Usage: CONTABO_SSH_PASSWORD=... node scripts/vps-diagnose-readonly.mjs");
  process.exit(1);
}

const script = `set -e
echo "=== SYSTEM ==="
hostname; date -u
echo "=== PM2 ==="
pm2 list 2>/dev/null || echo "no pm2"
echo "=== DOCKER ==="
docker ps -a 2>/dev/null || echo "no docker"
docker volume ls 2>/dev/null || true
echo "=== /var/lib/retweet ==="
ls -la /var/lib/retweet 2>/dev/null | head -25 || echo "missing"
ls -la /var/lib/retweet/db 2>/dev/null | head -20 || echo "no db dir"
echo "=== FILE MTIMES db ==="
stat /var/lib/retweet/db/users.json /var/lib/retweet/db/posts.json /var/lib/retweet/db/messages.json 2>/dev/null || true
echo "=== find .env ==="
find /opt/retweet -name '.env' 2>/dev/null
echo "=== BACKEND .env ==="
for f in /opt/retweet/app/backend/.env /opt/retweet/backend/.env /opt/retweet/.env /opt/retweet/app/.env; do
  if [ -f "$f" ]; then echo "--- $f ---"; cat "$f"; fi
done
echo "=== ecosystem ==="
cat /opt/retweet/app/ecosystem.config.cjs 2>/dev/null || true
pm2 describe retweet-api 2>/dev/null | head -50 || true
echo "=== backups ==="
ls -lah /var/lib/retweet/backups/ 2>/dev/null || true
echo "=== PM2 ENV (retweet) ==="
pm2 jlist 2>/dev/null | head -c 8000 || true
echo "=== HEALTH local ==="
curl -sS -m 8 http://127.0.0.1:3000/health || echo "3000 fail"
curl -sS -m 8 http://127.0.0.1/health 2>/dev/null || true
echo "=== NGINX ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
grep -h . /etc/nginx/sites-enabled/* 2>/dev/null | head -40 || true
echo "=== RECENT ARCHIVES (7d) ==="
find /var/lib/retweet /opt/retweet /root -maxdepth 4 \\( -name "*.tar.gz" -o -name "*.sql" -o -name "*.dump" \\) -mtime -7 2>/dev/null | head -40
echo "=== BASH HISTORY (retweet/tar) ==="
grep -E "tar|restore|import|dump|rsync|retweet|var/lib" /root/.bash_history 2>/dev/null | tail -40 || echo "no history"
echo "=== RECORD COUNTS (node) ==="
node -e "
const fs=require('fs');
const p='/var/lib/retweet/db';
for (const f of ['users.json','posts.json','messages.json','follows.json']) {
  try {
    const raw=fs.readFileSync(p+'/'+f,'utf8');
    const j=JSON.parse(raw);
    const n=Array.isArray(j)?j.length:Object.keys(j).length;
    let latest='';
    if (f==='posts.json') {
      const arr=Array.isArray(j)?j:Object.values(j);
      const t=arr.map(x=>new Date(x.createdAt||0).getTime()).filter(Boolean).sort((a,b)=>b-a)[0];
      if (t) latest=new Date(t).toISOString();
    }
    if (f==='messages.json') {
      const arr=Object.values(j);
      const t=arr.map(x=>new Date(x.createdAt||0).getTime()).filter(Boolean).sort((a,b)=>b-a)[0];
      if (t) latest=new Date(t).toISOString();
    }
    console.log(f, 'count=', n, 'latest=', latest||'n/a');
  } catch(e) { console.log(f, 'ERR', e.message); }
}
const snapDir='/var/lib/retweet/snapshots';
try {
  const n=fs.readdirSync(snapDir).filter(x=>x.endsWith('.json')).length;
  console.log('snapshots count=', n);
} catch(e) { console.log('snapshots ERR', e.message); }
"
`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(script, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      stream.on("data", d => process.stdout.write(d));
      stream.stderr.on("data", d => process.stderr.write(d));
      stream.on("close", code => {
        conn.end();
        process.exit(code || 0);
      });
    });
  })
  .on("error", e => {
    console.error("SSH failed:", e.message);
    process.exit(1);
  })
  .connect({ host: HOST, port: 22, username: "root", password: PASS, readyTimeout: 60000 });
