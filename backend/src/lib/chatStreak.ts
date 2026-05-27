/**
 * Snapchat-style Chat Streak System 🔥
 * يُحسَب السترك بين مستخدمَين في محادثة خاصة فقط.
 * الشرط: يرسل كل منهما رسالة واحدة على الأقل في كل فترة 24 ساعة.
 */
import {
  getStreak,
  saveStreak,
  listAllStreaks,
  saveStreaksBatch,
  type StreakRow,
} from "../db/engine.js";
import { dmChatId } from "./dmChatId.js";
import { broadcastSseToUser } from "./realtimeHub.js";
import { emitToUsers } from "./realtimeSocket.js";

const H24 = 24 * 60 * 60 * 1000;  // 24 ساعة بالميلي ثانية
const H48 = 48 * 60 * 60 * 1000;  // 48 ساعة — وقت انتهاء السترك

/** إنشاء سطر سترك افتراضي */
function defaultStreak(chatId: string, u1: string, u2: string): StreakRow {
  const [user1Id, user2Id] = u1 < u2 ? [u1, u2] : [u2, u1];
  return {
    chatId,
    streakCount: 0,
    lastExchangeAt: null,
    user1Id,
    user2Id,
    user1LastSentAt: null,
    user2LastSentAt: null,
    streakExpiresAt: null,
    isStreakActive: false,
  };
}

function toClient(row: StreakRow) {
  return {
    streakCount: row.streakCount,
    lastExchangeAt: row.lastExchangeAt,
    user1LastSentAt: row.user1LastSentAt,
    user2LastSentAt: row.user2LastSentAt,
    streakExpiresAt: row.streakExpiresAt,
    isStreakActive: row.isStreakActive,
  };
}

/** بث تحديث السترك للطرفين */
function broadcastStreakUpdate(row: StreakRow): void {
  const payload = {
    chatId: row.chatId,
    streak: toClient(row),
  };
  broadcastSseToUser(row.user1Id, "streak_update", payload);
  broadcastSseToUser(row.user2Id, "streak_update", payload);
  emitToUsers([row.user1Id, row.user2Id], "streak_update", payload);
}

/**
 * يُستدعى عند كل رسالة DM جديدة.
 * لا ينتظر — يعمل في الخلفية.
 */
export async function updateStreakOnMessage(
  senderId: string,
  receiverId: string,
): Promise<void> {
  const now = Date.now();
  const chatId = dmChatId(senderId, receiverId);

  let row = await getStreak(chatId);
  if (!row) row = defaultStreak(chatId, senderId, receiverId);

  const [u1, u2] = row.user1Id < row.user2Id
    ? [row.user1Id, row.user2Id]
    : [row.user2Id, row.user1Id];

  // 1. تحديث وقت إرسال المُرسِل
  let updated: StreakRow = {
    ...row,
    user1Id: u1,
    user2Id: u2,
  };
  if (senderId === u1) {
    updated = { ...updated, user1LastSentAt: now };
  } else {
    updated = { ...updated, user2LastSentAt: now };
  }

  // 2. هل تبادل الطرفان في الـ 24 ساعة الماضية؟
  const t1 = updated.user1LastSentAt;
  const t2 = updated.user2LastSentAt;
  const hasExchange =
    t1 != null &&
    t2 != null &&
    Math.abs(t1 - t2) <= H24;

  if (!hasExchange) {
    // لا تبادل كامل — احفظ الطابع الزمني فقط
    await saveStreak(updated);
    broadcastStreakUpdate(updated);
    return;
  }

  // 3. تحديث السترك
  const prev = updated.lastExchangeAt;

  if (prev === null) {
    // أول تبادل كامل
    updated = {
      ...updated,
      streakCount: 1,
      lastExchangeAt: now,
      streakExpiresAt: now + H48,
      isStreakActive: true,
    };
  } else if (now >= prev + H24) {
    // مضى يوم كامل منذ آخر تبادل → زيادة
    updated = {
      ...updated,
      streakCount: updated.streakCount + 1,
      lastExchangeAt: now,
      streakExpiresAt: now + H48,
      isStreakActive: true,
    };
  }
  // else: نفس اليوم → لا تغيير في العدد، فقط حفظ الطوابع

  await saveStreak(updated);
  broadcastStreakUpdate(updated);
}

/**
 * يُستدعى كل ساعة لإعادة تصفير الـ streaks المنتهية.
 */
export async function expireOldStreaks(): Promise<number> {
  const now = Date.now();
  const all = await listAllStreaks();
  const toReset: StreakRow[] = [];

  for (const row of all) {
    if (
      row.streakExpiresAt != null &&
      now > row.streakExpiresAt &&
      row.streakCount > 0
    ) {
      toReset.push({
        ...row,
        streakCount: 0,
        lastExchangeAt: null,
        user1LastSentAt: null,
        user2LastSentAt: null,
        streakExpiresAt: null,
        isStreakActive: false,
      });
    }
  }

  if (toReset.length === 0) return 0;

  await saveStreaksBatch(toReset);
  for (const row of toReset) {
    broadcastStreakUpdate(row);
  }
  return toReset.length;
}

/** جلب بيانات السترك لعرضها في snapshot المستخدم */
export async function getStreakForChat(
  chatId: string,
): Promise<ReturnType<typeof toClient> | null> {
  const row = await getStreak(chatId);
  if (!row || row.streakCount === 0) return null;
  return toClient(row);
}
