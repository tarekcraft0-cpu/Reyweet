import { apiFetch } from "./apiBackend";
import {
  getUserEntitlements,
  type UserEntitlements,
  type VerificationBadgeColor,
  type VerificationStatus,
} from "./verificationEntitlements";

export type VerificationStatusResponse = {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  isSubscribed: boolean;
  subscriptionPlan: string;
  subscriptionExpiresAt?: string;
  verificationStatus: VerificationStatus;
  verificationBadgeColor: VerificationBadgeColor;
  verificationRequestedAt?: string;
  verificationRejectReason?: string;
  entitlements: UserEntitlements;
  verificationQueued?: boolean;
};

export type StripePublicConfig = {
  configured: boolean;
  publishableKey: string | null;
  priceUsd: number;
  currency: string;
};

export async function apiStripePublicConfig(
  token: string,
): Promise<{ ok: true; data: StripePublicConfig } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/subscription/stripe/config", { token });
  const data = (await res.json().catch(() => ({}))) as StripePublicConfig & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر جلب إعدادات الدفع" };
  return { ok: true, data };
}

export async function apiStripePaymentIntent(
  token: string,
): Promise<
  | { ok: true; clientSecret: string; publishableKey: string; amountUsd: number }
  | { ok: false; error: string }
> {
  const res = await apiFetch("/v1/subscription/stripe/payment-intent", { method: "POST", token });
  const data = (await res.json().catch(() => ({}))) as {
    clientSecret?: string;
    publishableKey?: string;
    amountUsd?: number;
    error?: string;
  };
  if (!res.ok || !data.clientSecret || !data.publishableKey) {
    return { ok: false, error: data.error || "تعذر بدء الدفع" };
  }
  return {
    ok: true,
    clientSecret: data.clientSecret,
    publishableKey: data.publishableKey,
    amountUsd: data.amountUsd ?? 4,
  };
}

export async function apiSubscriptionStatus(
  token: string,
): Promise<{ ok: true; data: VerificationStatusResponse } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/subscription/status", { token });
  const data = (await res.json().catch(() => ({}))) as VerificationStatusResponse & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر جلب حالة الاشتراك" };
  return { ok: true, data };
}

export async function apiStripeCheckout(
  token: string,
): Promise<{ ok: true; url: string; sessionId?: string } | { ok: false; error: string; configured?: boolean }> {
  const res = await apiFetch("/v1/subscription/stripe/checkout", { method: "POST", token });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    sessionId?: string;
    error?: string;
    configured?: boolean;
  };
  if (!res.ok || !data.url) {
    return { ok: false, error: data.error || "تعذر بدء الدفع", configured: data.configured };
  }
  return { ok: true, url: data.url, sessionId: data.sessionId };
}

export async function apiConfirmSubscription(
  token: string,
  body: {
    platform: "stripe" | "apple" | "google" | "dev";
    receipt?: string;
    transactionId?: string;
    paymentIntentId?: string;
  },
): Promise<{ ok: true; data: VerificationStatusResponse } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/subscription/confirm", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as VerificationStatusResponse & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر تفعيل الاشتراك" };
  return { ok: true, data };
}

export async function apiRequestVerification(
  token: string,
): Promise<{ ok: true; data: VerificationStatusResponse } | { ok: false; error: string; code?: string }> {
  const res = await apiFetch("/v1/verification/request", { method: "POST", token });
  const data = (await res.json().catch(() => ({}))) as VerificationStatusResponse & {
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || "تعذر إرسال الطلب", code: data.code };
  }
  return { ok: true, data };
}

export async function apiSetBadgeColor(
  token: string,
  verificationBadgeColor: VerificationBadgeColor,
): Promise<{ ok: true; data: VerificationStatusResponse } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/me/verification-badge-color", {
    method: "PATCH",
    token,
    body: JSON.stringify({ verificationBadgeColor }),
  });
  const data = (await res.json().catch(() => ({}))) as VerificationStatusResponse & { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر حفظ اللون" };
  return { ok: true, data };
}

export async function apiAdminMe(token: string): Promise<boolean> {
  const res = await apiFetch("/v1/admin/me", { token });
  const data = (await res.json().catch(() => ({}))) as { isAdmin?: boolean };
  return res.ok && data.isAdmin === true;
}

export type AdminVerificationRequest = VerificationStatusResponse & {
  displayName?: string;
  avatar: string;
  bio?: string;
};

export async function apiAdminListVerificationRequests(
  token: string,
): Promise<{ ok: true; requests: AdminVerificationRequest[] } | { ok: false; error: string }> {
  const res = await apiFetch("/v1/admin/verification/requests", { token });
  const data = (await res.json().catch(() => ({}))) as {
    requests?: AdminVerificationRequest[];
    error?: string;
  };
  if (!res.ok) return { ok: false, error: data.error || "تعذر جلب الطلبات" };
  return { ok: true, requests: data.requests ?? [] };
}

export async function apiAdminApproveVerification(
  token: string,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch(`/v1/admin/verification/${encodeURIComponent(targetId)}/approve`, {
    method: "POST",
    token,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر القبول" };
  return { ok: true };
}

export async function apiAdminRejectVerification(
  token: string,
  targetId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await apiFetch(`/v1/admin/verification/${encodeURIComponent(targetId)}/reject`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "تعذر الرفض" };
  return { ok: true };
}

export function applyVerificationPayloadToUser(
  prev: import("./types").User,
  data: VerificationStatusResponse,
): import("./types").User {
  const ent = data.entitlements ?? getUserEntitlements({ ...prev, ...data });
  return {
    ...prev,
    verified: data.verified,
    isSubscribed: data.isSubscribed,
    subscriptionPlan: data.subscriptionPlan,
    subscriptionExpiresAt: data.subscriptionExpiresAt,
    verificationStatus: data.verificationStatus,
    verificationBadgeColor: data.verificationBadgeColor,
    verificationRequestedAt: data.verificationRequestedAt,
    verificationRejectReason: data.verificationRejectReason,
    canUseAnimatedAvatar: ent.canUseAnimatedAvatar,
    storyMaxDuration: ent.storyMaxDurationSec,
    storyExpiryOptions: ent.storyExpiryHoursOptions,
    postCharacterLimit: ent.postCharacterLimit,
  };
}
