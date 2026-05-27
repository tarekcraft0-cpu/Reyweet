#!/usr/bin/env node
/**
 * استعادة بعد دمج خاطئ: يدمج نسخة /root قبل المزامنة + الحالي على VPS + نسخة من الجهاز.
 *
 * $env:CONTABO_SSH_PASSWORD="..."
 * node scripts/run-vps-data-repair.mjs
 */
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
      let errOut = "";
      stream.on("data", d => process.stdout.write(d));
      stream.stderr.on("data", d => {
        errOut += d;
        process.stderr.write(d);
      });
      stream.on("close", code => {
        if (code !== 0 && code !== undefined) reject(new Error(`exit ${code}: ${errOut}`));
        else resolve();
      });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => (err ? reject(err) : resolve()));
  });
}

async function main() {
  const tgz = path.join(root, "backups-local", `retweet-repair-${Date.now()}.tar.gz`);
  await fs.mkdir(path.dirname(tgz), { recursive: true });

  const driveMatch = /^([A-Za-z]:)/.exec(DATA_LOCAL);
  const dataName = path.basename(DATA_LOCAL);
  const tarParent = driveMatch ? `${driveMatch[1]}/` : path.dirname(DATA_LOCAL);

  console.log("[repair] ضغط db + snapshots من", DATA_LOCAL);
  execSync(`tar -czf "${tgz}" -C "${tarParent}" "${dataName}/db" "${dataName}/snapshots"`, {
    stdio: "inherit",
    shell: true,
  });

  const conn = await connect();
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  const repairScript = path.join(root, "scripts", "repair-merge-logic.js");
  await uploadFile(sftp, repairScript, "/tmp/repair-merge-logic.js");

  const restoreScript = path.join(root, "backend", "scripts", "restore-full-database.mjs");
  await exec(conn, "mkdir -p /opt/retweet/app/scripts");
  await uploadFile(sftp, restoreScript, "/opt/retweet/app/scripts/restore-full-database.mjs");

  const shellPath = path.join(root, "scripts", "vps-remote-repair.sh");
  let shBody = await fs.readFile(shellPath, "utf8");
  shBody = shBody.replace(/\r\n/g, "\n");
  const remoteSh = path.join(root, "backups-local", "vps-remote-repair.unix.sh");
  await fs.writeFile(remoteSh, shBody, "utf8");
  await uploadFile(sftp, remoteSh, "/tmp/vps-remote-repair.sh");

  await uploadFile(sftp, tgz, "/tmp/retweet-repair-sync.tgz");

  console.log("\n[repair] تشغيل الدمج على VPS...");
  await exec(conn, `chmod +x /tmp/vps-remote-repair.sh && DATA_ROOT=${DATA_REMOTE} bash /tmp/vps-remote-repair.sh`);

  conn.end();
  console.log(
    "\n✓ انتهى الإصلاح. حدّث الموقع (Ctrl+Shift+R) أو الإعدادات → استعادة من الخادم.",
  );
}

main().catch(e => {
  console.error("[repair] فشل:", e.message);
  process.exit(1);
});
