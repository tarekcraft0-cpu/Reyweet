#!/usr/bin/env node
/**
 * إيقاف/تشغيل retweet-api على VPS بدون لمس /var/lib/retweet
 *
 *   $env:CONTABO_SSH_PASSWORD = "..."
 *   node scripts/contabo-pm2-control.mjs stop
 *   node scripts/contabo-pm2-control.mjs start
 *   node scripts/contabo-pm2-control.mjs status
 */
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const PASS = process.env.CONTABO_SSH_PASSWORD || "";
const action = (process.argv[2] || "status").toLowerCase();

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () => resolve(c)).on("error", reject);
    c.connect({ host: HOST, port: 22, username: "root", password: PASS, readyTimeout: 60000 });
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream.on("data", d => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on("data", d => {
        errOut += d;
        process.stderr.write(d);
      });
      stream.on("close", code => {
        if (code !== 0) reject(new Error(errOut || out || `exit ${code}`));
        else resolve(out);
      });
    });
  });
}

const commands = {
  stop: `pm2 stop retweet-api 2>/dev/null || echo "[pm2] retweet-api غير شغّال"; du -sh /var/lib/retweet 2>/dev/null; echo "[pm2] البيانات محفوظة في /var/lib/retweet"`,
  start: `pm2 start retweet-api 2>/dev/null || pm2 restart retweet-api; sleep 3; curl -sf http://127.0.0.1:3000/health | head -c 200 || echo "[pm2] health فشل — راجع: pm2 logs retweet-api"`,
  status: `pm2 jlist 2>/dev/null | head -c 4000; echo; du -sh /var/lib/retweet/db /var/lib/retweet/snapshots 2>/dev/null; curl -sf -m 5 http://127.0.0.1:3000/health || echo "API غير متاح محلياً"`,
};

async function main() {
  if (!PASS) {
    console.error("عيّن CONTABO_SSH_PASSWORD");
    process.exit(1);
  }
  if (!commands[action]) {
    console.error("الاستخدام: stop | start | status");
    process.exit(1);
  }
  const conn = await connect();
  console.log(`\n[contabo] ${HOST} → ${action}\n`);
  await exec(conn, commands[action]);
  conn.end();
  console.log();
}

main().catch(err => {
  console.error("[contabo]", err.message);
  process.exit(1);
});
