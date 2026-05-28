#!/usr/bin/env node
/** نشر كود الـ backend فقط — بدون استبدال /var/lib/retweet */
import { Client } from "ssh2";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backendDir = path.join(root, "backend");
const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const APP_REMOTE = "/opt/retweet/app";
const PUBLIC_API = process.env.CONTABO_PUBLIC_URL || `http://${HOST}`;

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject);
    c.connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
  });
}

function exec(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (e, s) => {
      if (e) return rej(e);
      let o = "";
      let err = "";
      s.on("data", d => {
        o += d;
        process.stdout.write(d);
      });
      s.stderr.on("data", d => {
        err += d;
        process.stderr.write(d);
      });
      s.on("close", code => {
        if (code !== 0) rej(new Error(`exit ${code}: ${err || o}`));
        else res(o);
      });
    });
  });
}

async function uploadFile(sftp, local, remote) {
  await new Promise((res, rej) => sftp.fastPut(local, remote, e => (e ? rej(e) : res())));
}

async function packBackend() {
  const tgz = path.join(root, "backups-local", "retweet-backend-deploy.tgz");
  await mkdir(path.dirname(tgz), { recursive: true });
  execSync(
    `tar -czf "${tgz}" --exclude=node_modules --exclude=.env --exclude=dist -C "${backendDir}" .`,
    { stdio: "inherit", shell: true },
  );
  return tgz;
}

async function packSharedLib() {
  const tgz = path.join(root, "backups-local", "retweet-shared-lib.tgz");
  execSync(`tar -czf "${tgz}" -C "${root}" src/lib`, { stdio: "inherit", shell: true });
  return tgz;
}

async function main() {
  if (!PASSWORD) {
    console.error("عيّن CONTABO_SSH_PASSWORD");
    process.exit(1);
  }
  const conn = await connect();
  const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
  const backendTgz = await packBackend();
  const sharedTgz = await packSharedLib();
  await uploadFile(sftp, backendTgz, "/tmp/retweet-backend.tgz");
  await uploadFile(sftp, sharedTgz, "/tmp/retweet-shared-lib.tgz");
  await exec(
    conn,
    `mkdir -p ${APP_REMOTE} /opt/retweet/src/lib && tar -xzf /tmp/retweet-backend.tgz -C ${APP_REMOTE} && tar -xzf /tmp/retweet-shared-lib.tgz -C /opt/retweet && cd ${APP_REMOTE} && npm install --omit=dev`,
  );
  await exec(
    conn,
    `pm2 restart retweet-api 2>/dev/null; sleep 3; curl -sf http://127.0.0.1:3000/health | head -c 120 || echo "[backend-only] تأكّد يدوياً: curl http://127.0.0.1:3000/health على السيرفر"`,
  );
  conn.end();
  console.log(`\n✓ Backend only — بيانات /var/lib/retweet لم تُستبدَل — API ${PUBLIC_API}\n`);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
