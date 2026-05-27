#!/usr/bin/env node
/**
 * استعادة بيانات المحادثات والمنشورات من أقدم نسخ tar.gz على VPS (قبل أن يستبدل النشر المجلد).
 *
 *   $env:CONTABO_SSH_PASSWORD = "..."
 *   npm run contabo:recover
 *
 * يدمج بالترتيب الزمني (الأقدم ثم الأحدث) كل الأرشيفات الموجودة تحت:
 *   /root/retweet-pre-sync-*.tar.gz  /root/retweet-before-repair-*.tar.gz  /var/lib/retweet/backups/retweet-*.tar.gz
 * ثم يشغّل restore-full-database لإعادة بناء snapshots.
 */
import { Client } from "ssh2";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";

const DATA_ROOT_REMOTE = "/var/lib/retweet";

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

async function uploadFile(sftp, localPath, remotePath) {
  await new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => (err ? reject(err) : resolve()));
  });
}

async function main() {
  if (!PASSWORD) {
    console.error("عيّن CONTABO_SSH_PASSWORD ثم: npm run contabo:recover");
    process.exit(1);
  }

  const mergeScript = path.join(root, "backend", "scripts", "merge-db-directory.mjs");
  const restoreScript = path.join(root, "backend", "scripts", "restore-full-database.mjs");
  if (!fs.existsSync(mergeScript) || !fs.existsSync(restoreScript)) {
    console.error("ملفات السكربت ناقصة في المستودع");
    process.exit(1);
  }

  const conn = await connect();
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  await uploadFile(sftp, mergeScript, "/tmp/merge-db-directory.mjs");
  await uploadFile(sftp, restoreScript, "/tmp/restore-full-database.mjs");

  /** find + sort أبسط من glob في for — يعمل دائماً على bash */
  const listScript = String.raw`find /root /var/lib/retweet/backups -maxdepth 1 -type f \( -name 'retweet-pre-sync-*.tar.gz' -o -name 'retweet-before-repair-*.tar.gz' -o -name 'retweet-*.tar.gz' \) -printf '%T@\t%p\n' 2>/dev/null | sort -n | cut -f2-`;

  const listed = await exec(conn, `bash -lc ${JSON.stringify(listScript)}`);
  const archives = listed
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (!archives.length) {
    console.log(`
لم يُعثر على أرشيفات على السيرفر.
الأماكن المتوقعة:
  /root/retweet-pre-sync-*.tar.gz   (يُنشأ تلقائياً بعد تحديث نشر contabo)
  /root/retweet-before-repair-*.tar.gz
  /var/lib/retweet/backups/retweet-*.tar.gz   (إن وُجد cron لـ backup-db)

على جهازك Windows قد توجد نسخة كاملة في:
  المشروع\\\\backups-local\\\\retweet-full-*.tar.gz
 — فكّها وارفع مجلد db يدوياً أو شغّل الدمج محلياً بـ:
   set DATA_ROOT=D:\\\\RetweetSocial
   set MERGE_SRC=...\\\\RetweetSocial
   node backend/scripts/merge-db-directory.mjs
`);
    conn.end();
    process.exit(2);
  }

  console.log(`\n[recover] وُجد ${archives.length} أرشيفاً — دمج بالترتيب من الأقدم للأحدث:\n`);
  for (const a of archives) console.log("  •", a);

  for (const arch of archives) {
    const safe = arch.replace(/'/g, "'\\''");
    const mergeBlock = [
      "set -e",
      "rm -rf /tmp/retweet-recover-extract",
      "mkdir -p /tmp/retweet-recover-extract",
      `tar -xzf '${safe}' -C /tmp/retweet-recover-extract 2>/dev/null || { echo skip; exit 0; }`,
      "MSG=$(find /tmp/retweet-recover-extract -path '*/db/messages.json' -type f 2>/dev/null | head -1)",
      '[ -z "$MSG" ] && echo "no db/messages" && rm -rf /tmp/retweet-recover-extract && exit 0',
      'ROOT=$(dirname "$(dirname "$MSG")")',
      `echo recover MERGE_SRC=$ROOT`,
      `DATA_ROOT=${DATA_ROOT_REMOTE} MERGE_SRC="$ROOT" node /tmp/merge-db-directory.mjs`,
      "rm -rf /tmp/retweet-recover-extract",
    ].join("\n");
    const encoded = Buffer.from(mergeBlock, "utf8").toString("base64");
    console.log(`\n[recover] معالجة: ${arch}`);
    try {
      await exec(conn, `echo ${encoded} | base64 -d | bash`);
    } catch (e) {
      console.warn("[recover] تحذير:", e.message);
    }
  }

  console.log("\n[recover] إعادة بناء snapshots…");
  await exec(
    conn,
    `DATA_ROOT=${DATA_ROOT_REMOTE} node /tmp/restore-full-database.mjs`,
  );

  console.log("\n[recover] إعادة تشغيل API…");
  await exec(conn, `pm2 restart retweet-api 2>/dev/null || true; sleep 2; curl -sf http://127.0.0.1:3000/health || echo "(health check failed)"`);

  const report = await exec(
    conn,
    `node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('${DATA_ROOT_REMOTE}/db/messages.json','utf8'));console.log('messages keys:',Object.keys(m).length)"`,
  ).catch(() => "");
  console.log("\n[recover] تم.", report.trim());
  console.log(
    "\nافتح التطبيق واضغط Ctrl+Shift+R. إن بقيت محادثة ناقصة، أرسل أسماء المستخدمين لنبحث في snapshots يدوياً.\n",
  );

  conn.end();
}

main().catch(err => {
  console.error("[recover] فشل:", err.message);
  process.exit(1);
});
