import type { ID } from "./types";

export type AccountStatus =
  | "ACTIVE"
  | "RESTRICTED"
  | "SHADOW_BANNED"
  | "TEMP_BANNED"
  | "BANNED"
  | "PERMANENTLY_BANNED";

export type ReportTargetType = "user" | "post" | "comment" | "message" | "story";

export type ReportCategoryId =
  | "spam"
  | "fake_account"
  | "impersonation"
  | "nudity"
  | "hate_speech"
  | "violence"
  | "harassment"
  | "scam"
  | "terrorism"
  | "child_exploitation"
  | "self_harm"
  | "drugs"
  | "intellectual_property"
  | "other";

export type ImpersonationTarget =
  | "me"
  | "someone_i_know"
  | "celebrity"
  | "business";

export type ModerationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "escalated";

export type AppealStatus = "pending" | "under_review" | "approved" | "rejected";

export type ModeratorRole =
  | "support_agent"
  | "senior_moderator"
  | "admin"
  | "super_admin"
  | "internal_trusted";

export type ModeratorActionType =
  | "ignore"
  | "warn"
  | "temp_ban"
  | "perm_ban"
  | "shadow_ban"
  | "restrict"
  | "delete_content"
  | "force_password_reset";

export interface ReportEvidence {
  text?: string;
  attachmentUrls?: string[];
  impersonationTarget?: ImpersonationTarget;
  realAccountUsername?: string;
  realAccountUserId?: ID;
}

export interface ModerationReport {
  id: string;
  reporterId: ID;
  reportedUserId: ID;
  targetType: ReportTargetType;
  targetId?: string;
  category: ReportCategoryId;
  subcategory?: string;
  evidence: ReportEvidence;
  status: ModerationStatus;
  deviceFingerprint?: string;
  ip?: string;
  userAgent?: string;
  createdAt: number;
  updatedAt: number;
  assignedModeratorId?: ID;
  linkedReportIds?: string[];
}

export interface UserViolation {
  id: string;
  userId: ID;
  reportId?: string;
  action: ModeratorActionType;
  reason: string;
  guideline?: string;
  at: number;
  moderatorId: ID;
}

export interface UserModerationState {
  userId: ID;
  accountStatus: AccountStatus;
  banReason?: string;
  banGuideline?: string;
  bannedAt?: number;
  banExpiresAt?: number | null;
  restrictedUntil?: number;
  shadowBanned?: boolean;
  violationCount: number;
  violations: UserViolation[];
  deviceFingerprints: string[];
  ipAddresses: string[];
  updatedAt: number;
}

export interface ModerationAppeal {
  id: string;
  userId: ID;
  reportId?: string;
  status: AppealStatus;
  message: string;
  phone?: string;
  attachmentUrls?: string[];
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
  reviewedBy?: ID;
  reviewNote?: string;
}

export const REPORT_CATEGORIES: {
  id: ReportCategoryId;
  labelAr: string;
  labelEn: string;
  needsImpersonationFlow?: boolean;
}[] = [
  { id: "spam", labelAr: "سبام", labelEn: "Spam" },
  { id: "fake_account", labelAr: "حساب وهمي", labelEn: "Fake Account" },
  { id: "impersonation", labelAr: "انتحال شخصية", labelEn: "Pretending To Be Someone", needsImpersonationFlow: true },
  { id: "nudity", labelAr: "عري أو نشاط جنسي", labelEn: "Nudity or Sexual Activity" },
  { id: "hate_speech", labelAr: "خطاب كراهية", labelEn: "Hate Speech" },
  { id: "violence", labelAr: "عنف", labelEn: "Violence" },
  { id: "harassment", labelAr: "تحرش أو تنمر", labelEn: "Harassment or Bullying" },
  { id: "scam", labelAr: "احتيال", labelEn: "Scam or Fraud" },
  { id: "terrorism", labelAr: "إرهاب", labelEn: "Terrorism" },
  { id: "child_exploitation", labelAr: "استغلال أطفال", labelEn: "Child Exploitation" },
  { id: "self_harm", labelAr: "إيذاء النفس", labelEn: "Self Harm" },
  { id: "drugs", labelAr: "مخدرات", labelEn: "Drugs" },
  { id: "intellectual_property", labelAr: "ملكية فكرية", labelEn: "Intellectual Property" },
  { id: "other", labelAr: "أخرى", labelEn: "Other" },
];
