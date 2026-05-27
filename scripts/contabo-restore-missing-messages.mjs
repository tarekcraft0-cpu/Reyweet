#!/usr/bin/env node
/**
 * استعادة رسائل مفقودة من أغنى أرشيف على السيرفر (pre-sync) ثم إعادة بناء snapshots.
 */
import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const HOST = process.env.CONTABO_HOST || "109.199.111.29";

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c))
      .on("error", reject)
      .connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
  });
}

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

async function uploadFile(sftp, local, remote) {
  await new Promise((res, rej) => sftp.fastPut(local, remote, e => (e ? rej(e) : res())));
}

async function main() {
  if (!PASSWORD) {
    console.error("عيّن CONTABO_SSH_PASSWORD");
    process.exit(1);
  }

  const mergeScript = path.join(root, "backend/scripts/merge-db-directory.mjs");
  const restoreScript = path.join(root, "backend/scripts/restore-full-database.mjs");
  const snapRestore = path.join(root, "backend/scripts/restore-messages-from-snapshots.mjs");

  const conn = await connect();
  const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));

  for (const [local, remote] of [
    [mergeScript, "/tmp/merge-db-directory.mjs"],
    [restoreScript, "/tmp/restore-full-database.mjs"],
    [snapRestore, "/tmp/restore-messages-from-snapshots.mjs"],
  ]) {
    await uploadFile(sftp, local, remote);
  }

  const listScript =
    "find /root -maxdepth 1 -type f -name 'retweet-pre-sync-*.tar.gz' -printf '%T@\\t%p\\n' 2>/dev/null | sort -n | tail -1 | cut -f2-";
  const richest = await exec(conn, `bash -lc ${JSON.stringify(listScript)}`);
  if (!richest) {
    console.error("لا يوجد retweet-pre-sync على السيرفر");
    process.exit(2);
  }

  console.log("[restore-msgs] أغنى أرشيف pre-sync:", richest);

  const block = [
    "set -e",
    "rm -rf /tmp/retweet-richest",
    "mkdir -p /tmp/retweet-richest",
    `tar -xzf '${richest.replace(/'/g, "'\\''")}' -C /tmp/retweet-richest`,
    "MSG=$(find /tmp/retweet-richest -path '*/db/messages.json' -type f | head -1)",
    '[ -n "$MSG" ] || { echo "no messages.json"; exit 1; }',
    'ROOT=$(dirname "$(dirname "$MSG")")',
    "echo MERGE_SRC=$ROOT",
    "DATA_ROOT=/var/lib/retweet MERGE_SRC=\"$ROOT\" node /tmp/merge-db-directory.mjs",
    "DATA_ROOT=/var/lib/retweet node /tmp/restore-messages-from-snapshots.mjs",
    "DATA_ROOT=/var/lib/retweet node /tmp/restore-full-database.mjs",
    "pm2 restart retweet-api 2>/dev/null || true",
    "sleep 2",
    "node -e \"const fs=require('fs');const m=JSON.parse(fs.readFileSync('/var/lib/retweet/db/messages.json','utf8'));console.log('messages:',Object.keys(m).length)\"",
    "curl -sf http://127.0.0.1:3000/health || echo health-fail",
    "rm -rf /tmp/retweet-richest",
  ].join("\n");

  const b64 = Buffer.from(block, "utf8").toString("base64");
  console.log(await exec(conn, `echo ${b64} | base64 -d | bash`));
  conn.end();
  console.log("\n[restore-msgs] تم — حدّث التطبيق Ctrl+Shift+R\n");
}

main().catch(e => {
  console.error("[restore-msgs]", e.message);
  process.exit(1);
});
