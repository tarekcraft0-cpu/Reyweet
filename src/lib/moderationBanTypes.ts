import type { AccountStatus } from "./moderationTypes";

export type LinkedBanInfo = {
  sourceUsername: string;
  linkType: "ip" | "email";
};

export type BanInfo = {
  accountStatus: AccountStatus;
  username: string;
  avatar: string;
  banReason: string;
  banGuideline?: string;
  bannedAt: number;
  banExpiresAt?: number | null;
  canAppeal: boolean;
  permanentlyDisabled: boolean;
  /** حظر ربط — مرتبط بحساب آخر عُطّل تلقائياً */
  linkedBan?: LinkedBanInfo;
};
