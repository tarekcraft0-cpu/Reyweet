#!/usr/bin/env node
/**
 * يثبّت cron يومي لنسخ احتياطي Retweet على VPS (قاعدة + snapshots + media).
 * يتطلب CONTABO_SSH_PASSWORD
 *
 *   npm run contabo:backup-cron
 */
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const APP_REMOTE = "/opt/retweet/app";
const DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";
const BACKUP_DIR = `${DATA_ROOT}/backups`;
const KEEP_DAYS = process.env.RETWEET_BACKUP_KEEP_DAYS || "14";

/** 03:00 UTC يومياً */
const CRON_LINE = [
  "0 3 * * *",
  `DATA_ROOT=${DATA_ROOT}`,
  `RETWEET_BACKUP_DIR=${BACKUP_DIR}`,
  `RETWEET_BACKUP_KEEP_DAYS=${KEEP_DAYS}`,
  "RETWEET_BACKUP_INCLUDE_MEDIA=1",
  `cd ${APP_REMOTE}`,
  "&& /usr/bin/node scripts/backup-db.mjs",
  ">> /var/log/retweet-backup.log 2>&1",
].join(" ");

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", d => (out += d));
      stream.stderr.on("data", d => (errOut += d));
      stream.on("close", code => {
        if (code !== 0) reject(new Error(errOut || out || `exit ${code}`));
        else resolve(out);
      });
    });
  });
}

const conn = new Client();
conn
  .on("ready", async () => {
    try {
      await exec(
        conn,
        `mkdir -p ${BACKUP_DIR} && touch /var/log/retweet-backup.log`,
      );
      const install = `(crontab -l 2>/dev/null | grep -v backup-db.mjs; echo '${CRON_LINE.replace(/'/g, "'\\''")}') | crontab -`;
      const shown = await exec(conn, `${install} && crontab -l | grep backup-db`);
      console.log("✓ cron مثبت:\n", shown.trim());
      console.log("\nتشغيل نسخة تجريبية الآن…");
      const run = await exec(
        conn,
        `DATA_ROOT=${DATA_ROOT} RETWEET_BACKUP_DIR=${BACKUP_DIR} RETWEET_BACKUP_INCLUDE_MEDIA=1 RETWEET_BACKUP_KEEP_DAYS=${KEEP_DAYS} cd ${APP_REMOTE} && node scripts/backup-db.mjs 2>&1 | tail -5`,
      );
      console.log(run.trim());
      const list = await exec(conn, `ls -lah ${BACKUP_DIR} | tail -6`);
      console.log("\nآخر الملفات في backups:\n", list.trim());
      conn.end();
    } catch (e) {
      console.error(e.message || e);
      conn.end();
      process.exit(1);
    }
  })
  .on("error", e => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 45000 });
