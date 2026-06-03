#!/usr/bin/env node
/**
 * يثبّت cron يومي لنسخ احتياطي قاعدة Retweet على VPS.
 * يتطلب CONTABO_SSH_PASSWORD
 */
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const APP_REMOTE = "/opt/retweet/app";
const CRON_LINE =
  "0 3 * * * cd /opt/retweet/app/backend && /usr/bin/node scripts/backup-db.mjs >> /var/log/retweet-backup.log 2>&1";

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

const conn = new Client();
conn
  .on("ready", () => {
    const cmd = `(crontab -l 2>/dev/null | grep -v backup-db.mjs; echo "${CRON_LINE}") | crontab - && crontab -l | grep backup-db`;
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }
      stream.on("close", code => {
        conn.end();
        process.exit(code === 0 ? 0 : 1);
      });
      stream.pipe(process.stdout);
      stream.stderr.pipe(process.stderr);
    });
  })
  .on("error", e => {
    console.error(e);
    process.exit(1);
  })
  .connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 45000 });
