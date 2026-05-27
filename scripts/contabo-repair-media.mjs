#!/usr/bin/env node
/** يرفع ويشغّل repair-legacy-media على Contabo */
import { Client } from "ssh2";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const HOST = process.env.CONTABO_HOST || "109.199.111.29";

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

const scriptLocal = path.join(root, "backend/scripts/repair-legacy-media.mjs");
const conn = new Client();

conn.on("ready", () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    sftp.fastPut(scriptLocal, "/tmp/repair-legacy-media.mjs", putErr => {
      if (putErr) throw putErr;
      conn.exec(
        "DATA_ROOT=/var/lib/retweet node /tmp/repair-legacy-media.mjs && pm2 restart retweet-api",
        (e, stream) => {
          if (e) throw e;
          stream.on("data", d => process.stdout.write(d));
          stream.stderr.on("data", d => process.stderr.write(d));
          stream.on("close", code => {
            conn.end();
            process.exit(code ?? 0);
          });
        },
      );
    });
  });
}).connect({ host: HOST, port: 22, username: "root", password: PASSWORD, readyTimeout: 120000 });
