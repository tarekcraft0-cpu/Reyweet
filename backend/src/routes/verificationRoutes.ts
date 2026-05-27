import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getUserById,
  listUsers,
  updateUser,
  type UserRow,
} from "../db/engine.js";
import { isPlatformAdmin, userRowToVerificationPayload } from "../lib/verificationAdmin.js";
import {
  activateSubscriptionAndQueueVerification,
  createStripeCheckoutSession,
  createVerificationPaymentIntent,
  isStripeConfigured,
  stripePublishableKey,
  verifyStripeCheckoutSession,
  verifyStripePaymentIntent,
} from "../lib/stripeBilling.js";
import {
  getUserEntitlements,
  hasActiveSubscription,
  isAnimatedAvatarUrl,
  isVerifiedBadgeActive,
  VERIFICATION_SUBSCRIPTION_PLAN,
  VERIFICATION_SUBSCRIPTION_PRICE_USD,
} from "../../../src/lib/verificationEntitlements.js";

type AuthedReq = Request & { userId: string };

function entitlementsPayload(user: UserRow) {
  const ent = getUserEntitlements(user);
  return {
    ...userRowToVerificationPayload(user),
    entitlements: ent,
  };
}

function applyApprovedVerification(user: UserRow): Partial<UserRow> {
  return {
    verified: true,
    verificationStatus: "approved",
    verificationRejectReason: undefined,
    canUseAnimatedAvatar: true,
    storyMaxDuration: 60,
    storyExpiryOptions: [24, 48, 72],
    postCharacterLimit: 1000,
    isSubscribed: true,
    subscriptionPlan: user.subscriptionPlan || VERIFICATION_SUBSCRIPTION_PLAN,
  };
}

export function registerVerificationRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
  broadcastProfileUpdated: (user: UserRow) => void,
): void {
  app.get("/v1/subscription/status", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "not found" });
    return res.json(entitlementsPayload(user));
  });

  app.get("/v1/subscription/stripe/config", authMiddleware, async (_req, res) => {
    return res.json({
      configured: isStripeConfigured(),
      publishableKey: stripePublishableKey() || null,
      priceUsd: VERIFICATION_SUBSCRIPTION_PRICE_USD,
      currency: "usd",
    });
  });

  app.post("/v1/subscription/stripe/payment-intent", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const r = await createVerificationPaymentIntent(userId);
    if (!r.ok) return res.status(503).json({ error: r.error, configured: false });
    return res.json({
      ok: true,
      clientSecret: r.clientSecret,
      publishableKey: r.publishableKey,
      amountUsd: r.amountUsd,
    });
  });

  const confirmSchema = z.object({
    platform: z.enum(["stripe", "apple", "google", "dev"]),
    receipt: z.string().max(8000).optional(),
    transactionId: z.string().max(256).optional(),
    paymentIntentId: z.string().max(256).optional(),
  });

  app.post("/v1/subscription/confirm", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

    const { platform, receipt, transactionId, paymentIntentId } = parsed.data;
    const allowDev =
      platform === "dev" &&
      (process.env.SEED_DEMO === "1" || process.env.NODE_ENV !== "production");

    if (platform === "stripe") {
      const piId = paymentIntentId?.trim() || transactionId?.trim();
      if (!piId) {
        return res.status(400).json({ error: "معرّف الدفع مطلوب" });
      }
      if (piId.startsWith("cs_")) {
        const v = await verifyStripeCheckoutSession(piId, userId);
        if (!v.ok) return res.status(402).json({ error: v.error });
      } else if (piId.startsWith("pi_")) {
        const v = await verifyStripePaymentIntent(piId, userId);
        if (!v.ok) return res.status(402).json({ error: v.error });
      } else {
        const sess = await verifyStripeCheckoutSession(piId, userId);
        if (!sess.ok) {
          const pi = await verifyStripePaymentIntent(piId, userId);
          if (!pi.ok) return res.status(402).json({ error: pi.error });
        }
      }
    } else if (platform === "apple" || platform === "google") {
      if (!receipt?.trim() && !transactionId?.trim()) {
        return res.status(400).json({ error: "مطلوب إيصال الشراء" });
      }
      if (process.env.NODE_ENV === "production" && !process.env.IAP_SKIP_VERIFY) {
        return res.status(501).json({
          error: "تحقق المتجر قيد الإعداد — استخدم الدفع عبر الويب (بطاقة / Apple Pay)",
        });
      }
    } else if (!allowDev) {
      return res.status(403).json({ error: "غير مصرح" });
    }

    const user = await activateSubscriptionAndQueueVerification(userId);
    if (!user) return res.status(404).json({ error: "not found" });
    broadcastProfileUpdated(user);
    return res.json({
      ok: true,
      verificationQueued: user.verificationStatus === "pending",
      ...entitlementsPayload(user),
    });
  });

  app.post("/v1/subscription/stripe/checkout", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const r = await createStripeCheckoutSession(userId);
    if (!r.ok) {
      return res.status(503).json({
        error: r.error,
        configured: isStripeConfigured(),
      });
    }
    return res.json({ ok: true, url: r.url, sessionId: r.sessionId });
  });

  app.post("/v1/verification/request", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "not found" });

    const ent = getUserEntitlements(user);
    if (isVerifiedBadgeActive(user)) {
      return res.json({ ok: true, alreadyVerified: true, ...entitlementsPayload(user) });
    }
    if (!hasActiveSubscription(user)) {
      return res.status(402).json({ error: "يلزم الاشتراك قبل طلب التوثيق", code: "subscription_required" });
    }
    if (user.verificationStatus === "pending") {
      return res.json({ ok: true, pending: true, ...entitlementsPayload(user) });
    }

    const next = await updateUser(userId, {
      verificationStatus: "pending",
      verificationRequestedAt: new Date().toISOString(),
      verificationRejectReason: undefined,
    });
    if (!next) return res.status(404).json({ error: "not found" });
    broadcastProfileUpdated(next);
    return res.json({ ok: true, ...entitlementsPayload(next) });
  });

  app.get("/v1/verification/status", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "not found" });
    return res.json(entitlementsPayload(user));
  });

  const badgeColorSchema = z.object({
    verificationBadgeColor: z.enum(["blue", "pink"]),
  });

  app.patch("/v1/me/verification-badge-color", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = badgeColorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "لون غير صالح" });
    const cur = await getUserById(userId);
    if (!cur) return res.status(404).json({ error: "not found" });
    if (!isVerifiedBadgeActive(cur)) {
      return res.status(403).json({ error: "التوثيق مطلوب لتغيير لون الشارة" });
    }
    const user = await updateUser(userId, {
      verificationBadgeColor: parsed.data.verificationBadgeColor,
    });
    if (!user) return res.status(404).json({ error: "not found" });
    broadcastProfileUpdated(user);
    return res.json(entitlementsPayload(user));
  });

  app.get("/v1/admin/me", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    return res.json({ isAdmin: isPlatformAdmin(userId) });
  });

  app.get("/v1/admin/verification/requests", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    if (!isPlatformAdmin(userId)) return res.status(403).json({ error: "غير مصرح" });
    const pending = (await listUsers()).filter(u => u.verificationStatus === "pending");
    return res.json({
      requests: pending.map(u => ({
        ...userRowToVerificationPayload(u),
        displayName: u.displayName,
        avatar: u.avatar,
        bio: u.bio,
      })),
    });
  });

  app.post("/v1/admin/verification/:targetId/approve", authMiddleware, async (req, res) => {
    const adminId = (req as AuthedReq).userId;
    if (!isPlatformAdmin(adminId)) return res.status(403).json({ error: "غير مصرح" });
    const targetId = String(req.params.targetId ?? "");
    const cur = await getUserById(targetId);
    if (!cur) return res.status(404).json({ error: "المستخدم غير موجود" });
    const user = await updateUser(targetId, applyApprovedVerification(cur));
    if (!user) return res.status(404).json({ error: "not found" });
    broadcastProfileUpdated(user);
    return res.json({ ok: true, user: entitlementsPayload(user) });
  });

  const rejectSchema = z.object({ reason: z.string().max(500).optional() });

  app.post("/v1/admin/verification/:targetId/reject", authMiddleware, async (req, res) => {
    const adminId = (req as AuthedReq).userId;
    if (!isPlatformAdmin(adminId)) return res.status(403).json({ error: "غير مصرح" });
    const parsed = rejectSchema.safeParse(req.body ?? {});
    const targetId = String(req.params.targetId ?? "");
    const cur = await getUserById(targetId);
    if (!cur) return res.status(404).json({ error: "المستخدم غير موجود" });
    const user = await updateUser(targetId, {
      verified: false,
      verificationStatus: "rejected",
      verificationRejectReason: parsed.success ? parsed.data.reason?.trim() : undefined,
    });
    if (!user) return res.status(404).json({ error: "not found" });
    broadcastProfileUpdated(user);
    return res.json({ ok: true, user: entitlementsPayload(user) });
  });
}

/** يُستدعى من PATCH profile ورفع الوسائط */
export async function assertAvatarAllowed(user: UserRow, avatar: string): Promise<string | null> {
  const ent = getUserEntitlements(user);
  if (!isAnimatedAvatarUrl(avatar)) return null;
  if (!ent.canUseAnimatedAvatar) {
    return "الافتار المتحرك (GIF) متاح للحسابات الموثقة المشتركة فقط";
  }
  return null;
}
