#!/bin/bash
# يُرفع إلى VPS ويُنفَّذ: دمج backup + VPS + SYNC_SRC
set -euo pipefail
DATA_ROOT="${DATA_ROOT:-/var/lib/retweet}"
export DATA_ROOT

echo "[repair] snapshot before repair..."
tar -czf "/root/retweet-before-repair-$(date +%Y%m%d-%H%M).tar.gz" -C /var/lib retweet

EXTRA_LIST="/tmp/extra_roots.list.$$"
: >"$EXTRA_LIST"
TMP_ARCH="/tmp/archive-extract.$$"

echo "[repair] unpacking ${DATA_ROOT}/backups archives (old→new order)..."
mkdir -p "$TMP_ARCH"
for ARCH in $(ls -rt "${DATA_ROOT}/backups/"*.tar.gz 2>/dev/null || true); do
  [[ -f "$ARCH" ]] || continue
  BX="${TMP_ARCH}/$(basename "${ARCH%.tar.gz}")"
  rm -rf "$BX"
  mkdir -p "$BX"
  tar -xzf "$ARCH" -C "$BX" --no-same-owner 2>/dev/null || true
  ROOT=$(find "$BX" -type d -name db 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
  if [[ -n "${ROOT:-}" && -d "$ROOT/db" ]]; then echo "$ROOT" >>"$EXTRA_LIST"; fi
done

echo "[repair] unpacking /root/retweet-before-repair-*.tar.gz (excluding absolute newest archive we just wrote)..."
for ARCH in $(ls -rt /root/retweet-before-repair-*.tar.gz 2>/dev/null || true); do
  [[ -f "$ARCH" ]] || continue
  BX="${TMP_ARCH}/bef-$(basename "${ARCH%.tar.gz}")"
  rm -rf "$BX"
  mkdir -p "$BX"
  tar -xzf "$ARCH" -C "$BX" --no-same-owner 2>/dev/null || true
  ROOT=$(find "$BX" -type d -name db 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
  if [[ -n "${ROOT:-}" && -d "$ROOT/db" ]]; then echo "$ROOT" >>"$EXTRA_LIST"; fi
done

if [[ -s "$EXTRA_LIST" ]]; then
  export EXTRA_BACKUPS=$(paste -sd'|' "$EXTRA_LIST")
  echo "[repair] EXTRA_BACKUPS ($(wc -l <"$EXTRA_LIST") trees merged into db)"
else
  export EXTRA_BACKUPS=""
fi

echo "[repair] extracting pre-sync backup if any..."
BACKUP_ROOT=""
if PRESYNC=$(ls -t /root/retweet-pre-sync-*.tar.gz 2>/dev/null | head -1); then
  rm -rf /tmp/retweet-presync-extract
  mkdir -p /tmp/retweet-presync-extract
  tar -xzf "$PRESYNC" -C /tmp/retweet-presync-extract
  BACKUP_ROOT="$(find /tmp/retweet-presync-extract -maxdepth 2 -type d -name db | head -1 | xargs dirname)"
  echo "[repair] BACKUP_ROOT=$BACKUP_ROOT"
fi

rm -rf /tmp/retweet-repair-extract
mkdir -p /tmp/retweet-repair-extract
tar -xzf /tmp/retweet-repair-sync.tgz -C /tmp/retweet-repair-extract
SYNC_SRC="$(find /tmp/retweet-repair-extract -maxdepth 2 -type d -name db | head -1 | xargs dirname)"
echo "[repair] SYNC_SRC=$SYNC_SRC"

export BACKUP_EXTRACT="$BACKUP_ROOT"
export SYNC_SRC
export EXTRA_BACKUPS
export DATA_ROOT
node /tmp/repair-merge-logic.js

echo "[repair] syncing snapshots (extra archives oldest→new then presync then device bundle)..."
while IFS= read -r R; do
  [[ -z "${R:-}" ]] && continue
  [[ -d "$R/snapshots" ]] || continue
  echo "[repair] snaps from $R"
  rsync -a "$R/snapshots/" "$DATA_ROOT/snapshots/"
done <"$EXTRA_LIST"
if [[ -n "$BACKUP_ROOT" && -d "$BACKUP_ROOT/snapshots" ]]; then
  rsync -a "$BACKUP_ROOT/snapshots/" "$DATA_ROOT/snapshots/"
fi
if [[ -n "${SYNC_SRC:-}" ]]; then
  SNAP_L="$(find "$SYNC_SRC" -type d -name snapshots 2>/dev/null | head -1 || true)"
  [[ -n "${SNAP_L:-}" ]] && rsync -a "$SNAP_L/" "$DATA_ROOT/snapshots/"
fi

echo "[repair] restore-full-database..."
export DATA_ROOT
DATA_ROOT="$DATA_ROOT" node /opt/retweet/app/scripts/restore-full-database.mjs

pm2 restart retweet-api || true
sleep 2
curl -sf "http://127.0.0.1:3000/health" || true
echo ""

export DATA_ROOT
node <<'NODEREPORT'
const fs = require("fs");
const db = process.env.DATA_ROOT + "/db";
const posts = JSON.parse(fs.readFileSync(db + "/posts.json", "utf8"));
const users = JSON.parse(fs.readFileSync(db + "/users.json", "utf8"));
const msgs = JSON.parse(fs.readFileSync(db + "/messages.json", "utf8"));
const pa = Array.isArray(posts) ? posts : Object.values(posts);
const reels = pa.filter((x) => x.type === "reel").length;
const ua = Array.isArray(users) ? users : Object.values(users);
const v = ua.filter((u) => u.verified || u.founderVerified || u.appOfficialVerified).length;
const l = ua.find((u) => String(u.username).toLowerCase() === "l");
console.log(
  JSON.stringify({
    posts: pa.length,
    reels,
    users: ua.length,
    verifiedAny: v,
    messages: Object.keys(msgs).length,
    user_l_avatar: l ? String(l.avatar).slice(0, 80) : null,
  }),
);
NODEREPORT

rm -rf "$TMP_ARCH" 2>/dev/null || true
rm -f "$EXTRA_LIST" 2>/dev/null || true
