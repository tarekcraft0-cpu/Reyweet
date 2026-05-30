#!/usr/bin/env node
/**
 * استعادة مستخدم على سيرفر Contabo (بعد نشر backend).
 * Usage: node scripts/contabo-restore-user.mjs nw3
 */
import { Client } from "ssh2";

const username = process.argv[2]?.trim().replace(/^@/, "");
const note = process.argv.includes("--note")
  ? process.argv[process.argv.indexOf("--note") + 1]
  : "مراجعة دعم — استعادة بعد ظلم";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const APP_REMOTE = "/opt/retweet/app";

if (!PASSWORD) {
  console.error("Set CONTABO_SSH_PASSWORD");
  process.exit(1);
}
if (!username) {
  console.error("Usage: node scripts/contabo-restore-user.mjs <username> [--note text]");
  process.exit(1);
}

const remoteCmd = `cd ${APP_REMOTE} && DATA_ROOT=/var/lib/retweet npx tsx scripts/restore-moderation-user.mjs ${username} --note ${JSON.stringify(note)}`;

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(remoteCmd, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      stream.on("close", code => {
        conn.end();
        process.exit(code ?? 0);
      });
      stream.on("data", d => process.stdout.write(d));
      stream.stderr.on("data", d => process.stderr.write(d));
    });
  })
  .on("error", e => {
    console.error("[ssh]", e.message);
    process.exit(1);
  })
  .connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
