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

function publicAppUrl(): string {
  const raw =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.RETWEET_PUBLIC_APP_URL?.trim() ||
    "https://reyweet.vercel.app";
  const base = raw.replace(/\/$/, "");
  return base.endsWith("/app") ? `${base}/` : `${base}/app/`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendPlainMail(
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<{ sent: boolean; error?: string }> {
  const tx = getTransporter();
  if (!tx) {
    return { sent: false, error: "إعدادات البريد غير مكتملة (SMTP_HOST / SMTP_USER / SMTP_PASS)" };
  }
  try {
    await tx.sendMail({
      from: mailFrom(),
      to: to.trim().toLowerCase(),
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل إرسال البريد";
    console.error("[mail] send failed:", subject, msg);
    return { sent: false, error: msg };
  }
}

/** إشعار تعطيل الحساب — مع السبب وخيار الطعن */
export async function sendAccountBannedEmail(opts: {
  to: string;
  username: string;
  banReason: string;
  banGuideline?: string;
  canAppeal: boolean;
  permanent: boolean;
  banExpiresAt?: number | null;
}): Promise<{ sent: boolean; error?: string }> {
  const userLabel = `@${opts.username}`;
  const reason = opts.banReason.trim() || "انتهاك إرشادات المجتمع";
  const appUrl = publicAppUrl();
  const expiryLine =
    !opts.permanent && opts.banExpiresAt
      ? `\nينتهي الحظر في: ${new Date(opts.banExpiresAt).toLocaleString("ar")}\n`
      : "";

  const appealBlock = opts.canAppeal
    ? [
        "",
        "إذا كنت تعتقد أن تعطيل حسابك كان عن طريق الخطأ، يمكنك تقديم طعن من داخل التطبيق بعد تسجيل الدخول بحسابك المعطّل.",
        `افتح التطبيق: ${appUrl}`,
      ].join("\n")
    : [
        "",
        "هذا القرار نهائي ولا يمكن تقديم طعن عليه عبر التطبيق.",
      ].join("\n");

  const subject = opts.permanent
    ? `تم تعطيل حسابك نهائياً — ${userLabel}`
    : `تم تعطيل حسابك — ${userLabel}`;

  const text = [
    "مرحباً،",
    "",
    `تم تعطيل حساب Retweet التالي: ${userLabel}`,
    "",
    `سبب التعطيل: ${reason}`,
    opts.banGuideline?.trim() ? `إرشاد المجتمع: ${opts.banGuideline.trim()}` : "",
    expiryLine,
    appealBlock,
    "",
    "— فريق Retweet",
  ]
    .filter(Boolean)
    .join("\n");

  const htmlReason = escapeHtml(reason);
  const htmlGuideline = opts.banGuideline?.trim()
    ? `<p><strong>إرشاد المجتمع:</strong> ${escapeHtml(opts.banGuideline.trim())}</p>`
    : "";
  const htmlExpiry =
    !opts.permanent && opts.banExpiresAt
      ? `<p style="color:#666;font-size:14px">ينتهي الحظر في: ${escapeHtml(new Date(opts.banExpiresAt).toLocaleString("ar"))}</p>`
      : "";
  const htmlAppeal = opts.canAppeal
    ? `<p>إذا كنت تعتقد أن تعطيل حسابك كان <strong>عن طريق الخطأ</strong>، يمكنك <strong>تقديم طعن</strong> من داخل التطبيق بعد تسجيل الدخول بحسابك المعطّل.</p>
<p><a href="${escapeHtml(appUrl)}">فتح التطبيق</a></p>`
    : `<p style="color:#666">هذا القرار نهائي ولا يمكن تقديم طعن عليه عبر التطبيق.</p>`;

  const html = `<div dir="rtl" style="font-family:sans-serif;line-height:1.6">
<p>مرحباً،</p>
<p>تم <strong>تعطيل</strong> حساب Retweet التالي:</p>
<p style="font-size:18px;font-weight:bold;margin:12px 0">${escapeHtml(userLabel)}</p>
<p><strong>سبب التعطيل:</strong> ${htmlReason}</p>
${htmlGuideline}
${htmlExpiry}
${htmlAppeal}
<p style="color:#888;font-size:13px;margin-top:24px">— فريق Retweet</p>
</div>`;

  return sendPlainMail(opts.to, subject, text, html);
}

/** إشعار فك الحظر النهائي بعد مراجعة الدعم — تعطيل كان عن طريق الخطأ */
export async function sendAccountRestoredWrongfulPermanentBanEmail(opts: {
  to: string;
  username: string;
}): Promise<{ sent: boolean; error?: string }> {
  const userLabel = `@${opts.username}`;
  const appUrl = publicAppUrl();
  const subject = `تم فك الحظر النهائي عن حسابك — ${userLabel}`;

  const text = [
    "مرحباً،",
    "",
    `بعد مراجعة طلبك لدى فريق الدعم، تبين أن تعطيل حسابك ${userLabel} نهائياً كان عن طريق الخطأ.`,
    "",
    "نعتذر بصدق عن هذا الخطأ. تم فك الحظر النهائي واستعادة حسابك ويمكنك تسجيل الدخول واستخدام التطبيق بشكل طبيعي.",
    "",
    `افتح التطبيق: ${appUrl}`,
    "",
    "— فريق Retweet",
  ].join("\n");

  const html = `<div dir="rtl" style="font-family:sans-serif;line-height:1.6">
<p>مرحباً،</p>
<p>بعد مراجعة طلبك لدى <strong>فريق الدعم</strong>، تبين أن <strong>تعطيل حسابك نهائياً</strong> كان عن طريق الخطأ:</p>
<p style="font-size:18px;font-weight:bold;margin:12px 0">${escapeHtml(userLabel)}</p>
<p>نعتذر بصدق عن هذا الخطأ. تم <strong>فك الحظر النهائي</strong> و<strong>استعادة حسابك</strong> ويمكنك تسجيل الدخول واستخدام التطبيق بشكل طبيعي.</p>
<p><a href="${escapeHtml(appUrl)}">فتح التطبيق</a></p>
<p style="color:#888;font-size:13px;margin-top:24px">— فريق Retweet</p>
</div>`;

  return sendPlainMail(opts.to, subject, text, html);
}

/** إشعار قبول الطعن واستعادة الحساب */
export async function sendAccountRestoredAfterAppealEmail(opts: {
  to: string;
  username: string;
}): Promise<{ sent: boolean; error?: string }> {
  const userLabel = `@${opts.username}`;
  const appUrl = publicAppUrl();
  const subject = `تم استعادة حسابك — ${userLabel}`;

  const text = [
    "مرحباً،",
    "",
    `شكراً لك على الوقت الذي خصصته لتقديم طعن على تعطيل حسابك ${userLabel}.`,
    "",
    "نعتذر عن الخطأ الذي حدث — تبين أن تعطيل حسابك كان عن طريق الخطأ، وقد تمت استعادة حسابك ويمكنك استخدام التطبيق بشكل طبيعي.",
    "",
    `افتح التطبيق: ${appUrl}`,
    "",
    "— فريق Retweet",
  ].join("\n");

  const html = `<div dir="rtl" style="font-family:sans-serif;line-height:1.6">
<p>مرحباً،</p>
<p>شكراً لك على الوقت الذي خصصته لتقديم <strong>طعن</strong> على تعطيل حسابك:</p>
<p style="font-size:18px;font-weight:bold;margin:12px 0">${escapeHtml(userLabel)}</p>
<p>نعتذر عن <strong>الخطأ</strong> الذي حدث — تبين أن تعطيل حسابك كان <strong>عن طريق الخطأ</strong>، وقد تمت <strong>استعادة حسابك</strong> ويمكنك استخدام التطبيق بشكل طبيعي.</p>
<p><a href="${escapeHtml(appUrl)}">فتح التطبيق</a></p>
<p style="color:#888;font-size:13px;margin-top:24px">— فريق Retweet</p>
</div>`;

  return sendPlainMail(opts.to, subject, text, html);
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
