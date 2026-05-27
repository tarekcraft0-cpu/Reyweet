#!/usr/bin/env node
/** رفع ودمج db + snapshots من المحلي إلى VPS Contabo */
import { Client } from "ssh2";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASS = process.env.CONTABO_SSH_PASSWORD || "";
const DATA_LOCAL = (process.env.DATA_ROOT || "D:/RetweetSocial").replace(/\\/g, "/");
const DATA_REMOTE = "/var/lib/retweet";

if (!PASS) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("error", reject)
      .connect({ host: HOST, port: 22, username: "root", password: PASS, readyTimeout: 120000 });
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", d => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on("data", d => process.stderr.write(d));
      stream.on("close", code => {
        if (code !== 0) reject(new Error(`exit ${code}: ${errOut || out}`));
        else resolve(out);
      });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => (err ? reject(err) : resolve()));
  });
}

const MERGE_JS = `
const fs=require('fs');
const path=require('path');
const DATA=process.env.DATA_ROOT||'/var/lib/retweet';
const SRC=process.env.SYNC_SRC;
if(!SRC) throw new Error('missing SYNC_SRC');

function readJson(p,f){ try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return f;} }
function writeAtomic(p,data){
  const tmp=p+'.sync-'+Date.now()+'.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data,null,2));
  fs.renameSync(tmp,p);
}

// posts
{
  const remoteP=path.join(DATA,'db/posts.json');
  const localP=path.join(SRC,'db/posts.json');
  const remote=readJson(remoteP,[]);
  const local=readJson(localP,[]);
  const rArr=Array.isArray(remote)?remote:Object.values(remote);
  const lArr=Array.isArray(local)?local:Object.values(local);
  const byId=new Map(rArr.map(p=>[p.id,p]));
  let added=0, updated=0;
  for (const p of lArr) {
    if(!p?.id) continue;
    const prev=byId.get(p.id);
    if(!prev){ byId.set(p.id,p); added++; continue; }
    const tL=new Date(p.updatedAt||p.createdAt||0).getTime();
    const tP=new Date(prev.updatedAt||prev.createdAt||0).getTime();
    if(tL>=tP){ byId.set(p.id,{...prev,...p,comments:prev.comments||p.comments||[]}); updated++; }
  }
  const merged=[...byId.values()].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  writeAtomic(remoteP, merged);
  console.log('[merge] posts', merged.length, 'added', added, 'updated', updated);
}

// users
{
  const remoteP=path.join(DATA,'db/users.json');
  const localP=path.join(SRC,'db/users.json');
  const remote=readJson(remoteP,[]);
  const local=readJson(localP,[]);
  const rArr=Array.isArray(remote)?remote:Object.values(remote);
  const lArr=Array.isArray(local)?local:Object.values(local);
  const byId=new Map(rArr.map(u=>[u.id,u]));
  for (const u of lArr) {
    if(!u?.id) continue;
    const prev=byId.get(u.id);
    if(!prev) byId.set(u.id,u);
    else {
      const tL=new Date(u.updatedAt||0).getTime();
      const tP=new Date(prev.updatedAt||0).getTime();
      byId.set(u.id, tL>=tP?{...prev,...u}:prev);
    }
  }
  writeAtomic(remoteP, [...byId.values()]);
  console.log('[merge] users', byId.size);
}

// messages
{
  const remoteP=path.join(DATA,'db/messages.json');
  const localP=path.join(SRC,'db/messages.json');
  const remote=readJson(remoteP,{});
  const local=readJson(localP,{});
  let added=0;
  for (const [id,row] of Object.entries(local)) {
    if(!remote[id]){ remote[id]=row; added++; }
  }
  writeAtomic(remoteP, remote);
  console.log('[merge] messages', Object.keys(remote).length, 'added', added);
}

// stories
{
  const remoteP=path.join(DATA,'db/stories.json');
  const localP=path.join(SRC,'db/stories.json');
  const remote=readJson(remoteP,[]);
  const local=readJson(localP,[]);
  const rArr=Array.isArray(remote)?remote:Object.values(remote);
  const lArr=Array.isArray(local)?local:Object.values(local);
  const byId=new Map(rArr.map(s=>[s.id,s]));
  for (const s of lArr) if(s?.id) byId.set(s.id, byId.get(s.id)?{...byId.get(s.id),...s}:s);
  writeAtomic(remoteP, [...byId.values()]);
  console.log('[merge] stories', byId.size);
}

// likes
{
  const remoteP=path.join(DATA,'db/likes.json');
  const localP=path.join(SRC,'db/likes.json');
  const remote=readJson(remoteP,[]);
  const local=readJson(localP,[]);
  const rArr=Array.isArray(remote)?remote:[];
  const lArr=Array.isArray(local)?local:[];
  const key=r=>r.postId+':'+r.userId;
  const byKey=new Map(rArr.map(r=>[key(r),r]));
  for (const r of lArr) byKey.set(key(r), r);
  writeAtomic(remoteP, [...byKey.values()]);
  console.log('[merge] likes', byKey.size);
}
`;

async function main() {
  const tgz = path.join(root, "backups-local", `retweet-sync-${Date.now()}.tar.gz`);
  await fs.mkdir(path.dirname(tgz), { recursive: true });

  console.log("[sync] ضغط db + snapshots من", DATA_LOCAL);
  const driveMatch = /^([A-Za-z]:)/.exec(DATA_LOCAL);
  const dataName = path.basename(DATA_LOCAL);
  const tarParent = driveMatch ? `${driveMatch[1]}/` : path.dirname(DATA_LOCAL);

  execSync(
    `tar -czf "${tgz}" -C "${tarParent}" "${dataName}/db" "${dataName}/snapshots"`,
    { stdio: "inherit", shell: true },
  );

  const conn = await connect();
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  console.log("\n[sync] نسخة احتياطية VPS…");
  await exec(
    conn,
    `tar -czf /root/retweet-pre-sync-$(date +%Y%m%d-%H%M).tar.gz -C /var/lib retweet 2>/dev/null || true`,
  );

  console.log("\n[sync] رفع…");
  await uploadFile(sftp, tgz, "/tmp/retweet-sync.tgz");

  const mergeScript = path.join(root, "backups-local", "merge-remote.js");
  await fs.writeFile(mergeScript, MERGE_JS, "utf8");
  await uploadFile(sftp, mergeScript, "/tmp/merge-remote.js");

  const restoreLocal = path.join(root, "backend", "scripts", "restore-full-database.mjs");
  await exec(conn, "mkdir -p /opt/retweet/app/scripts");
  await uploadFile(sftp, restoreLocal, "/opt/retweet/app/scripts/restore-full-database.mjs");

  console.log("\n[sync] دمج على السيرفر…");
  await exec(
    conn,
    `
set -e
rm -rf /tmp/retweet-sync-extract
mkdir -p /tmp/retweet-sync-extract
tar -xzf /tmp/retweet-sync.tgz -C /tmp/retweet-sync-extract
export SYNC_SRC=$(find /tmp/retweet-sync-extract -maxdepth 2 -type d -name db | head -1 | xargs dirname)
echo "SYNC_SRC=$SYNC_SRC"
export DATA_ROOT=${DATA_REMOTE}
node /tmp/merge-remote.js
SNAP_SRC=$(find /tmp/retweet-sync-extract -type d -name snapshots | head -1)
if [ -n "$SNAP_SRC" ]; then rsync -a "$SNAP_SRC/" ${DATA_REMOTE}/snapshots/; echo snapshots rsync ok; fi
DATA_ROOT=${DATA_REMOTE} node /opt/retweet/app/scripts/restore-full-database.mjs
pm2 restart retweet-api
sleep 2
curl -sf http://127.0.0.1:3000/health
echo ""
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('${DATA_REMOTE}/db/posts.json','utf8'));const n=Array.isArray(p)?p.length:Object.keys(p).length;const t=Math.max(...(Array.isArray(p)?p:Object.values(p)).map(x=>new Date(x.createdAt||0).getTime()));console.log('VPS posts',n,'latest',new Date(t).toISOString());"
`,
  );

  conn.end();
  console.log("\n✓ اكتمل — افتح https://reyweet.vercel.app وحدّث Ctrl+Shift+R");
}

main().catch(e => {
  console.error("\n[sync] فشل:", e.message);
  process.exit(1);
});
