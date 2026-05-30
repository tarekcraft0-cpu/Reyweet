#!/usr/bin/env node
/**
 * تعيين إشعار معلّق يظهر عند فتح التطبيق (مثلاً بعد استعادة سابقة).
 * DATA_ROOT=/var/lib/retweet npx tsx scripts/set-moderation-notice.mjs nw3 restored
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const username = process.argv[2]?.trim().replace(/^@/, "");
const kind = process.argv[3] === "warning" ? "warning" : "account_restored";

if (!username) {
  console.error("Usage: npx tsx scripts/set-moderation-notice.mjs <username> [restored|warning]");
  process.exit(1);
}

process.env.DATA_ROOT = process.env.DATA_ROOT || "/var/lib/retweet";
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const engine = await import(pathToFileURL(path.join(backendRoot, "src/db/engine.ts")).href);
const modStore = await import(pathToFileURL(path.join(backendRoot, "src/db/moderationStore.ts")).href);

const row = await engine.findUserByUsername(username);
if (!row) {
  console.error("User not found:", username);
  process.exit(1);
}

const state = await modStore.getUserModerationState(row.id);
state.pendingNotice = {
  id: randomUUID(),
  kind,
  titleAr:
    kind === "warning"
      ? "تحذير من الإشراف"
      : "تم فك الحظر النهائي",
  messageAr:
    kind === "warning"
      ? "لقد تلقيت تحذيراً بسبب مخالفة إرشادات المجتمع."
      : "تم فك الحظر النهائي واستعادة حسابك بعد مراجعة الدعم. نعتذر عن الخطأ.",
  createdAt: Date.now(),
};
await modStore.saveUserModerationState(state);
console.log(`Notice set for @${row.username}:`, state.pendingNotice);
