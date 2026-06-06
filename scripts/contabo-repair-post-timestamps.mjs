#!/usr/bin/env node
/** نشر سكربت الإصلاح وتشغيله على VPS */
import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (!process.env.CONTABO_SSH_PASSWORD && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const PASS = process.env.CONTABO_SSH_PASSWORD || "";
const DRY = process.argv.includes("--dry-run");

function ssh(cmd) {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on("ready", () =>
      c.exec(cmd, (err, s) => {
        if (err) return reject(err);
        let out = "";
        s.on("data", d => (out += d));
        s.stderr.on("data", d => (out += d));
        s.on("close", code => {
          c.end();
          code ? reject(new Error(out || `exit ${code}`)) : resolve(out.trim());
        });
      }),
    );
    c.on("error", reject);
    c.connect({ host: "109.199.111.29", port: 22, username: "root", password: PASS, readyTimeout: 120000 });
  });
}

const script = fs.readFileSync(path.join(root, "backend/scripts/repair-post-created-at.mjs"), "utf8");
const b64 = Buffer.from(script, "utf8").toString("base64");

const remote = `
set -e
set -a; source /opt/retweet/app/.env; set +a
mkdir -p /opt/retweet/app/backend/scripts
echo ${JSON.stringify(b64)} | base64 -d > /opt/retweet/app/backend/scripts/repair-post-created-at.mjs
cd /opt/retweet/app
node backend/scripts/repair-post-created-at.mjs ${DRY ? "--dry-run" : ""}
if [ "${DRY ? "1" : "0"}" = "0" ]; then
  pm2 restart retweet-api >/dev/null
  sleep 4
  curl -sf http://127.0.0.1:3000/health | head -c 80 || echo health-check-failed
fi
`;

console.log(await ssh(remote));
