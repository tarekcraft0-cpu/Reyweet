#!/usr/bin/env node
/**
 * رفع مفتاح APNs إلى VPS ودمجه في /opt/retweet/app/.env
 *
 * ضع الملف محلياً:
 *   secrets/apns/AuthKey_XXXXXXXXXX.p8
 *
 * وعيّن قبل التشغيل (أو في backend/.env.local غير المرفوع):
 *   APNS_KEY_ID=...
 *   APNS_TEAM_ID=...
 *   APNS_BUNDLE_ID=com.reyweet.app
 *   APNS_PRODUCTION=1
 *   CONTABO_SSH_PASSWORD=...
 *
 *   npm run contabo:configure-apns
 */
import { Client } from "ssh2";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const secretsDir = path.join(root, "secrets", "apns");

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";

function loadLocalEnv() {
  const map = {};
  for (const rel of [".env", "backend/.env", "backend/.env.local"]) {
    const p = path.join(root, rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return { ...map, ...process.env };
}

function findP8File() {
  const explicit = (process.env.APNS_KEY_PATH || "").trim();
  if (explicit && existsSync(explicit)) return explicit;
  if (!existsSync(secretsDir)) return null;
  const files = readdirSync(secretsDir).filter(f => f.endsWith(".p8"));
  if (files.length === 1) return path.join(secretsDir, files[0]);
  if (files.length > 1) {
    const named = files.find(f => f.startsWith("AuthKey"));
    return named ? path.join(secretsDir, named) : null;
  }
  return null;
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

async function upload(sftp, local, remote) {
  await new Promise((res, rej) => sftp.fastPut(local, remote, e => (e ? rej(e) : res())));
}

async function main() {
  const env = loadLocalEnv();
  const keyId = (env.APNS_KEY_ID || "").trim();
  const teamId = (env.APNS_TEAM_ID || "").trim();
  const bundleId = (env.APNS_BUNDLE_ID || "com.reyweet.app").trim();
  const production = env.APNS_PRODUCTION ?? "1";
  const p8Local = findP8File();

  if (!PASSWORD) {
    console.error("عيّن CONTABO_SSH_PASSWORD");
    process.exit(1);
  }
  if (!keyId || !teamId) {
    console.error("عيّن APNS_KEY_ID و APNS_TEAM_ID في backend/.env.local أو secrets/");
    process.exit(1);
  }
  if (!p8Local) {
    mkdirSync(secretsDir, { recursive: true });
    console.error(`ضع ملف .p8 في: ${secretsDir}`);
    process.exit(1);
  }

  const remoteKey = `/opt/retweet/secrets/AuthKey_${keyId}.p8`;
  const conn = await new Promise((res, rej) => {
    const c = new Client();
    c.on("ready", () => res(c)).on("error", rej);
    c.connect({ host: HOST, port: 22, username: USER, password: PASSWORD, readyTimeout: 45000 });
  });
  const sftp = await new Promise((res, rej) => {
    conn.sftp((e, s) => (e ? rej(e) : res(s)));
  });

  await exec(conn, "mkdir -p /opt/retweet/secrets && chmod 700 /opt/retweet/secrets");
  await upload(sftp, p8Local, remoteKey);
  await exec(conn, `chmod 600 ${remoteKey}`);

  const patch = [
    `APNS_KEY_ID=${keyId}`,
    `APNS_TEAM_ID=${teamId}`,
    `APNS_BUNDLE_ID=${bundleId}`,
    `APNS_KEY_PATH=${remoteKey}`,
    `APNS_PRODUCTION=${production}`,
    `APNS_NOTIFICATION_SOUND=${env.APNS_NOTIFICATION_SOUND || env.FCM_NOTIFICATION_SOUND || "default"}`,
    "# APP_STATE_MESSAGES_PER_CHAT removed — unlimited chat history",
  ];

  const sh = `
    ENV=/opt/retweet/app/.env
    cp "$ENV" "$ENV.bak.$(date +%s)" 2>/dev/null || true
    grep -v '^APNS_' "$ENV" | grep -v '^APP_STATE_MESSAGES_PER_CHAT=' > /tmp/retweet.env || true
    cat /tmp/retweet.env > "$ENV"
    ${patch.map(l => `echo '${l.replace(/'/g, "'\\''")}' >> "$ENV"`).join("\n")}
    pm2 restart retweet-api
    sleep 2
    curl -sf http://127.0.0.1:3000/health
  `;
  const health = await exec(conn, sh);
  console.log(health.trim());
  conn.end();
  console.log("\n✓ APNs مُضبط على VPS. تحقق: pushIos:true في /health");
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
