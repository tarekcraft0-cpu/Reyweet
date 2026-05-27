#!/usr/bin/env node
/**
 * SSH helper for Contabo VPS (password via CONTABO_SSH_PASSWORD env).
 * Usage: node scripts/contabo-remote.mjs "uname -a"
 */
import { Client } from "ssh2";
import { readFileSync } from "node:fs";

const host = process.env.CONTABO_HOST || "109.199.111.29";
const user = process.env.CONTABO_USER || "root";
const password = process.env.CONTABO_SSH_PASSWORD || "";
const cmd = process.argv.slice(2).join(" ").trim();

if (!password) {
  console.error("Set CONTABO_SSH_PASSWORD");
  process.exit(1);
}
if (!cmd) {
  console.error("Usage: node scripts/contabo-remote.mjs <command>");
  process.exit(1);
}

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      stream
        .on("close", (code) => {
          conn.end();
          process.exit(code ?? 0);
        })
        .on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
    });
  })
  .on("error", (e) => {
    console.error("[ssh]", e.message);
    process.exit(1);
  })
  .connect({ host, port: 22, username: user, password, readyTimeout: 30000 });
