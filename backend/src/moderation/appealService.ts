import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import {
  appendModerationAudit,
  getActiveAppealForUser,
  getAppeal,
  hasRejectedAppealPermanent,
  saveAppeal,
} from "../db/moderationStore.js";
import type { ModerationAppeal } from "../../../src/lib/moderationTypes.js";
import {
  createOtp,
  deleteOtpsForUser,
  findLatestOtp,
  getUserById,
} from "../db/engine.js";
import { sendOtpEmail } from "../lib/mail.js";
import { generateOtpDigits } from "../lib/otp.js";
import { canAppealStatus, getBanInfoForUser, rejectAppealPermanent, restoreAccount } from "./banEngine.js";
import { getUserModerationState } from "../db/moderationStore.js";
import { getModeratorRole } from "./moderatorRoles.js";
import { canReviewAppeals } from "../../../src/lib/moderationRbac.js";
import { rateLimitHit, rateLimitClientKey } from "../lib/rateLimit.js";

export class AppealError extends Error {
  constructor(message: string, readonly code: string = "invalid") {
    super(message);
    this.name = "AppealError";
  }
}

function appealOtpKey(userId: string) {
  return `appeal:${userId}`;
}

export async function startAppealEmailOtp(userId: string, req: Request) {
  const rl = rateLimitHit(`appeal-otp:${rateLimitClientKey(req)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) throw new AppealError("طلبات كثيرة", "rate_limit");

  const user = await getUserById(userId);
  if (!user) throw new AppealError("مستخدم غير موجود", "not_found");

  const state = await getUserModerationState(userId);
  if (!canAppealStatus(state)) {
    throw new AppealError("لا يمكن تقديم طعن على هذا الحساب", "forbidden");
  }
  if (await hasRejectedAppealPermanent(userId)) {
    throw new AppealError("الحساب معطّل نهائياً", "permanent");
  }

  const code = generateOtpDigits();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await deleteOtpsForUser(appealOtpKey(userId), "appeal");
  await createOtp({ userId: appealOtpKey(userId), purpose: "appeal", codeHash, expiresAt });

  const mail = await sendOtpEmail(user.email, "رمز التحقق — طعن على الحظر", code, "الطعن");
  if (!mail.sent) throw new AppealError(mail.error || "تعذر إرسال البريد", "mail");

  return { ok: true, emailHint: user.email.replace(/(.{2}).+(@.+)/, "$1***$2") };
}

export async function verifyAppealEmailOtp(userId: string, code: string) {
  const otp = await findLatestOtp(appealOtpKey(userId), "appeal");
  if (!otp || otp.expiresAt < new Date().toISOString()) {
    throw new AppealError("انتهى رمز التحقق", "expired");
  }
  const match = await bcrypt.compare(code.trim(), otp.codeHash);
  if (!match) throw new AppealError("رمز غير صحيح", "invalid");
  await deleteOtpsForUser(appealOtpKey(userId), "appeal");
  return { emailVerified: true };
}

export async function submitAppeal(
  userId: string,
  input: {
    message: string;
    phone?: string;
    attachmentUrls?: string[];
    emailVerified: boolean;
  },
): Promise<ModerationAppeal> {
  if (!input.emailVerified) throw new AppealError("يجب التحقق من البريد أولاً", "email");
  if (!input.message.trim() || input.message.length > 4000) {
    throw new AppealError("رسالة الطعن مطلوبة", "invalid");
  }

  const state = await getUserModerationState(userId);
  if (!canAppealStatus(state)) throw new AppealError("لا يمكن الطعن", "forbidden");

  const existing = await getActiveAppealForUser(userId);
  if (existing) throw new AppealError("يوجد طعن قيد المراجعة", "duplicate");

  const now = Date.now();
  const appeal: ModerationAppeal = {
    id: randomUUID(),
    userId,
    status: "pending",
    message: input.message.trim(),
    phone: input.phone?.trim(),
    attachmentUrls: input.attachmentUrls?.slice(0, 5),
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  await saveAppeal(appeal);
  await appendModerationAudit({
    actorId: userId,
    action: "appeal.submitted",
    entityType: "appeal",
    entityId: appeal.id,
  });
  return appeal;
}

export async function decideAppeal(
  moderatorId: string,
  appealId: string,
  decision: "approve" | "reject",
  note?: string,
) {
  const role = getModeratorRole(moderatorId);
  if (!role || !canReviewAppeals(role)) throw new AppealError("غير مصرح", "forbidden");

  const appeal = await getAppeal(appealId);
  if (!appeal) throw new AppealError("الطعن غير موجود", "not_found");

  const user = await getUserById(appeal.userId);
  if (!user) throw new AppealError("مستخدم غير موجود", "not_found");

  appeal.reviewedBy = moderatorId;
  appeal.reviewNote = note;
  appeal.updatedAt = Date.now();

  if (decision === "approve") {
    appeal.status = "approved";
    await saveAppeal(appeal);
    await restoreAccount(appeal.userId, moderatorId);
    return {
      appeal,
      banInfo: null,
      restored: true,
      message: "Your account has been restored.",
      messageAr: "تم استعادة حسابك.",
    };
  }

  appeal.status = "rejected";
  await saveAppeal(appeal);
  await rejectAppealPermanent(appeal.userId, moderatorId);
  const banInfo = await getBanInfoForUser(user);
  return {
    appeal,
    banInfo,
    restored: false,
    message: "Your account has been permanently disabled.",
    messageAr: "تم تعطيل حسابك نهائياً.",
  };
}
