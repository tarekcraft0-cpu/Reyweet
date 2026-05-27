#!/usr/bin/env node
/**
 * فحص سلسلة البيانات: Vercel → API → قاعدة JSON على VPS → حفظ/قراءة.
 */
import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const VPS_API = process.env.CONTABO_PUBLIC_URL || `http://${HOST}`;
const VERCEL = "https://reyweet.vercel.app";

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!process.env.CONTABO_SSH_PASSWORD && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnv();
const pass = process.env.CONTABO_SSH_PASSWORD || PASSWORD;

function exec(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (e, s) => {
      if (e) return rej(e);
      let o = "";
      let err = "";
      s.on("data", d => (o += d));
      s.stderr.on("data", d => (err += d));
      s.on("close", code => {
        if (code !== 0) rej(new Error(`exit ${code}: ${err || o}`));
        else res(o.trim());
      });
    });
  });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 200) };
}

const remoteScript = `
const fs=require('fs');
const path=require('path');
const {execSync}=require('child_process');
const DATA='/var/lib/retweet';
const DB=path.join(DATA,'db');
const files=['users.json','posts.json','messages.json','follows.json','follow_requests.json','stories.json','likes.json','streaks.json'];
const out={ ok:true, errors:[], checks:{} };

function readJson(p,fallback){
  try{
    const raw=fs.readFileSync(p,'utf8').replace(/^\\uFEFF/,'').trim();
    if(!raw) return fallback;
    JSON.parse(raw);
    return JSON.parse(raw);
  }catch(e){
    out.errors.push(p+': '+e.message);
    return null;
  }
}

for(const f of files){
  const p=path.join(DB,f);
  const exists=fs.existsSync(p);
  let size=0, valid=false;
  if(exists){
    size=fs.statSync(p).size;
    const d=readJson(p,f==='users'||f==='posts'||f==='messages'?{}:[]);
    valid=d!==null;
  }
  out.checks[f]={exists,size,valid};
}

const users=readJson(path.join(DB,'users.json'),{});
const userList=Array.isArray(users)?users:Object.values(users);
out.checks.usersCount=userList.length;

const follows=readJson(path.join(DB,'follows.json'),[])||[];
out.checks.followsCount=Array.isArray(follows)?follows.length:0;

const msgs=readJson(path.join(DB,'messages.json'),{})||{};
out.checks.messagesCount=typeof msgs==='object'&&!Array.isArray(msgs)?Object.keys(msgs).length:0;

const posts=readJson(path.join(DB,'posts.json'),{})||{};
const postList=Array.isArray(posts)?posts:Object.values(posts);
out.checks.postsCount=postList.length;

const stories=readJson(path.join(DB,'stories.json'),[])||[];
out.checks.storiesCount=Array.isArray(stories)?stories.length:0;

const snapDir=path.join(DATA,'snapshots');
out.checks.snapshotsDir=fs.existsSync(snapDir);
out.checks.snapshotFiles=fs.existsSync(snapDir)?fs.readdirSync(snapDir).filter(f=>f.endsWith('.json')).length:0;

const t=userList.find(u=>u.username==='t'||u.username==='T');
if(t){
  const followers=follows.filter(f=>f.followeeId===t.id);
  out.checks.userT={id:t.id,username:t.username,followersInDb:followers.length};
}else{
  out.checks.userT=null;
}

// اختبار كتابة مؤقتة (ثم حذف)
const probe=path.join(DATA,'.write-probe-'+Date.now()+'.tmp');
try{
  fs.writeFileSync(probe,'ok','utf8');
  fs.unlinkSync(probe);
  out.checks.dataRootWritable=true;
}catch(e){
  out.checks.dataRootWritable=false;
  out.errors.push('write-probe: '+e.message);
}

try{
  out.checks.pm2=execSync('pm2 jlist 2>/dev/null',{encoding:'utf8',maxBuffer:2e6});
  const procs=JSON.parse(out.checks.pm2);
  const api=procs.find(p=>p.name==='retweet-api');
  out.checks.pm2Status=api?.pm2_env?.status||'missing';
  delete out.checks.pm2;
}catch(e){
  out.checks.pm2Status='error';
  out.errors.push('pm2: '+e.message);
}

try{
  out.checks.localHealth=JSON.parse(execSync('curl -sf http://127.0.0.1:3000/health',{encoding:'utf8'}));
}catch(e){
  out.checks.localHealth=null;
  out.errors.push('localHealth: '+e.message);
}

out.ok=out.errors.length===0 && out.checks.dataRootWritable && out.checks.pm2Status==='online';
console.log(JSON.stringify(out,null,2));
`;

async function main() {
  const report = { timestamp: new Date().toISOString(), steps: [], summary: { ok: true } };

  // 1) Health VPS
  const vpsHealth = await fetchJson(`${VPS_API}/health`);
  report.steps.push({
    name: "health_vps_direct",
    ok: vpsHealth.ok && vpsHealth.json?.dbOk === true,
    status: vpsHealth.status,
    body: vpsHealth.json,
  });

  // 2) Health via Vercel proxy
  const vercelHealth = await fetchJson(`${VERCEL}/health`);
  report.steps.push({
    name: "health_vercel_proxy",
    ok: vercelHealth.ok && vercelHealth.json?.dbOk === true,
    status: vercelHealth.status,
    body: vercelHealth.json,
  });

  // 3) SSH DB audit
  if (!pass) {
    report.steps.push({ name: "ssh_db_audit", ok: false, error: "CONTABO_SSH_PASSWORD missing" });
  } else {
    const conn = await new Promise((res, rej) => {
      const c = new Client();
      c.on("ready", () => res(c)).on("error", rej);
      c.connect({ host: HOST, port: 22, username: "root", password: pass, readyTimeout: 45000 });
    });
    const b64 = Buffer.from(remoteScript, "utf8").toString("base64");
    const raw = await exec(conn, `echo ${b64} | base64 -d | node`);
    conn.end();
    const dbAudit = JSON.parse(raw);
    report.steps.push({
      name: "ssh_db_audit",
      ok: dbAudit.ok,
      body: dbAudit,
    });

    // 4) Cross-check: DB followers for @t vs API (needs token — skip if no test user)
    const tInfo = dbAudit.checks?.userT;
    if (tInfo?.id) {
      const userApi = await fetchJson(`${VPS_API}/v1/users/${encodeURIComponent(tInfo.id)}`, {
        headers: { Authorization: "Bearer invalid" },
      });
      report.steps.push({
        name: "api_users_by_id_auth_required",
        ok: userApi.status === 401,
        status: userApi.status,
        note: "endpoint exists and requires auth",
      });
    }
  }

  // Consistency: VPS health usersCount vs ssh
  const sshStep = report.steps.find(s => s.name === "ssh_db_audit");
  const vpsStep = report.steps.find(s => s.name === "health_vps_direct");
  if (sshStep?.body?.checks?.usersCount != null && vpsStep?.body?.usersCount != null) {
    const match = sshStep.body.checks.usersCount === vpsStep.body.usersCount;
    report.steps.push({
      name: "users_count_consistency",
      ok: match,
      dbFile: sshStep.body.checks.usersCount,
      healthEndpoint: vpsStep.body.usersCount,
    });
  }

  for (const s of report.steps) {
    if (!s.ok) report.summary.ok = false;
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.ok ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
