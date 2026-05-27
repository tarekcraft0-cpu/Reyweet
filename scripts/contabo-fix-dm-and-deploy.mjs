#!/usr/bin/env node
/** إصلاح chatId + إعادة بناء snapshots + نشر backend + frontend */
import { Client } from "ssh2";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject);
    c.connect({
      host: "109.199.111.29",
      port: 22,
      username: "root",
      password: PASSWORD,
      readyTimeout: 45000,
    });
  });
}

function exec(c, cmd) {
  return new Promise((res, rej) => {
    c.exec(cmd, (e, s) => {
      if (e) return rej(e);
      let o = "";
      s.on("data", d => {
        o += d;
        process.stdout.write(d);
      });
      s.stderr.on("data", d => process.stderr.write(d));
      s.on("close", code => (code !== 0 ? rej(new Error(`exit ${code}`)) : res(o)));
    });
  });
}

async function uploadFile(sftp, local, remote) {
  await new Promise((res, rej) => sftp.fastPut(local, remote, e => (e ? rej(e) : res())));
}

async function main() {
  if (!PASSWORD) {
    console.error("CONTABO_SSH_PASSWORD required");
    process.exit(1);
  }

  const conn = await connect();
  const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));

  const scripts = [
    "backend/scripts/repair-dm-message-ids.mjs",
    "backend/scripts/restore-full-database.mjs",
  ];
  for (const rel of scripts) {
    await uploadFile(sftp, path.join(root, rel), `/tmp/${path.basename(rel)}`);
  }

  console.log("\n[1] repair + rebuild snapshots on server…");
  await exec(
    conn,
    "DATA_ROOT=/var/lib/retweet node /tmp/repair-dm-message-ids.mjs",
  );

  console.log("\n[2] deploy backend code…");
  execSync("node scripts/contabo-deploy-backend-only.mjs", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, CONTABO_SSH_PASSWORD: PASSWORD },
  });

  conn.end();

  console.log("\n[3] deploy frontend…");
  execSync("npm run vercel:deploy", { cwd: root, stdio: "inherit" });
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
