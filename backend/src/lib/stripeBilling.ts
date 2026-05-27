import type { UserRow } from "../db/engine.js";
import { getUserById, updateUser } from "../db/engine.js";
import {
  isVerifiedBadgeActive,
  VERIFICATION_SUBSCRIPTION_PLAN,
} from "../../../src/lib/verificationEntitlements.js";

const VERIFIED_PRICE_CENTS = 400;

function stripeSecret(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function stripePublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
}

export function stripePriceId(): string | null {
  return process.env.STRIPE_VERIFIED_PRICE_ID?.trim() || null;
}

export function isStripeConfigured(): boolean {
  return !!(stripeSecret() && stripePublishableKey());
}

function addMonthIso(from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function stripeApi<T>(
  method: "GET" | "POST",
  path: string,
  body?: URLSearchParams,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const secret = stripeSecret();
  if (!secret) return { ok: false, error: "Stripe غير مُعدّ" };
  const url = `https://api.stripe.com/v1${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body && method === "POST" ? body : undefined,
  });
  const data = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) {
    return { ok: false, error: data.error?.message || "خطأ من Stripe", status: r.status };
  }
  return { ok: true, data };
}

async function getOrCreateStripeCustomer(user: UserRow): Promise<string | null> {
  const search = await stripeApi<{ data?: { id: string }[] }>(
    "GET",
    `/customers/search?query=${encodeURIComponent(`metadata['userId']:'${user.id}'`)}`,
  );
  if (search.ok && search.data.data?.[0]?.id) return search.data.data[0].id;

  const createBody = new URLSearchParams({
    "metadata[userId]": user.id,
    "metadata[username]": user.username,
  });
  if (user.email?.trim()) createBody.set("email", user.email.trim());
  const created = await stripeApi<{ id: string }>("POST", "/customers", createBody);
  if (!created.ok) return null;
  return created.data.id;
}

/** PaymentIntent شهري — يدعم البطاقة وApple Pay عبر Payment Element */
export async function createVerificationPaymentIntent(
  userId: string,
): Promise<
  | { ok: true; clientSecret: string; publishableKey: string; amountUsd: number }
  | { ok: false; error: string }
> {
  const publishableKey = stripePublishableKey();
  if (!publishableKey) return { ok: false, error: "STRIPE_PUBLISHABLE_KEY غير مُعدّ" };

  const user = await getUserById(userId);
  if (!user) return { ok: false, error: "المستخدم غير موجود" };

  const customerId = await getOrCreateStripeCustomer(user);
  if (!customerId) return { ok: false, error: "تعذر إنشاء عميل الدفع" };

  const body = new URLSearchParams({
    amount: String(VERIFIED_PRICE_CENTS),
    currency: "usd",
    customer: customerId,
    "automatic_payment_methods[enabled]": "true",
    "metadata[userId]": userId,
    "metadata[plan]": VERIFICATION_SUBSCRIPTION_PLAN,
    description: "Retweet Verified — اشتراك شهري",
  });

  const pi = await stripeApi<{ client_secret: string; id: string; status: string }>(
    "POST",
    "/payment_intents",
    body,
  );
  if (!pi.ok || !pi.data.client_secret) {
    return { ok: false, error: pi.ok ? "تعذر إنشاء جلسة الدفع" : pi.error };
  }

  return {
    ok: true,
    clientSecret: pi.data.client_secret,
    publishableKey,
    amountUsd: VERIFIED_PRICE_CENTS / 100,
  };
}

export async function verifyStripePaymentIntent(
  paymentIntentId: string,
  expectedUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pi = await stripeApi<{
    status: string;
    metadata?: { userId?: string };
  }>("GET", `/payment_intents/${encodeURIComponent(paymentIntentId)}`);

  if (!pi.ok) return { ok: false, error: pi.error };
  if (pi.data.status !== "succeeded") {
    return { ok: false, error: "لم يكتمل الدفع بعد" };
  }
  if (pi.data.metadata?.userId && pi.data.metadata.userId !== expectedUserId) {
    return { ok: false, error: "جلسة الدفع لا تخص هذا الحساب" };
  }
  return { ok: true };
}

export async function verifyStripeCheckoutSession(
  sessionId: string,
  expectedUserId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sess = await stripeApi<{
    payment_status?: string;
    status?: string;
    client_reference_id?: string;
  }>("GET", `/checkout/sessions/${encodeURIComponent(sessionId)}`);

  if (!sess.ok) return { ok: false, error: sess.error };
  if (sess.data.payment_status !== "paid" && sess.data.status !== "complete") {
    return { ok: false, error: "لم يكتمل الدفع" };
  }
  if (sess.data.client_reference_id && sess.data.client_reference_id !== expectedUserId) {
    return { ok: false, error: "جلسة الدفع لا تخص هذا الحساب" };
  }
  return { ok: true };
}

/** تفعيل الاشتراك وإرسال طلب التوثيق للمراجعة */
export async function activateSubscriptionAndQueueVerification(
  userId: string,
): Promise<UserRow | null> {
  const cur = await getUserById(userId);
  if (!cur) return null;

  let user = await updateUser(userId, {
    isSubscribed: true,
    subscriptionPlan: VERIFICATION_SUBSCRIPTION_PLAN,
    subscriptionExpiresAt: addMonthIso(),
  });
  if (!user) return null;

  if (!isVerifiedBadgeActive(user) && user.verificationStatus !== "pending") {
    user =
      (await updateUser(userId, {
        verificationStatus: "pending",
        verificationRequestedAt: new Date().toISOString(),
        verificationRejectReason: undefined,
      })) ?? user;
  }

  return user;
}

export async function createStripeCheckoutSession(
  userId: string,
): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; error: string }> {
  const secret = stripeSecret();
  const priceId = stripePriceId();
  const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");

  if (!secret || !priceId) {
    return { ok: false, error: "Stripe غير مُعدّ (المفتاح أو معرّف السعر)" };
  }

  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${appUrl}/app/?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/app/?subscription=cancel`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: userId,
    "payment_method_types[0]": "card",
    "payment_method_types[1]": "link",
  });

  const r = await stripeApi<{ url?: string; id?: string }>("POST", "/checkout/sessions", body);
  if (!r.ok || !r.data.url || !r.data.id) {
    return { ok: false, error: r.ok ? "فشل إنشاء جلسة الدفع" : r.error };
  }
  return { ok: true, url: r.data.url, sessionId: r.data.id };
}
