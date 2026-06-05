#!/usr/bin/env node
import { Client } from "ssh2";

const PASS = process.env.CONTABO_SSH_PASSWORD || "";
const cmd =
  "set -a; source /opt/retweet/app/.env; set +a; cd /opt/retweet/app && DATA_ROOT=/var/lib/retweet node backend/scripts/purge-all-banned-content.mjs 2>&1";

const c = new Client();
c.on("ready", () => {
  c.exec(cmd, (err, s) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    s.on("data", d => process.stdout.write(d));
    s.stderr.on("data", d => process.stderr.write(d));
    s.on("close", code => {
      c.end();
      process.exit(code ?? 0);
    });
  });
});
c.on("error", e => {
  console.error(e);
  process.exit(1);
});
c.connect({ host: "109.199.111.29", port: 22, username: "root", password: PASS, readyTimeout: 120000 });
