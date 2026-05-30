import type { BanInfo } from "./moderationBanTypes";
import type { AccountStatus, ModerationUserNotice } from "./moderationTypes";

export const ACCOUNT_MODERATION_EVENT = "retweet-account-moderation";

export type AccountModerationEventDetail = {
  banInfo?: BanInfo | null;
  accountStatus?: AccountStatus | string;
  restored?: boolean;
  appealApproved?: boolean;
  appealId?: string;
  messageAr?: string;
  pendingNotice?: ModerationUserNotice | null;
};

export function isBannedAccountStatus(status?: string | null): boolean {
  return (
    status === "BANNED" ||
    status === "TEMP_BANNED" ||
    status === "PERMANENTLY_BANNED"
  );
}

export function moderationNoticeShownKey(userId: string, noticeId: string): string {
  return `retweet_mod_notice_shown_${userId}_${noticeId}`;
}

/** @deprecated استخدم moderationNoticeShownKey */
export function restoredAppealShownKey(userId: string, appealId: string): string {
  return moderationNoticeShownKey(userId, appealId);
}

export function hasModerationNoticeBeenShown(userId: string, noticeId: string): boolean {
  if (!userId || !noticeId || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(moderationNoticeShownKey(userId, noticeId)) === "1";
  } catch {
    return false;
  }
}

/** @deprecated */
export function hasRestoredAppealBeenShown(userId: string, appealId: string): boolean {
  return hasModerationNoticeBeenShown(userId, appealId);
}

export function markModerationNoticeShown(userId: string, noticeId: string): void {
  if (!userId || !noticeId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(moderationNoticeShownKey(userId, noticeId), "1");
  } catch {
    /* ignore */
  }
}

/** @deprecated */
export function markRestoredAppealShown(userId: string, appealId: string): void {
  markModerationNoticeShown(userId, appealId);
}

export function dispatchAccountModeration(detail: AccountModerationEventDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(ACCOUNT_MODERATION_EVENT, { detail }),
    );
  } catch {
    /* ignore */
  }
}

export async function notifyAccountBannedFromResponse(res: Response): Promise<void> {
  if (res.status !== 403) return;
  try {
    const data = (await res.clone().json()) as {
      error?: string;
      banInfo?: BanInfo;
    };
    if (data.error === "account_banned" && data.banInfo) {
      dispatchAccountModeration({
        banInfo: data.banInfo,
        accountStatus: data.banInfo.accountStatus,
      });
    }
  } catch {
    /* ignore */
  }
}
