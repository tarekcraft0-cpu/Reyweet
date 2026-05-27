#!/usr/bin/env node
/**
 * دمج كل أرشيفات retweet-full و retweet-repair و retweet-sync بالترتيب الزمني
 * في DATA_ROOT ثم إعادة بناء snapshots.
 */
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "D:/RetweetSocial");
const backupDir = path.join(root, "backups-local");
const extraDirs = [
  path.join(DATA_ROOT, "backups"),
].filter(Boolean);

const mergeScript = path.join(root, "backend/scripts/merge-db-directory.mjs");
const restoreScript = path.join(root, "backend/scripts/restore-full-database.mjs");

async function listArchives() {
  const patterns = /^retweet-(full|repair|sync|2026)-.*\.tar\.gz$/i;
  const found = [];
  for (const dir of [backupDir, ...extraDirs]) {
    try {
      const names = await fs.readdir(dir);
      for (const name of names) {
        if (!patterns.test(name)) continue;
        const full = path.join(dir, name);
        const st = await fs.stat(full);
        found.push({ full, mtime: st.mtimeMs, name });
      }
    } catch {
      /* skip */
    }
  }
  found.sort((a, b) => a.mtime - b.mtime);
  return found;
}

async function extractArchive(archive, extractBase) {
  const dir = path.join(extractBase, path.basename(archive, ".tar.gz"));
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  await fs.mkdir(dir, { recursive: true });
  execSync(`tar -xzf "${archive}" -C "${dir}"`, { stdio: "inherit", shell: true });
  const dbPath = path.join(dir, "RetweetSocial", "db", "messages.json");
  try {
    await fs.access(dbPath);
    return path.join(dir, "RetweetSocial");
  } catch {
    /* walk */
  }
  async function walk(d) {
    for (const ent of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "db") {
          try {
            await fs.access(path.join(p, "messages.json"));
            return path.dirname(p);
          } catch {
            /* */
          }
        }
        const r = await walk(p);
        if (r) return r;
      }
    }
    return null;
  }
  return walk(dir);
}

async function countMessages(dataRoot) {
  const p = path.join(dataRoot, "db", "messages.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const j = JSON.parse(raw);
    return Object.keys(j).length;
  } catch {
    return 0;
  }
}

async function main() {
  console.log("[merge-all] DATA_ROOT =", DATA_ROOT);
  await fs.mkdir(path.join(DATA_ROOT, "db"), { recursive: true });

  let before = await countMessages(DATA_ROOT);
  console.log("[merge-all] رسائل قبل الدمج:", before);

  const archives = await listArchives();
  if (!archives.length) {
    console.error("[merge-all] لا توجد أرشيفات");
    process.exit(2);
  }

  console.log(`[merge-all] ${archives.length} أرشيفاً بالترتيب الزمني:\n`);
  for (const a of archives) console.log("  ", a.name);

  const extractBase = path.join(root, "backups-local", ".merge-extract");
  await fs.mkdir(extractBase, { recursive: true });

  for (const { full, name } of archives) {
    console.log(`\n[merge-all] === ${name} ===`);
    let mergeSrc;
    try {
      mergeSrc = await extractArchive(full, extractBase);
    } catch (e) {
      console.warn("[merge-all] تخطي (فشل فك):", e.message);
      continue;
    }
    if (!mergeSrc) {
      console.warn("[merge-all] تخطي — لا messages.json");
      continue;
    }
    process.env.DATA_ROOT = DATA_ROOT;
    process.env.MERGE_SRC = mergeSrc;
    execSync(`node "${mergeScript}"`, { stdio: "inherit", cwd: root });
    const now = await countMessages(DATA_ROOT);
    console.log("[merge-all] إجمالي الرسائل الآن:", now);
  }

  console.log("\n[merge-all] إعادة بناء snapshots…");
  process.env.DATA_ROOT = DATA_ROOT;
  execSync(`node "${restoreScript}"`, { stdio: "inherit", cwd: root });

  const snapRestore = path.join(root, "backend/scripts/restore-messages-from-snapshots.mjs");
  const postsRestore = path.join(root, "backend/scripts/restore-posts-from-snapshots.mjs");
  console.log("\n[merge-all] استعادة رسائل/منشورات من snapshots…");
  execSync(`node "${snapRestore}"`, { stdio: "inherit", cwd: root, env: { ...process.env, DATA_ROOT } });
  execSync(`node "${postsRestore}"`, { stdio: "inherit", cwd: root, env: { ...process.env, DATA_ROOT } });
  execSync(`node "${restoreScript}"`, { stdio: "inherit", cwd: root, env: { ...process.env, DATA_ROOT } });

  const after = await countMessages(DATA_ROOT);
  console.log(`\n[merge-all] تم. رسائل: ${before} → ${after} (+${after - before})`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
