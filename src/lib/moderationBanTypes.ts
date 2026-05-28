import type { AccountStatus } from "./moderationTypes";

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
};
