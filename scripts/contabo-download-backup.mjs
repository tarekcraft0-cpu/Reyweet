#!/usr/bin/env node
/**
 * نسخة احتياطية من بيانات السيرفر (/var/lib/retweet) وتنزيلها محلياً.
 *
 *   $env:CONTABO_SSH_PASSWORD = "..."
 *   npm run contabo:download-backup
 *   npm run contabo:download-backup -- --full   # يشمل media + uploads
 */
import { Client } from "ssh2";
import fs from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const DATA_ROOT_REMOTE = "/var/lib/retweet";
const includeFull = process.argv.includes("--full");

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("error", reject)
      .connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 45000 });
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream
        .on("close", code => {
          if (code !== 0) reject(new Error(`exit ${code}: ${errOut || out || cmd}`));
          else resolve(out);
        })
        .on("data", d => {
          out += d;
        })
        .stderr.on("data", d => {
          errOut += d;
        });
    });
  });
}

function downloadFile(sftp, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    let transferred = 0;
    let lastPct = -1;
    const read = sftp.createReadStream(remotePath, { highWaterMark: 1024 * 512 });
    const write = fs.createWriteStream(localPath);
    read.on("data", chunk => {
      transferred += chunk.length;
    });
    read.on("error", reject);
    write.on("error", reject);
    write.on("close", resolve);
    sftp.stat(remotePath, (err, st) => {
      if (err) return reject(err);
      const total = st.size || 0;
      read.on("data", () => {
        if (!total) return;
        const pct = Math.floor((transferred / total) * 100);
        if (pct >= lastPct + 5 || pct === 100) {
          lastPct = pct;
          process.stdout.write(`\r[download] ${pct}% (${formatBytes(transferred)} / ${formatBytes(total)})`);
        }
      });
      read.pipe(write);
    });
  });
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function main() {
  if (!PASSWORD) {
    console.error("عيّن CONTABO_SSH_PASSWORD ثم: npm run contabo:download-backup");
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const localDir = path.join(root, "backups-local");
  await mkdir(localDir, { recursive: true });
  const localName = `retweet-server-${stamp}${includeFull ? "-full" : ""}.tar.gz`;
  const localPath = path.join(localDir, localName);
  const remotePath = `/tmp/${localName}`;

  const conn = await connect();
  console.log(`\n[backup] السيرفر: ${HOST}`);
  console.log(`[backup] المصدر: ${DATA_ROOT_REMOTE}`);
  console.log(`[backup] النطاق: ${includeFull ? "db + snapshots + media + uploads" : "db + snapshots"}\n`);

  const sizeOut = await exec(
    conn,
    `du -sh ${DATA_ROOT_REMOTE}/db ${DATA_ROOT_REMOTE}/snapshots ${DATA_ROOT_REMOTE}/media ${DATA_ROOT_REMOTE}/uploads 2>/dev/null || true`,
  ).catch(() => "");
  if (sizeOut.trim()) {
    console.log("[backup] أحجام على السيرفر:");
    for (const line of sizeOut.trim().split("\n")) console.log("  ", line);
    console.log();
  }

  const tarItems = includeFull ? "retweet" : "--exclude=retweet/media --exclude=retweet/uploads retweet";
  console.log("[backup] ضغط البيانات على السيرفر… (قد يستغرق دقائق)");
  await exec(
    conn,
    `tar --warning=no-file-changed -czf '${remotePath}' -C /var/lib ${tarItems} 2>/dev/null; test -s '${remotePath}' && ls -lh '${remotePath}' || (echo "tar failed" && exit 2)`,
  );

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  console.log(`\n[backup] تنزيل إلى:\n  ${localPath}\n`);
  await downloadFile(sftp, remotePath, localPath);
  process.stdout.write("\n");

  await exec(conn, `rm -f '${remotePath}'`).catch(() => undefined);
  conn.end();

  const st = await stat(localPath);
  console.log(`\n[backup] تم — ${formatBytes(st.size)}`);
  console.log(`[backup] الملف: ${localPath}\n`);
}

main().catch(err => {
  console.error("[backup] فشل:", err.message);
  process.exit(1);
});
