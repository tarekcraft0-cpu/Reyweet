import type { BanInfo } from "./moderationBanTypes";
import type {
  ImpersonationTarget,
  ModerationReport,
  ModerationUserNotice,
  ReportCategoryId,
  ReportTargetType,
} from "./moderationTypes";
import { apiFetch, getApiToken } from "./apiBackend";

export type { BanInfo };

async function modFetch<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number; banInfo?: BanInfo }> {
  const token = init?.token ?? getApiToken();
  const res = await apiFetch(path, { ...init, token });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    banInfo?: BanInfo;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "فشل الطلب",
      status: res.status,
      banInfo: data.banInfo,
    };
  }
  return { ok: true, data };
}

export async function apiGetReportCategories() {
  return modFetch<{ categories: { id: ReportCategoryId; labelAr: string; labelEn: string; needsImpersonationFlow?: boolean }[] }>(
    "/v1/moderation/categories",
    { method: "GET" },
  );
}

export async function apiSubmitReport(body: {
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId?: string;
  category: ReportCategoryId;
  subcategory?: string;
  evidence?: {
    text?: string;
    attachmentUrls?: string[];
    impersonationTarget?: ImpersonationTarget;
    realAccountUsername?: string;
    realAccountUserId?: string;
  };
}) {
  return modFetch<{ ok: true; reportId: string; ticketId: string }>("/v1/moderation/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiGetMyModerationStatus() {
  return modFetch<{
    accountStatus: string;
    banInfo: BanInfo | null;
    canAppeal: boolean;
    permanentlyDisabled: boolean;
    pendingNotice: ModerationUserNotice | null;
    activeAppeal: { id: string; status: "pending" | "under_review" | "approved" | "rejected"; createdAt: number } | null;
    latestAppeal: { id: string; status: "pending" | "under_review" | "approved" | "rejected"; updatedAt: number } | null;
  }>("/v1/me/moderation/status", { method: "GET" });
}

export async function apiDismissModerationNotice(noticeId: string) {
  return modFetch<{ ok: true }>("/v1/me/moderation/dismiss-notice", {
    method: "POST",
    body: JSON.stringify({ noticeId }),
  });
}

export async function apiAppealSendOtp() {
  return modFetch<{ ok: true; emailHint: string }>("/v1/me/appeal/otp", { method: "POST" });
}

export async function apiAppealVerifyEmail(code: string) {
  return modFetch<{ emailVerified: boolean }>("/v1/me/appeal/verify-email", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiSubmitAppeal(body: {
  message: string;
  phone?: string;
  attachmentUrls?: string[];
  emailVerified: true;
}) {
  return modFetch<{ ok: true; appealId: string }>("/v1/me/appeal", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiAdminModerationMe() {
  return modFetch<{ isModerator: boolean; role: string | null }>("/v1/admin/moderation/me", {
    method: "GET",
  });
}

export async function apiAdminListReports(params?: { status?: string; q?: string }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.q) q.set("q", params.q);
  const qs = q.toString();
  return modFetch<{ reports: ModerationReport[] }>(
    `/v1/admin/moderation/reports${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

export async function apiAdminReviewReport(
  reportId: string,
  body: {
    status?: string;
    action?: string;
    reason?: string;
    guideline?: string;
    durationHours?: number;
    note?: string;
  },
) {
  return modFetch<{ report: ModerationReport }>(
    `/v1/admin/moderation/reports/${encodeURIComponent(reportId)}/review`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function apiAdminListAppeals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return modFetch<{ appeals: unknown[] }>(`/v1/admin/moderation/appeals${qs}`, { method: "GET" });
}

export async function apiAdminDecideAppeal(
  appealId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  return modFetch<{ restored: boolean; messageAr: string }>(
    `/v1/admin/moderation/appeals/${encodeURIComponent(appealId)}/decide`,
    { method: "POST", body: JSON.stringify({ decision, note }) },
  );
}

export async function apiFetchBannedUserPreview(userId: string) {
  return modFetch<{ banned: boolean; user?: { username: string; banMessageAr: string } }>(
    `/v1/users/${encodeURIComponent(userId)}/banned-preview`,
    { method: "GET" },
  );
}

export type AdminModerationUserState = {
  userId: string;
  accountStatus: string;
  banReason?: string;
  bannedAt?: number;
};

export async function apiAdminLookupUserByUsername(username: string) {
  return modFetch<{
    user: { id: string; username: string; email: string };
    state: AdminModerationUserState;
    banned: boolean;
    permanentlyDisabled: boolean;
  }>(`/v1/admin/moderation/users/by-username/${encodeURIComponent(username)}`, { method: "GET" });
}

export async function apiAdminRestoreUser(
  userId: string,
  body: { note?: string; wrongfulPermanent?: boolean },
) {
  return modFetch<{
    ok: true;
    restored: boolean;
    userId: string;
    username: string;
    messageAr: string;
  }>(`/v1/admin/moderation/users/${encodeURIComponent(userId)}/restore`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
