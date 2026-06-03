#!/usr/bin/env node
/**
 * تحديث بريد مستخدم على سيرفر Contabo.
 * Usage: node scripts/contabo-update-user-email.mjs 5vp irrichcaushu@gmail.com
 */
import { Client } from "ssh2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const username = process.argv[2]?.trim().replace(/^@/, "");
const newEmail = process.argv[3]?.trim().toLowerCase();

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const APP_REMOTE = "/opt/retweet/app";
const REMOTE_SCRIPT = "/tmp/update-user-email.mjs";

if (!PASSWORD) {
  console.error("Set CONTABO_SSH_PASSWORD");
  process.exit(1);
}
if (!username || !newEmail?.includes("@")) {
  console.error("Usage: node scripts/contabo-update-user-email.mjs <username> <new-email>");
  process.exit(1);
}

const localScript = path.join(root, "backend/scripts/update-user-email.mjs");
const scriptBody = readFileSync(localScript, "utf8");

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject);
    c.connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
  });
}

function exec(conn, cmd) {
  return new Promise((res, rej) => {
    conn.exec(cmd, (e, s) => {
      if (e) return rej(e);
      let err = "";
      s.on("data", d => process.stdout.write(d));
      s.stderr.on("data", d => {
        err += d;
        process.stderr.write(d);
      });
      s.on("close", code => (code !== 0 ? rej(new Error(err || `exit ${code}`)) : res()));
    });
  });
}

function sftpWrite(conn, remote, content) {
  return new Promise((res, rej) => {
    conn.sftp((e, sftp) => {
      if (e) return rej(e);
      const ws = sftp.createWriteStream(remote, { mode: 0o644 });
      ws.on("close", () => res());
      ws.on("error", rej);
      ws.end(content, "utf8");
    });
  });
}

const conn = await connect();
try {
  await sftpWrite(conn, REMOTE_SCRIPT, scriptBody);
  await exec(
    conn,
    `DATA_ROOT=/var/lib/retweet node ${REMOTE_SCRIPT} ${JSON.stringify(username)} ${JSON.stringify(newEmail)}`,
  );
  await exec(conn, "pm2 restart retweet-api 2>/dev/null || true");
  console.log("\n[ok] email updated on server");
} finally {
  conn.end();
}
