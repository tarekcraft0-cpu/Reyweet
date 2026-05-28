#!/usr/bin/env node
/**
 * نشر Retweet على Contabo VPS.
 *
 * الافتراضي (آمن): **كود الـ backend فقط** — لا يُستبدل `/var/lib/retweet`
 * (messages، posts، media تبقى على السيرفر). السيرفر = مصدر الحقيقة للبيانات الحية.
 *
 * الربط للموقع/الويب: المتصفح → https://reyweet.vercel.app (بروكسي) → الـ VPS.
 * بعد تحديث الـ VPS شغّل: `npm run vercel:deploy` حتى يبقى الإنتاج متصلاً.
 *
 * خطر فقدان بيانات — رفع القاعدة المحلية فوق الإنتاج (فقط عند ضرورة):
 *   node scripts/contabo-deploy.mjs --with-data
 *   أو CONTABO_DEPLOY_WITH_DATA=1
 *
 * المتطلبات: CONTABO_SSH_PASSWORD في البيئة (لا تضعها في git)
 *
 *   $env:CONTABO_SSH_PASSWORD = "..."
 *   npm run contabo:deploy
 */
import { Client } from "ssh2";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const backendDir = path.join(root, "backend");

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const DATA_ROOT_LOCAL = process.env.DATA_ROOT || "D:/RetweetSocial";
const DATA_ROOT_REMOTE = "/var/lib/retweet";
const APP_REMOTE = "/opt/retweet/app";
const PUBLIC_API = process.env.CONTABO_PUBLIC_URL || `http://${HOST}`;
const ARGS = process.argv.slice(2);
const WITH_DATA =
  ARGS.includes("--with-data") ||
  String(process.env.CONTABO_DEPLOY_WITH_DATA || "").trim() === "1";

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD ثم أعد التشغيل.");
  process.exit(1);
}

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
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      let errOut = "";
      stream
        .on("close", (code) => {
          if (code !== 0) reject(new Error(`exit ${code}: ${errOut || out}`));
          else resolve(out);
        })
        .on("data", (d) => {
          out += d;
          process.stdout.write(d);
        })
        .stderr.on("data", (d) => {
          errOut += d;
          process.stderr.write(d);
        });
    });
  });
}

async function uploadFile(sftp, localPath, remotePath) {
  await new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, err => (err ? reject(err) : resolve()));
  });
}

async function localFullBackup() {
  const backupDir = path.join(root, "backups-local");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archive = path.join(backupDir, `retweet-full-${stamp}.tar.gz`);
  console.log("\n[1/6] نسخة احتياطية محلية كاملة (db + snapshots + media)…");
  try {
    const dataRootWin = path.resolve(DATA_ROOT_LOCAL.replace(/\//g, path.sep));
    if (!existsSync(dataRootWin)) throw new Error(`missing ${dataRootWin}`);
    // على Windows: تجنّب "D:\" داخل quotes — يكسر tar
    const driveMatch = /^([A-Za-z]:)[/\\]?/.exec(dataRootWin);
    const dataName = path.basename(dataRootWin);
    const tarParent = driveMatch
      ? `${driveMatch[1]}/`
      : path.dirname(dataRootWin).replace(/\\/g, "/");
    execSync(`tar -czf "${archive}" -C "${tarParent}" "${dataName}"`, {
      stdio: "inherit",
      shell: true,
    });
  } catch {
    console.warn("[backup] tar فشل — تشغيل backup-db فقط");
    execSync("node scripts/backup-db.mjs", {
      cwd: backendDir,
      stdio: "inherit",
      env: { ...process.env, DATA_ROOT: DATA_ROOT_LOCAL, RETWEET_BACKUP_DIR: backupDir },
    });
  }
  console.log(`[backup] ${archive}`);
  return archive;
}

function readLocalEnv() {
  const p = path.join(backendDir, ".env");
  if (!existsSync(p)) return {};
  const map = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    map[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return map;
}

function buildRemoteEnv(local) {
  const jwt =
    process.env.JWT_SECRET ||
    local.JWT_SECRET ||
    execSync("node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"", {
      encoding: "utf8",
    }).trim();

  const lines = [
    `DATA_ROOT=${DATA_ROOT_REMOTE}`,
    "PORT=3000",
    "HOST=0.0.0.0",
    "NODE_ENV=production",
    `JWT_SECRET=${jwt}`,
    `BCRYPT_ROUNDS=${local.BCRYPT_ROUNDS || "12"}`,
    `PUBLIC_BASE_URL=${PUBLIC_API.replace(/\/$/, "")}`,
    "CORS_ALLOW_ALL=0",
    `CORS_ORIGINS=https://reyweet.vercel.app,${PUBLIC_API.replace(/\/$/, "")}`,
    "OTP_DEBUG=0",
    `SMTP_HOST=${local.SMTP_HOST || "smtp.gmail.com"}`,
    `SMTP_PORT=${local.SMTP_PORT || "465"}`,
    `SMTP_SECURE=${local.SMTP_SECURE || "1"}`,
    `SMTP_USER=${local.SMTP_USER || local.EMAIL_USER || ""}`,
    `SMTP_PASS=${local.SMTP_PASS || local.EMAIL_PASS || ""}`,
    `SMTP_FROM=${local.SMTP_FROM || '"Retweet <noreply@example.com>"'}`,
  ];
  return lines.join("\n") + "\n";
}

async function packBackend() {
  const tgz = path.join(root, "backups-local", "retweet-backend-deploy.tgz");
  await mkdir(path.dirname(tgz), { recursive: true });
  const excludes = [
    "--exclude=node_modules",
    "--exclude=.env",
    "--exclude=dist",
  ].join(" ");
  execSync(`tar -czf "${tgz}" ${excludes} -C "${backendDir}" .`, {
    stdio: "inherit",
    shell: true,
  });
  return tgz;
}

/** ملفات مشتركة يستوردها الـ backend من ../../../src/lib */
async function packSharedLib() {
  const tgz = path.join(root, "backups-local", "retweet-shared-lib.tgz");
  await mkdir(path.dirname(tgz), { recursive: true });
  execSync(`tar -czf "${tgz}" -C "${root}" src/lib`, { stdio: "inherit", shell: true });
  return tgz;
}

async function main() {
  console.log(`\n══ نشر Retweet → ${HOST} ══\n`);
  if (!WITH_DATA) {
    console.log(
      "⚙ الوضع الافتراضي: كود الخادم فقط — بيانات /var/lib/retweet لا تُستبدَل.\n" +
        "   لفرض رفع القاعدة المحلية: أضف --with-data أو CONTABO_DEPLOY_WITH_DATA=1\n",
    );
  } else {
    console.warn(
      "\n⚠ --with-data: سيجري استبدال بيانات الإنتاج على السيرفر بما هو على جهازك — استخدم بحذر.\n",
    );
    await localFullBackup();
  }

  const conn = await connect();
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  console.log("\n[2/6] إعداد السيرفر (nginx, node, ffmpeg)…");
  const setupSh = path.join(__dirname, "contabo-setup-server.sh");
  const setupLf = path.join(root, "backups-local", "contabo-setup-server.sh");
  writeFileSync(setupLf, readFileSync(setupSh, "utf8").replace(/\r\n/g, "\n"), "utf8");
  await uploadFile(sftp, setupLf, "/tmp/contabo-setup-server.sh");
  await exec(conn, "chmod +x /tmp/contabo-setup-server.sh && bash /tmp/contabo-setup-server.sh");

  console.log("\n[3/6] رفع كود الـ backend…");
  const backendTgz = await packBackend();
  const sharedTgz = await packSharedLib();
  await uploadFile(sftp, backendTgz, "/tmp/retweet-backend.tgz");
  await uploadFile(sftp, sharedTgz, "/tmp/retweet-shared-lib.tgz");
  await exec(
    conn,
    `mkdir -p ${APP_REMOTE} /opt/retweet/src/lib && tar -xzf /tmp/retweet-backend.tgz -C ${APP_REMOTE} && tar -xzf /tmp/retweet-shared-lib.tgz -C /opt/retweet && cd ${APP_REMOTE} && npm install --omit=dev`,
  );

  if (WITH_DATA) {
    console.log("\n[4/6] نسخة على السيرفر قبل استبدال البيانات، ثم رفع القاعدة…");
    await exec(
      conn,
      `STAMP=$(date -u +%Y%m%dT%H%M%SZ) && (test -d ${DATA_ROOT_REMOTE}/db && tar -czf "/root/retweet-pre-sync-$STAMP.tar.gz" -C /var/lib retweet && echo "[deploy] backed up server -> /root/retweet-pre-sync-$STAMP.tar.gz" || echo "[deploy] no ${DATA_ROOT_REMOTE}/db skip server backup")`,
    ).catch(() => {
      console.warn("[deploy] تعذّر عمل نسخة على السيرفر — تابع بحذر");
    });

    const dataTgz = path.join(root, "backups-local", "retweet-data-upload.tgz");
    const dataRootWin = path.resolve(DATA_ROOT_LOCAL.replace(/\//g, path.sep));
    const driveMatch = /^([A-Za-z]:)[/\\]?/.exec(dataRootWin);
    const dataName = path.basename(dataRootWin);
    const tarParent = driveMatch
      ? `${driveMatch[1]}/`
      : path.dirname(dataRootWin).replace(/\\/g, "/");
    execSync(`tar -czf "${dataTgz}" -C "${tarParent}" "${dataName}"`, {
      stdio: "inherit",
      shell: true,
    });
    await uploadFile(sftp, dataTgz, "/tmp/retweet-data.tgz");
    await exec(
      conn,
      `rm -rf /tmp/retweet-data-extract && mkdir -p /tmp/retweet-data-extract ${DATA_ROOT_REMOTE} && tar -xzf /tmp/retweet-data.tgz -C /tmp/retweet-data-extract && rsync -a /tmp/retweet-data-extract/*/ ${DATA_ROOT_REMOTE}/`,
    );
    await exec(conn, `test -d ${DATA_ROOT_REMOTE}/db && ls -la ${DATA_ROOT_REMOTE}/db | head`);
  } else {
    console.log("\n[4/6] تخطي استبدال بيانات الإنتاج — لم يُضبط --with-data");
    await exec(conn, `test -d ${DATA_ROOT_REMOTE}/db && echo "[deploy] data dir ok" || echo "[deploy] warn: no db dir"`).catch(
      () => {
        /* ignore */
      },
    );
  }

  console.log("\n[5/6] ملف .env للإنتاج…");
  const envBody = buildRemoteEnv(readLocalEnv());
  const envLocal = path.join(root, "backups-local", ".env.production.generated");
  writeFileSync(envLocal, envBody, "utf8");
  await uploadFile(sftp, envLocal, `${APP_REMOTE}/.env`);

  console.log("\n[6/6] تشغيل PM2…");
  await exec(
    conn,
    `pm2 delete retweet-api 2>/dev/null || true && cd ${APP_REMOTE} && pm2 start npm --name retweet-api --cwd ${APP_REMOTE} -- start && pm2 save`,
  );

  const health = await exec(conn, `curl -sf ${PUBLIC_API}/health || curl -sf http://127.0.0.1:3000/health || echo FAIL`);
  conn.end();

  writeFileSync(path.join(root, "PUBLIC_API_URL.txt"), `${PUBLIC_API.replace(/\/$/, "")}\n`, "utf8");
  execSync("node scripts/write-public-web-config.mjs", { cwd: root, stdio: "inherit" });
  writeFileSync(
    path.join(root, "landing/public/app-config.json"),
    JSON.stringify(
      {
        apiUrl: PUBLIC_API.replace(/\/$/, ""),
        appPath: "/app/",
        siteUrl: PUBLIC_API.replace(/\/$/, ""),
        webAppUrl: `${PUBLIC_API.replace(/\/$/, "")}/app/`,
        supabaseUrl: "",
        supabaseAnonKey: "",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    `\n✓ السيرفر: ${PUBLIC_API} — ${WITH_DATA ? "تم مسح القاعدة على السيرفر واستبدالها من جهازك" : "البيانات الحية على VPS لم تُستبدَل (كود فقط)"}`,
  );
  if (!WITH_DATA) {
    console.log(
      "✓ الويب: عنوان API في الملفات المحلية = نفس نقطة VPS لبناء بروكسي Vercel. بعد أي تحديث IP شغّل: npm run vercel:deploy\n",
    );
  }
  const localEnv = readLocalEnv();
  const smtpReady =
    (localEnv.SMTP_USER || localEnv.EMAIL_USER || "").trim() &&
    String(localEnv.SMTP_PASS || localEnv.EMAIL_PASS || "")
      .replace(/\s+/g, "")
      .trim();
  if (!smtpReady) {
    console.warn(`
⚠ بريد SMTP غير مُعدّ في backend/.env (SMTP_USER/SMTP_PASS أو EMAIL_*).
   لن تصل أكواد «إنشاء حساب» و«استعادة كلمة المرور» حتى تضيف بريد Gmail + App Password.
   راجع: backend/.env.example ثم أعد: npm run contabo:deploy
`);
  }
  console.log(
    "✓ في لوحة Vercel → إعدادات المشروع → Environment Variables: أضف RETWEET_BACKEND_URL = عنوان الـ API (مثل http://YOUR_VPS_IP)",
  );
  console.log("✓ ثم نشر الإنتاج من جذر المستودع (يشمل بروكسي الفيديو api/media).");
  if (String(health).includes("FAIL")) {
    console.warn("تحذير: /health لم يُجب — راجع pm2 logs retweet-api على السيرفر");
  }
}

main().catch(err => {
  console.error("\n[deploy] فشل:", err.message);
  if (/ETIMEDOUT|ECONNREFUSED/.test(err.message)) {
    console.error(`
السيرفر غير reachable من هذا الجهاز.
• Contabo Panel → VPS → تأكد الحالة Running
• Firewall: اسمح بـ TCP 22 و 80 و 3000
• انتظر 10–30 دقيقة بعد الشراء إن كان جديداً
ثم أعد: node scripts/contabo-deploy.mjs
`);
  }
  if (/authentication methods failed/i.test(err.message)) {
    console.error(`
فشل تسجيل الدخول SSH — كلمة المرور غير صحيحة لـ root@${HOST}.

كلمة مرور لوحة Contabo (my.contabo.com) ≠ كلمة مرور SSH للسيرفر.

أعد تعيين كلمة مرور root:
1. ادخل https://my.contabo.com
2. Servers & Hosting → VPS → ⋮ → Reset credentials / Password reset
3. اختر كلمة مرور جديدة للـ root وانتظر 2–3 دقائق
4. شغّل:
   $env:CONTABO_SSH_PASSWORD = "كلمة-الroot-الجديدة"
   npm run contabo:deploy
`);
  }
  process.exit(1);
});
