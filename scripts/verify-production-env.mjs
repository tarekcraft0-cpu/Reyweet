#!/usr/bin/env node
/**
 * فحص جاهزية إنتاج iPhone: SMTP / Firebase / Stripe على VPS
 */
import { Client } from "ssh2";

const HOST = process.env.CONTABO_HOST || "109.199.111.29";
const USER = process.env.CONTABO_USER || "root";
const PASSWORD = process.env.CONTABO_SSH_PASSWORD || "";
const PUBLIC = process.env.CONTABO_PUBLIC_URL || `http://${HOST}`;

if (!PASSWORD) {
  console.error("عيّن CONTABO_SSH_PASSWORD");
  process.exit(1);
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => resolve(conn)).on("error", reject).connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASSWORD,
      readyTimeout: 45000,
    });
  });
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("close", code => (code === 0 ? resolve(out) : reject(new Error(out))));
      stream.on("data", d => {
        out += d;
      });
    });
  });
}

const conn = await connect();
try {
  const health = await exec(conn, `curl -fsS ${PUBLIC}/health`);
  const j = JSON.parse(health);
  console.log("Health:", j);
  const missing = [];
  if (!j.smtpConfigured) missing.push("SMTP");
  if (!j.pushConfigured) missing.push("Firebase/FCM");
  if (!j.stripeConfigured) missing.push("Stripe");
  if (!j.dbOk) missing.push("Database");
  if (missing.length) {
    console.error("\nناقص على السيرفر:", missing.join(", "));
    process.exit(1);
  }
  console.log("\n✓ السيرفر جاهز لإنتاج iPhone (بريد + push + دفع + DB)");
} finally {
  conn.end();
}
