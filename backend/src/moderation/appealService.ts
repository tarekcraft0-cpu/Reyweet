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
  deleteOtpsForUser,
  findLatestOtp,
  getUserById,
  runOtpLocked,
  type OtpRow,
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

const APPEAL_OTP_TTL_MS = 15 * 60 * 1000;
/** لا يُرسل رمز جديد خلال هذه المدة بعد آخر إرسال ناجح */
const APPEAL_OTP_RESEND_GAP_MS = 60 * 1000;

function maskAppealEmail(email: string): string {
  return email.replace(/(.{2}).+(@.+)/, "$1***$2");
}

function latestAppealOtpRow(all: OtpRow[], otpUserId: string): OtpRow | null {
  return (
    all
      .filter(o => o.userId === otpUserId && o.purpose === "appeal")
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0] ?? null
  );
}

export async function startAppealEmailOtp(userId: string, req: Request) {
  const rl = rateLimitHit(`appeal-otp:${rateLimitClientKey(req)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) throw new AppealError("طلبات كثيرة", "rate_limit");
  const rlUser = rateLimitHit(`appeal-otp-user:${userId}`, 3, 60 * 60 * 1000);
  if (!rlUser.ok) throw new AppealError("طلبات كثيرة — حاول لاحقاً", "rate_limit");

  const user = await getUserById(userId);
  if (!user) throw new AppealError("مستخدم غير موجود", "not_found");

  const state = await getUserModerationState(userId);
  if (!canAppealStatus(state)) {
    throw new AppealError("لا يمكن تقديم طعن على هذا الحساب", "forbidden");
  }
  if (await hasRejectedAppealPermanent(userId)) {
    throw new AppealError("الحساب معطّل نهائياً", "permanent");
  }

  const otpUserId = appealOtpKey(userId);
  const emailHint = maskAppealEmail(user.email);

  const issued = await runOtpLocked(async all => {
    const existing = latestAppealOtpRow(all, otpUserId);
    const now = Date.now();
    if (existing) {
      const sentAt = new Date(existing.expiresAt).getTime() - APPEAL_OTP_TTL_MS;
      if (now - sentAt < APPEAL_OTP_RESEND_GAP_MS) {
        return { next: all, result: { send: false as const } };
      }
    }
    const code = generateOtpDigits();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now + APPEAL_OTP_TTL_MS).toISOString();
    const next = all.filter(o => !(o.userId === otpUserId && o.purpose === "appeal"));
    next.push({ userId: otpUserId, purpose: "appeal", codeHash, expiresAt });
    return { next, result: { send: true as const, code } };
  });

  if (!issued.send) {
    return { ok: true, emailHint, alreadySent: true };
  }

  const mail = await sendOtpEmail(user.email, "رمز التحقق — طعن على الحظر", issued.code, "الطعن");
  if (!mail.sent) {
    await deleteOtpsForUser(otpUserId, "appeal");
    throw new AppealError(mail.error || "تعذر إرسال البريد", "mail");
  }

  return { ok: true, emailHint };
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
  if (appeal.status === "approved" || appeal.status === "rejected") {
    throw new AppealError("تم البت في هذا الطعن مسبقاً", "already_decided");
  }

  const user = await getUserById(appeal.userId);
  if (!user) throw new AppealError("مستخدم غير موجود", "not_found");

  appeal.reviewedBy = moderatorId;
  appeal.reviewNote = note;
  appeal.updatedAt = Date.now();

  if (decision === "approve") {
    appeal.status = "approved";
    await saveAppeal(appeal);
    await restoreAccount(appeal.userId, moderatorId, {
      appealId: appeal.id,
      appealApproved: true,
    });
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
