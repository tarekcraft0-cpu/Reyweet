#!/usr/bin/env node
/** Usage: node scripts/contabo-lookup-user.mjs L */
import { Client } from "ssh2";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const username = process.argv[2]?.trim().replace(/^@/, "");
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const HOST = process.env.CONTABO_HOST || "109.199.111.29";

if (!PASSWORD || !username) {
  console.error("Set CONTABO_SSH_PASSWORD and pass username");
  process.exit(1);
}

const scriptBody = readFileSync(path.join(root, "backend/scripts/lookup-user-by-username.mjs"), "utf8");

const conn = await new Promise((resolve, reject) => {
  const c = new Client();
  c.on("ready", () => resolve(c)).on("error", reject);
  c.connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 45000 });
});

await new Promise((res, rej) => {
  conn.sftp((e, sftp) => {
    if (e) return rej(e);
    const ws = sftp.createWriteStream("/tmp/lookup-user.mjs", { mode: 0o644 });
    ws.on("close", res);
    ws.on("error", rej);
    ws.end(scriptBody, "utf8");
  });
});

await new Promise((res, rej) => {
  conn.exec(
    `DATA_ROOT=/var/lib/retweet node /tmp/lookup-user.mjs ${JSON.stringify(username)}`,
    (e, s) => {
      if (e) return rej(e);
      s.on("data", d => process.stdout.write(d));
      s.stderr.on("data", d => process.stderr.write(d));
      s.on("close", c => (c !== 0 ? rej(new Error(`exit ${c}`)) : res()));
    },
  );
});
conn.end();
