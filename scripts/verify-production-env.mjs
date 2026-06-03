#!/usr/bin/env node
/**
 * فحص جاهزية إنتاج iPhone: SMTP / APNs / Stripe على VPS
 */
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const PUBLIC = process.env.CONTABO_PUBLIC_URL || `http://${HOST}`;

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => resolve(conn)).on("error", reject).connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASSWORD,
      readyTimeout: 45000,
    });
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("close", code => (code === 0 ? resolve(out) : reject(new Error(out))));
      stream.on("data", d => {
        out += d;
      });
    });
  });
}

const conn = await connect();
try {
  const health = await exec(conn, `curl -fsS ${PUBLIC}/health`);
  const j = JSON.parse(health);
  console.log("Health:", j);
  const missing = [];
  if (!j.smtpConfigured) missing.push("SMTP");
  if (!j.pushIos) missing.push("APNs (iPhone على VPS)");
  if (!j.pushAndroid) console.warn("ملاحظة: FCM للأندرويد غير مُعدّ (اختياري)");
  if (!j.stripeConfigured) missing.push("Stripe");
  if (!j.dbOk) missing.push("Database");

  const cronOut = await exec(
    conn,
    "crontab -l 2>/dev/null | grep backup-db.mjs || true",
  ).catch(() => "");
  if (!cronOut.trim()) missing.push("Cron نسخ احتياطي يومي (npm run contabo:backup-cron)");

  const backupList = await exec(
    conn,
    "ls -1t /var/lib/retweet/backups/retweet-*.tar.gz 2>/dev/null | head -1",
  ).catch(() => "");
  if (!backupList.trim()) {
    missing.push("لا توجد أرشيفات backup حديثة");
  } else {
    const age = await exec(
      conn,
      `find /var/lib/retweet/backups -maxdepth 1 -name 'retweet-*.tar.gz' -mtime -2 | head -1`,
    ).catch(() => "");
    if (!age.trim()) missing.push("آخر نسخة احتياطية أقدم من يومين");
  }

  if (missing.length) {
    console.error("\nناقص على السيرفر:", missing.join(", "));
    process.exit(1);
  }
  console.log("\n✓ السيرفر جاهز لإنتاج iPhone (بريد + push + دفع + DB + نسخ يومي)");
} finally {
  conn.end();
}
