/** مسح كاش محادثات ملوّث بعد إصلاح dm:chatId */
export const CHAT_ISOLATION_MIGRATION = "dm-chat-v2";

export function runChatIsolationMigration(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("retweet_chat_migration") === CHAT_ISOLATION_MIGRATION) return;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith("retweet_account_state_")) localStorage.removeItem(key);
    }
    localStorage.setItem("retweet_chat_migration", CHAT_ISOLATION_MIGRATION);
  } catch {
    /* ignore */
  }
}
