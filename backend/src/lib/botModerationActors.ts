/** حظر مباشر — نشاط بوت */
export const SYSTEM_BOT_GUARD_ACTOR = "system:bot-guard";
/** حظر ربط — مرتبط بحساب بوت عبر IP أو إيميل */
export const SYSTEM_BOT_LINK_ACTOR = "system:bot-link";

export const BOT_MODERATION_ACTORS = new Set([SYSTEM_BOT_GUARD_ACTOR, SYSTEM_BOT_LINK_ACTOR]);
