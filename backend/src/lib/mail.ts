import nodemailer from "nodemailer";

/** يدعم SMTP_* أو EMAIL_* (Gmail App Password) */
export function smtpUser(): string {
  return (process.env.SMTP_USER || process.env.EMAIL_USER || "").trim();
}

/** كلمات مرور Gmail تُنسخ أحياناً بمسافات — نزيلها */
export function smtpPass(): string {
  const raw = process.env.SMTP_PASS || process.env.EMAIL_PASS || "";
  return raw.replace(/\s+/g, "");
}

export function smtpHost(): string {
  return (process.env.SMTP_HOST || "smtp.gmail.com").trim();
}

export function isSmtpConfigured(): boolean {
  return !!(smtpHost() && smtpUser() && smtpPass());
}

function smtpPort(): number {
  const n = Number(process.env.SMTP_PORT || 465);
  return Number.isFinite(n) ? n : 465;
}

function smtpSecure(): boolean {
  if (process.env.SMTP_SECURE === "0") return false;
  if (process.env.SMTP_SECURE === "1") return true;
  return smtpPort() === 465;
}

function mailFrom(): string {
  const from = (process.env.SMTP_FROM || "").trim();
  if (from) return from;
  const user = smtpUser();
  return user ? `Retweet <${user}>` : "noreply@retweet.app";
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost(),
      port: smtpPort(),
      secure: smtpSecure(),
      auth: {
        user: smtpUser(),
        pass: smtpPass(),
      },
    });
  }
  return transporter;
}

export async function verifySmtpConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  const tx = getTransporter();
  if (!tx) return { ok: false, error: "SMTP غير مُعدّ" };
  try {
    await tx.verify();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الاتصال بـ SMTP";
    return { ok: false, error: msg };
  }
}

export async function sendOtpEmail(
  to: string,
  subject: string,
  code: string,
  purposeLabel: string,
): Promise<{ sent: boolean; error?: string }> {
  const body = [
    "مرحباً،",
    "",
    `رمز التحقق (${purposeLabel}) في Retweet:`,
    "",
    `    ${code}`,
    "",
    "صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أحد.",
  ].join("\n");

  const tx = getTransporter();
  if (!tx) {
    return { sent: false, error: "إعدادات البريد غير مكتملة (SMTP_HOST / SMTP_USER / SMTP_PASS)" };
  }

  try {
    await tx.sendMail({
      from: mailFrom(),
      to: to.trim().toLowerCase(),
      subject,
      text: body,
      html: `<div dir="rtl" style="font-family:sans-serif">
<p>مرحباً،</p>
<p>رمز التحقق (<strong>${purposeLabel}</strong>) في <strong>Retweet</strong>:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold;margin:16px 0">${code}</p>
<p style="color:#666;font-size:14px">صالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أحد.</p>
</div>`,
    });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل إرسال البريد";
    console.error("[mail] sendOtpEmail failed:", msg);
    return { sent: false, error: msg };
  }
}

export async function sendPasswordResetLinkEmail(
  to: string,
  resetLink: string,
): Promise<{ sent: boolean; error?: string }> {
  const subject = "إعادة تعيين كلمة المرور — Retweet";
  const text = [
    "مرحباً،",
    "",
    "طلبت إعادة تعيين كلمة المرور في Retweet.",
    "اضغط الرابط التالي (صالح لمدة ساعة):",
    "",
    resetLink,
    "",
    "إن لم تطلب ذلك تجاهل هذه الرسالة.",
  ].join("\n");

  const tx = getTransporter();
  if (!tx) return { sent: false, error: "SMTP غير مُعدّ" };

  try {
    await tx.sendMail({
      from: mailFrom(),
      to: to.trim().toLowerCase(),
      subject,
      text,
      html: `<p dir="rtl">طلبت إعادة تعيين كلمة المرور في <strong>Retweet</strong>.</p><p><a href="${resetLink}">اضغط هنا لتعيين كلمة مرور جديدة</a></p><p style="font-size:12px;color:#666">صالح لمدة ساعة.</p>`,
    });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل إرسال البريد";
    return { sent: false, error: msg };
  }
}
