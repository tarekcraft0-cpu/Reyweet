#!/usr/bin/env node
/** رفع spa-dist إلى /opt/retweet/www/app على Contabo */
import { Client } from "ssh2";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.CONTABO_HOST || "109.199.111.29";

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!process.env.CONTABO_SSH_PASSWORD && existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const spaDir = path.join(root, "spa-dist");
const PUBLIC_API = `http://${HOST}`;

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}
if (!existsSync(path.join(spaDir, "index.html"))) {
  console.error("شغّل أولاً: npm run build:spa && node scripts/write-public-web-config.mjs");
  process.exit(1);
}

const tgz = path.join(root, "backups-local", "spa-dist-upload.tgz");
await mkdir(path.dirname(tgz), { recursive: true });
execSync(`tar -czf "${tgz}" -C "${spaDir}" .`, { stdio: "inherit", shell: true });

const conn = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on("ready", () => resolve(c)).on("error", reject).connect({
    host: HOST,
    port: 22,
    username: "root",
    password: PASSWORD,
    readyTimeout: 45000,
  });
});

function exec(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let errOut = "";
      stream.on("close", code => (code ? reject(new Error(errOut || `exit ${code}`)) : resolve()));
      stream.on("data", d => process.stdout.write(d));
      stream.stderr.on("data", d => {
        errOut += d;
        process.stderr.write(d);
      });
    });
  });
}

const sftp = await new Promise((resolve, reject) => {
  conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
});

await new Promise((resolve, reject) => {
  sftp.fastPut(tgz, "/tmp/spa-dist.tgz", err => (err ? reject(err) : resolve()));
});

await exec(
  "mkdir -p /opt/retweet/www/app && rm -rf /opt/retweet/www/app/* && tar -xzf /tmp/spa-dist.tgz -C /opt/retweet/www/app",
);

const apiDirect = PUBLIC_API.replace(/\/$/, "");

const indexLocal = path.join(spaDir, "index.html");
if (existsSync(indexLocal)) {
  let html = readFileSync(indexLocal, "utf8");
  const tag = `<script>window.__RETWEET_API_URL__=${JSON.stringify(apiDirect)};</script>`;
  if (!html.includes("__RETWEET_API_URL__")) {
    html = html.replace("</head>", `${tag}\n</head>`);
    writeFileSync(indexLocal, html, "utf8");
  }
}

const webAuth = JSON.stringify(
  { apiUrl: apiDirect, supabaseUrl: "", supabaseAnonKey: "" },
  null,
  2,
);
await exec(
  `cat > /opt/retweet/www/app/web-auth-config.json << 'EOF'\n${webAuth}\nEOF`,
);

const envPatch = `grep -q '^STATIC_SITE_DIR=' /opt/retweet/app/.env && sed -i 's|^STATIC_SITE_DIR=.*|STATIC_SITE_DIR=/opt/retweet/www|' /opt/retweet/app/.env || echo 'STATIC_SITE_DIR=/opt/retweet/www' >> /opt/retweet/app/.env`;
await exec(envPatch);
await exec("pm2 restart retweet-api 2>/dev/null || true");
try {
  await exec(`curl -sf ${PUBLIC_API}/health`);
  await exec(`curl -sf -o /dev/null -w '%{http_code}\\n' ${PUBLIC_API}/app/`);
} catch {
  console.warn("[contabo-upload-spa] تحقق يدوياً من /health و /app/");
}

conn.end();
console.log(`\n✓ SPA على ${PUBLIC_API}/app/ (API مباشر: ${apiDirect})\n`);
