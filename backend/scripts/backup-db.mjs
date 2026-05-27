#!/usr/bin/env node
/**
 * نسخ احتياطي يومي لقاعدة JSON على القرص (RetweetSocial).
 * الاستخدام:
 *   node backend/scripts/backup-db.mjs
 *   RETWEET_BACKUP_DIR=/path/to/backups node backend/scripts/backup-db.mjs
 *
 * Cron (Linux VPS) — يومياً 03:00:
 *   0 3 * * * cd /path/to/app && node backend/scripts/backup-db.mjs >> /var/log/retweet-backup.log 2>&1
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");

function loadConfig() {
  const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
  return {
    DATA_ROOT,
    DB_DIR: path.join(DATA_ROOT, "db"),
    SNAPSHOTS_DIR: path.join(DATA_ROOT, "snapshots"),
  };
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

async function gzipFile(inputPath, outputPath) {
  await pipeline(
    createReadStream(inputPath),
    createGzip({ level: 9 }),
    createWriteStream(outputPath),
  );
}

async function main() {
  const { DATA_ROOT, DB_DIR, SNAPSHOTS_DIR } = loadConfig();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupRoot =
    process.env.RETWEET_BACKUP_DIR || path.join(DATA_ROOT, "backups");
  const workDir = path.join(backupRoot, `retweet-${stamp}`);
  const archivePath = `${workDir}.tar.gz`;

  await fs.mkdir(workDir, { recursive: true });
  await copyDir(DB_DIR, path.join(workDir, "db"));
  try {
    await copyDir(SNAPSHOTS_DIR, path.join(workDir, "snapshots"));
  } catch {
    /* snapshots optional */
  }
  await fs.writeFile(
    path.join(workDir, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        dataRoot: DATA_ROOT,
        node: process.version,
      },
      null,
      2,
    ),
    "utf8",
  );

  const { execSync } = await import("node:child_process");
  try {
    execSync(`tar -czf "${archivePath}" -C "${backupRoot}" "${path.basename(workDir)}"`, {
      stdio: "inherit",
    });
    await fs.rm(workDir, { recursive: true, force: true });
    console.log(`[backup] archive: ${archivePath}`);
  } catch {
    const flatJson = path.join(backupRoot, `messages-${stamp}.json.gz`);
    await gzipFile(
      path.join(DB_DIR, "messages.json"),
      flatJson,
    );
    console.log(`[backup] fallback gzip: ${flatJson}`);
  }

  const keepDays = Number(process.env.RETWEET_BACKUP_KEEP_DAYS || 14);
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const cutoff = Date.now() - keepDays * 86400_000;
  for (const ent of entries) {
    if (!ent.name.startsWith("retweet-")) continue;
    const full = path.join(backupRoot, ent.name);
    const st = await fs.stat(full);
    if (st.mtimeMs < cutoff) {
      await fs.rm(full, { recursive: true, force: true });
      console.log(`[backup] pruned old: ${ent.name}`);
    }
  }
}

main().catch(err => {
  console.error("[backup] failed", err);
  process.exit(1);
});
