import "dotenv/config";
import crypto from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import multer from "multer";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import {
  DATA_ROOT,
  HOST,
  MEDIA_IMAGES_DIR,
  MEDIA_VIDEOS_DIR,
  PORT,
  PUBLIC_BASE_URL,
} from "./config.js";
import { normalizePhone, validateOptionalPhone } from "./lib/phone.js";
import { normalizeUsername, USERNAME_PATTERN, validateUsernameFormat } from "./lib/usernameRules.js";
import {
  createOtp,
  createUser,
  deleteOtpsForUser,
  findLatestOtp,
  findUserByEmailOrUsername,
  findUserByUsername,
  findUserByGoogleId,
  getSnapshot,
  getUserById,
  initDatabase,
  setSnapshot,
  updateUser,
  usernameExists,
  listMessagesByChatId,
  searchUsers,
  listRecentUsers,
  listUsers,
  listStories,
  replaceStories,
} from "./db/engine.js";
import type { StoryRow } from "./db/engine.js";
import {
  broadcastSseEvent,
  broadcastSseExcept,
  broadcastSseToUser,
  registerSseClient,
  removeSseClient,
} from "./lib/realtimeHub.js";
import { emitToUsers } from "./lib/realtimeSocket.js";
import { ingestDirectMessage, postMessageSchema } from "./lib/ingestDirectMessage.js";
import {
  assertChatReadAccess,
  ChatAccessError,
  filterMessagesForParticipant,
} from "./lib/chatAccess.js";
import {
  shareGroupChatWithMembers,
  patchGroupChatForMembers,
  loadGroupChatForAdmin,
  syncGroupChatCanonical,
  memberHasGroupChat,
} from "./lib/groupChatDelivery.js";
import {
  generateInviteCode,
  registerGroupInvite,
  resolveGroupInvite,
} from "./db/groupInvites.js";
import type { Chat } from "../../src/lib/types.js";
import { attachRealtimeSocket } from "./lib/realtimeSocket.js";
import { clearUserTyping, setUserTyping } from "./lib/chatPresence.js";
import {
  hydrateChatsFromUserMessages,
  hydrateStateWithMessages,
  messageRowToClient,
} from "./lib/chatMessages.js";
import { mergeDbUsersIntoAppState } from "./lib/mergeDbUsers.js";
import { scopeAppStateToOwner } from "./lib/scopeAppState.js";
import { storiesVisibleToViewer } from "./lib/storyVisibility.js";
import { mergeDbPostsIntoAppState } from "./lib/mergeDbPosts.js";
import { mergeSocialGraphIntoAppState } from "./lib/mergeSocialGraph.js";
import { signAccessToken, verifyAccessToken } from "./lib/jwt.js";
import { generateOtpDigits } from "./lib/otp.js";
import {
  isSmtpConfigured,
  sendOtpEmail,
  sendPasswordResetLinkEmail,
  verifySmtpConnection,
} from "./lib/mail.js";
import type { AppState, StoryItem } from "../../src/lib/types.js";
import type { UserRow } from "./db/engine.js";
import { rateLimitClientKey, rateLimitHit } from "./lib/rateLimit.js";
import { createCorsOriginChecker } from "./lib/corsOrigin.js";
import {
  getDeviceFingerprintFromRequest,
  getDeviceLabelFromRequest,
  needsLoginEmailOtp,
  trustDeviceForUser,
} from "./lib/loginSecurity.js";
import {
  compressAndSaveVideo,
  isDataUrl,
  processDataUrl,
  rewriteDataUrlsInValue,
  saveAudioFile,
  saveUploadedImage,
  saveVideoFile,
} from "./lib/mediaCompress.js";
import { buildMinimalAppState, syncNormalizedFromAppState } from "./lib/syncAppState.js";
import { coerceAppStateForClient } from "./lib/coerceAppState.js";
import { toClientMediaRef } from "./lib/normalizeMediaRef.js";
import { mountStaticSite } from "./lib/serveStaticSite.js";
import {
  acceptFollowRequest,
  declineFollowRequest,
  toggleFollowOnServer,
} from "./lib/socialActions.js";
import { getSocialRelation } from "./lib/socialGraph.js";
import { socialListsForUser } from "./lib/socialCounts.js";
import { createGroupRouter } from "./routes/groupRoutes.js";
import { createModerationRouter } from "./routes/moderationRoutes.js";
import {
  bannedPublicProfilePayload,
  getBanInfoForUser,
  isBannedStatus,
  resolveEffectiveStatus,
} from "./moderation/banEngine.js";
import { ensureGroupRecord } from "./groups/groupService.js";
import type { GroupVisibility } from "../../src/lib/groupTypes.js";
import { DEFAULT_AVATAR_DATA_URI } from "./lib/defaultAvatar.js";

const DUMMY_PASSWORD_HASH =
  "$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG";

const MAX_JSON_BODY_BYTES = 6 * 1024 * 1024;

const app = express();
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.method === "POST" || req.method === "PUT") {
    const cl = req.headers["content-length"];
    if (cl) {
      const n = Number.parseInt(cl, 10);
      if (!Number.isFinite(n) || n < 0 || n > MAX_JSON_BODY_BYTES) {
        res.status(413).json({ error: "حجم الطلب كبير جداً" });
        return;
      }
    }
  }
  next();
});

app.use(
  cors({
    origin: createCorsOriginChecker(),
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Device-Fingerprint",
      "X-Device-Label",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json({ limit: "6mb" }));

app.use("/media", (_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(DATA_ROOT, "media"), { maxAge: "7d", immutable: true }));

app.get("/health", async (_req, res) => {
  let dbOk = false;
  let usersCount = 0;
  try {
    const { listUsers } = await import("./db/engine.js");
    const users = await listUsers();
    usersCount = users.length;
    dbOk = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[health] db", e);
  }
  res.json({
    ok: dbOk,
    service: "retweet-backend",
    dataRoot: DATA_ROOT,
    publicUrl: PUBLIC_BASE_URL,
    dbOk,
    usersCount,
    smtpConfigured: isSmtpConfigured(),
  });
});

app.get("/auth/config", (_req, res) => {
  res.json({
    signupOtpRequired: isSignupOtpRequired(),
    loginOtpRequired: isLoginOtpRequired(),
    passwordResetUsesLink: false,
    smtpConfigured: isSmtpConfigured(),
  });
});

function authUserPayload(user: UserRow) {
  const av = toClientMediaRef(user.avatar) || DEFAULT_AVATAR_DATA_URI;
  const avatar =
    av.startsWith("/media/") ? `${av}?v=${Date.parse(user.updatedAt) || 0}` : av;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar,
  };
}

function publicUserPayload(user: UserRow) {
  const av = toClientMediaRef(user.avatar) || DEFAULT_AVATAR_DATA_URI;
  const avatar =
    av.startsWith("/media/") ? `${av}?v=${Date.parse(user.updatedAt) || 0}` : av;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName?.trim() || undefined,
    avatar,
    bio: user.bio ?? "",
    note: user.note ?? "",
    profileLink: user.profileLink ?? "",
    verified: user.verified === true,
    founderVerified: user.founderVerified === true,
    founderOfficialLabel: user.founderOfficialLabel,
    appOfficialVerified: user.appOfficialVerified === true,
    appOfficialLabel: user.appOfficialLabel,
    supportOfficialVerified: user.supportOfficialVerified === true,
    supportOfficialLabel: user.supportOfficialLabel,
    isSubscribed: user.isSubscribed === true,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    verificationStatus: user.verificationStatus,
    verificationBadgeColor: user.verificationBadgeColor,
    canUseAnimatedAvatar: user.canUseAnimatedAvatar === true,
    storyMaxDuration: user.storyMaxDuration,
    storyExpiryOptions: user.storyExpiryOptions,
    postCharacterLimit: user.postCharacterLimit,
  };
}

async function publicUserPayloadWithSocial(user: UserRow) {
  const base = publicUserPayload(user);
  const { followers, following } = await socialListsForUser(user.id);
  return {
    ...base,
    isPrivate: user.isPrivate === true,
    followers,
    following,
    followerCount: followers.length,
    followingCount: following.length,
  };
}

function notifyUserRegistered(user: UserRow): void {
  broadcastSseEvent("user_registered", { user: publicUserPayload(user) });
}

function setNoStoreApi(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

function signupOtpKey(emailNorm: string): string {
  return `signup:${emailNorm}`;
}

function isSignupOtpRequired(): boolean {
  return process.env.SIGNUP_OTP_REQUIRED !== "0";
}

function isLoginOtpRequired(): boolean {
  return process.env.LOGIN_OTP_REQUIRED === "1";
}

function loginOtpKey(userId: string): string {
  return `login:${userId}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const show = local.slice(0, Math.min(2, local.length));
  return `${show}***@${domain}`;
}

async function respondLoginRequiresOtp(
  user: UserRow,
  res: Response,
  otpReason: "two_factor" | "new_device" | "policy",
): Promise<Response> {
  if (!isSmtpConfigured()) {
    return res.status(503).json({
      error: "إرسال البريد غير مُعدّ — لا يمكن إرسال كود التحقق",
    });
  }
  const code = generateOtpDigits();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const key = loginOtpKey(user.id);
  await deleteOtpsForUser(key, "login");
  await createOtp({ userId: key, purpose: "login", codeHash, expiresAt });
  const mail = await sendOtpEmail(
    user.email,
    "رمز تسجيل الدخول — Retweet",
    code,
    "تسجيل الدخول",
  );
  if (!mail.sent) {
    return res.status(503).json({
      error: mail.error || "تعذر إرسال كود التحقق — راجع إعدادات البريد",
    });
  }
  return res.json({
    requiresOtp: true,
    emailHint: maskEmail(user.email),
    otpReason,
  });
}

async function finishAuthLogin(
  user: UserRow,
  req: Request,
  res: Response,
  deviceFingerprint: string,
  deviceLabel: string,
): Promise<Response> {
  const bannedRes = await loginBanResponse(user, res);
  if (bannedRes) return bannedRes;
  await trustDeviceForUser(user.id, deviceFingerprint, deviceLabel, req);
  const token = signAccessToken(user.id);
  return res.json({ token, user: authUserPayload(user) });
}

function publicAppUrl(): string {
  const raw =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.RETWEET_PUBLIC_APP_URL?.trim() ||
    "https://reyweet.vercel.app";
  const base = raw.replace(/\/$/, "");
  return base.endsWith("/app") ? `${base}/` : `${base}/app/`;
}

const usernameField = z
  .string()
  .min(1)
  .transform(s => normalizeUsername(s))
  .refine(s => USERNAME_PATTERN.test(s), {
    message: "اسم المستخدم: أحرف إنجليزية صغيرة وأرقام و _ فقط (3–30)",
  });

const registerSchema = z.object({
  email: z.string().email(),
  username: usernameField,
  displayName: z.string().min(1).max(80).optional(),
  password: z.string().min(6).max(128),
  code: z.string().min(4).max(12).optional(),
  phone: z.string().max(24).optional(),
});

const signupVerifyRequestSchema = z.object({
  email: z.string().email(),
  username: usernameField,
});

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  deviceFingerprint: z.string().max(128).optional(),
  deviceLabel: z.string().max(120).optional(),
});

function sanitizeStateForStorage(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

app.post("/auth/request-signup-verification", async (req, res) => {
  const parsed = signupVerifyRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const rl = rateLimitHit(`signup-otp:${rateLimitClientKey(req)}`, 12, 60 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const emailNorm = parsed.data.email.trim().toLowerCase();
  const username = parsed.data.username;
  if (await findUserByEmailOrUsername(emailNorm)) {
    return res.status(409).json({ error: "البريد مستخدم مسبقاً" });
  }
  if (await usernameExists(username)) {
    return res.status(409).json({ error: "اسم المستخدم مستخدم" });
  }
  const code = generateOtpDigits();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const key = signupOtpKey(emailNorm);
  await deleteOtpsForUser(key, "signup");
  await createOtp({ userId: key, purpose: "signup", codeHash, expiresAt });
  if (!isSmtpConfigured()) {
    return res.status(503).json({
      error: "إرسال البريد غير مُعدّ — أضف SMTP_USER و SMTP_PASS في backend/.env",
    });
  }
  const mail = await sendOtpEmail(
    emailNorm,
    "رمز التحقق — إنشاء حساب Retweet",
    code,
    "إنشاء حساب",
  );
  if (!mail.sent) {
    return res.status(503).json({
      error: mail.error || "تعذر إرسال كود التحقق إلى بريدك — تحقق من إعدادات Gmail",
    });
  }
  return res.json({ ok: true, deliveredByEmail: true });
});

app.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const rl = rateLimitHit(`register:${rateLimitClientKey(req)}`, 20, 60 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const { email, username, password, code, phone: phoneRaw, displayName: displayNameRaw } = parsed.data;
  const phoneErr = validateOptionalPhone(phoneRaw);
  if (phoneErr) return res.status(400).json({ error: phoneErr });
  const phoneNorm = normalizePhone(phoneRaw);
  const emailNorm = email.trim().toLowerCase();
  if (await findUserByEmailOrUsername(emailNorm)) {
    return res.status(409).json({ error: "البريد أو اسم المستخدم مستخدم" });
  }
  if (await usernameExists(username)) {
    return res.status(409).json({ error: "البريد أو اسم المستخدم مستخدم" });
  }
  if (!code?.trim()) {
    return res.status(400).json({ error: "أدخل كود التحقق المرسل إلى بريدك الإلكتروني" });
  }
  const otp = await findLatestOtp(signupOtpKey(emailNorm), "signup");
  if (!otp || otp.expiresAt < new Date().toISOString()) {
    return res.status(400).json({ error: "انتهت صلاحية كود التحقق — اطلب كوداً جديداً" });
  }
  const match = await bcrypt.compare(code.trim(), otp.codeHash);
  if (!match) return res.status(400).json({ error: "كود التحقق غير صحيح" });
  await deleteOtpsForUser(signupOtpKey(emailNorm), "signup");
  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(password, rounds);
  const displayName = displayNameRaw?.trim();
  const user = await createUser({
    email: emailNorm,
    username,
    displayName: displayName || undefined,
    passwordHash,
    phone: phoneNorm || undefined,
    avatar: DEFAULT_AVATAR_DATA_URI,
    bio: "",
    appTheme: "light",
    appLanguage: "ar",
  });
  const regFp = getDeviceFingerprintFromRequest(req, req.body as { deviceFingerprint?: string });
  const regLabel = getDeviceLabelFromRequest(req, req.body as { deviceLabel?: string });
  if (regFp) await trustDeviceForUser(user.id, regFp, regLabel, req);
  const token = signAccessToken(user.id);
  notifyUserRegistered(user);
  return res.json({ token, user: authUserPayload(user) });
});

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const rl = rateLimitHit(`login:${rateLimitClientKey(req)}`, 30, 15 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const { identifier, password } = parsed.data;
  const user = await findUserByEmailOrUsername(identifier);
  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ error: "بيانات خاطئة" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    if (user.googleId) {
      return res.status(401).json({ error: "هذا الحساب مرتبط بـ Google — استخدم «تسجيل الدخول عبر Google»" });
    }
    return res.status(401).json({ error: "بيانات خاطئة" });
  }
  const deviceFp = getDeviceFingerprintFromRequest(req, parsed.data);
  const deviceLabel = getDeviceLabelFromRequest(req, parsed.data);
  const otpCheck = needsLoginEmailOtp(user, deviceFp, isLoginOtpRequired());
  if (otpCheck.required) {
    return respondLoginRequiresOtp(user, res, otpCheck.reason ?? "policy");
  }
  return finishAuthLogin(user, req, res, deviceFp, deviceLabel);
});

const verifyLoginSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(4).max(12),
  deviceFingerprint: z.string().max(128).optional(),
  deviceLabel: z.string().max(120).optional(),
});

app.post("/auth/verify-login", async (req, res) => {
  const parsed = verifyLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const rl = rateLimitHit(`login-verify:${rateLimitClientKey(req)}`, 20, 15 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const user = await findUserByEmailOrUsername(parsed.data.identifier.trim());
  if (!user) return res.status(401).json({ error: "بيانات خاطئة" });
  const otp = await findLatestOtp(loginOtpKey(user.id), "login");
  if (!otp || otp.expiresAt < new Date().toISOString()) {
    return res.status(400).json({ error: "انتهت صلاحية كود التحقق — أعد تسجيل الدخول" });
  }
  const match = await bcrypt.compare(parsed.data.code.trim(), otp.codeHash);
  if (!match) return res.status(400).json({ error: "كود التحقق غير صحيح" });
  await deleteOtpsForUser(loginOtpKey(user.id), "login");
  const deviceFp = getDeviceFingerprintFromRequest(req, parsed.data);
  const deviceLabel = getDeviceLabelFromRequest(req, parsed.data);
  return finishAuthLogin(user, req, res, deviceFp, deviceLabel);
});

function googleAudiences(): string[] {
  return [
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ]
    .map(s => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
}

function usernameBaseFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "user").replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_");
  const trimmed = (local.replace(/^_|_$/g, "") || "user").toLowerCase();
  return trimmed.slice(0, 24);
}

async function uniqueUsernameFromEmail(emailNorm: string): Promise<string> {
  let base = usernameBaseFromEmail(emailNorm);
  if (base.length < 3) base = base.padEnd(3, "x");
  base = base.slice(0, 20);
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    const c = candidate.slice(0, 30);
    if (!(await usernameExists(c))) return c;
    candidate = `${base}_${Math.floor(1000 + Math.random() * 8999)}`;
  }
  return `${base.slice(0, 18)}_${crypto.randomBytes(3).toString("hex")}`.slice(0, 30);
}

const googleAuthSchema = z.object({
  idToken: z.string().min(20),
  deviceFingerprint: z.string().max(128).optional(),
  deviceLabel: z.string().max(120).optional(),
});

app.post("/auth/google", async (req, res) => {
  const audiences = googleAudiences();
  if (audiences.length === 0) {
    return res.status(503).json({ error: "خادم Google غير مُعدّ (GOOGLE_WEB_CLIENT_ID)" });
  }
  const rl = rateLimitHit(`google:${rateLimitClientKey(req)}`, 40, 15 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

  const oauth = new OAuth2Client();
  let sub: string;
  let emailNorm: string;
  let name: string | undefined;
  let picture: string | undefined;
  try {
    const ticket = await oauth.verifyIdToken({ idToken: parsed.data.idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return res.status(401).json({ error: "بيانات Google ناقصة" });
    if (payload.email_verified === false) return res.status(401).json({ error: "البريد غير موثّق في Google" });
    sub = payload.sub;
    emailNorm = payload.email.trim().toLowerCase();
    name = payload.name ?? undefined;
    picture = payload.picture ?? undefined;
  } catch {
    return res.status(401).json({ error: "رمز Google غير صالح أو منتهي" });
  }

  const deviceFp = getDeviceFingerprintFromRequest(req, parsed.data);
  const deviceLabel = getDeviceLabelFromRequest(req, parsed.data);

  const byGoogle = await findUserByGoogleId(sub);
  if (byGoogle) {
    const otpCheck = needsLoginEmailOtp(byGoogle, deviceFp, isLoginOtpRequired());
    if (otpCheck.required) {
      return respondLoginRequiresOtp(byGoogle, res, otpCheck.reason ?? "policy");
    }
    return finishAuthLogin(byGoogle, req, res, deviceFp, deviceLabel);
  }

  const byEmail = await findUserByEmailOrUsername(emailNorm);
  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== sub) {
      return res.status(409).json({ error: "البريد مرتبط بحساب Google آخر" });
    }
    const user = await updateUser(byEmail.id, {
      googleId: sub,
      avatar:
        byEmail.avatar || picture || DEFAULT_AVATAR_DATA_URI,
    });
    const linked = user!;
    const otpCheck = needsLoginEmailOtp(linked, deviceFp, isLoginOtpRequired());
    if (otpCheck.required) {
      return respondLoginRequiresOtp(linked, res, otpCheck.reason ?? "policy");
    }
    return finishAuthLogin(linked, req, res, deviceFp, deviceLabel);
  }

  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), rounds);
  const username = await uniqueUsernameFromEmail(emailNorm);
  const avatar = picture || DEFAULT_AVATAR_DATA_URI;
  const user = await createUser({
    email: emailNorm,
    username,
    googleId: sub,
    passwordHash,
    avatar,
    bio: "",
    appTheme: "light",
    appLanguage: "ar",
  });
  const token = signAccessToken(user.id);
  notifyUserRegistered(user);
  return res.json({ token, user: authUserPayload(user) });
});

const resetRequestSchema = z.object({ identifier: z.string().min(1) });
const resetCompleteSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(4).max(12),
  newPassword: z.string().min(6).max(128),
});

app.post("/auth/request-password-reset", async (req, res) => {
  const rl = rateLimitHit(`pwd-req:${rateLimitClientKey(req)}`, 8, 60 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const user = await findUserByEmailOrUsername(parsed.data.identifier.trim());
  if (!user) {
    return res.json({
      ok: true,
      method: "code",
      message: "إن وُجد حساب بهذه البيانات أُرسل رمز التحقق إلى بريدك.",
    });
  }

  if (!isSmtpConfigured()) {
    return res.status(503).json({
      error: "إرسال البريد غير مُعدّ — أضف SMTP_USER و SMTP_PASS في backend/.env",
    });
  }

  const code = generateOtpDigits();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await deleteOtpsForUser(user.id, "password_reset");
  await createOtp({ userId: user.id, purpose: "password_reset", codeHash, expiresAt });
  const mail = await sendOtpEmail(
    user.email,
    "رمز استعادة كلمة المرور — Retweet",
    code,
    "استعادة كلمة المرور",
  );
  if (!mail.sent) {
    return res.status(503).json({
      error: mail.error || "تعذر إرسال رمز الاستعادة إلى بريدك",
    });
  }
  return res.json({
    ok: true,
    method: "code",
    message: "أُرسل رمز التحقق إلى بريدك الإلكتروني.",
  });
});

const resetLinkCompleteSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(6).max(128),
});

app.post("/auth/complete-password-reset-link", async (req, res) => {
  const rl = rateLimitHit(`pwd-link:${rateLimitClientKey(req)}`, 15, 15 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const parsed = resetLinkCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const dot = parsed.data.token.indexOf(".");
  if (dot < 1) return res.status(400).json({ error: "رابط غير صالح" });
  const userId = parsed.data.token.slice(0, dot);
  const user = await getUserById(userId);
  if (!user) return res.status(400).json({ error: "رابط غير صالح أو منتهٍ" });
  const otp = await findLatestOtp(user.id, "password_reset_link");
  if (!otp || otp.expiresAt < new Date().toISOString()) {
    return res.status(400).json({ error: "انتهت صلاحية الرابط — اطلب رابطاً جديداً" });
  }
  const match = await bcrypt.compare(parsed.data.token, otp.codeHash);
  if (!match) return res.status(400).json({ error: "رابط غير صالح" });
  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, rounds);
  await updateUser(user.id, { passwordHash });
  await deleteOtpsForUser(user.id, "password_reset_link");
  return res.json({ ok: true });
});

app.post("/auth/complete-password-reset", async (req, res) => {
  const rl = rateLimitHit(`pwd-done:${rateLimitClientKey(req)}`, 15, 15 * 60 * 1000);
  if (!rl.ok) return res.status(429).set("Retry-After", String(rl.retryAfterSec)).json({ error: "طلبات كثيرة — حاول لاحقاً" });
  const parsed = resetCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const { identifier, code, newPassword } = parsed.data;
  const user = await findUserByEmailOrUsername(identifier.trim());
  if (!user) return res.status(400).json({ error: "تعذر التحقق" });
  const otp = await findLatestOtp(user.id, "password_reset");
  if (!otp || otp.expiresAt < new Date().toISOString()) return res.status(400).json({ error: "انتهت صلاحية الرمز" });
  const match = await bcrypt.compare(code.trim(), otp.codeHash);
  if (!match) return res.status(400).json({ error: "رمز غير صحيح" });
  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(newPassword, rounds);
  await updateUser(user.id, { passwordHash });
  await deleteOtpsForUser(user.id, "password_reset");
  return res.json({ ok: true });
});

const MODERATION_ALLOWED_PREFIXES = [
  "/v1/me/moderation",
  "/v1/me/appeal",
  "/auth/",
];

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers.authorization || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const { sub } = verifyAccessToken(token);
    (req as Request & { userId: string }).userId = sub;
    const path = req.path || req.url.split("?")[0] || "";
    const appealOk = MODERATION_ALLOWED_PREFIXES.some(p => path.startsWith(p));
    void (async () => {
      const status = await resolveEffectiveStatus(sub);
      if (isBannedStatus(status) && !appealOk) {
        const user = await getUserById(sub);
        const banInfo = user ? await getBanInfoForUser(user) : null;
        res.status(403).json({ error: "account_banned", banInfo });
        return;
      }
      next();
    })().catch(() => {
      res.status(500).json({ error: "خطأ في التحقق" });
    });
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}

async function loginBanResponse(user: UserRow, res: Response): Promise<Response | null> {
  const status = await resolveEffectiveStatus(user.id);
  if (!isBannedStatus(status)) return null;
  const banInfo = await getBanInfoForUser(user);
  return res.status(403).json({ error: "account_banned", banInfo, banned: true });
}

app.get("/v1/app-state", authMiddleware, async (req, res) => {
  setNoStoreApi(res);
  const userId = (req as Request & { userId: string }).userId;
  const snap = await getSnapshot(userId);
  let state = (snap as AppState | null) ?? (await buildMinimalAppState(userId));
  state = await mergeDbUsersIntoAppState(state);
  state = await mergeDbPostsIntoAppState(state);
  state = await mergeSocialGraphIntoAppState(state);
  state = await hydrateChatsFromUserMessages(state, userId);
  state = await hydrateStateWithMessages(state, userId);
  const feedStories = storiesVisibleToViewer(state as AppState, userId);
  state = scopeAppStateToOwner(userId, state as AppState);
  state = { ...(state as AppState), stories: feedStories };
  const { sanitizeCorruptHiddenMessages } = await import("./lib/sanitizeHiddenMessages.js");
  state = sanitizeCorruptHiddenMessages(state as AppState, userId);
  return res.json({ state: coerceAppStateForClient(state as AppState) });
});

app.get("/v1/feed/posts", authMiddleware, async (req, res) => {
  setNoStoreApi(res);
  const viewerId = (req as Request & { userId: string }).userId;
  const { buildHomeFeedForViewer } = await import("./lib/homeFeed.js");
  const { posts, users } = await buildHomeFeedForViewer(viewerId);
  return res.json({ posts, users, fetchedAt: Date.now() });
});

app.get("/v1/users/search", authMiddleware, async (req, res) => {
  setNoStoreApi(res);
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ users: [] });
  if (q.length > 64) return res.status(400).json({ error: "استعلام طويل جداً" });
  const rows = await searchUsers(q, 40);
  const users = await Promise.all(rows.map(row => publicUserPayloadWithSocial(row)));
  return res.json({ users });
});

app.get("/v1/users/recent", authMiddleware, async (req, res) => {
  setNoStoreApi(res);
  const limit = Math.min(80, Math.max(1, Number(req.query.limit) || 30));
  const rows = await listRecentUsers(limit);
  const users = await Promise.all(rows.map(row => publicUserPayloadWithSocial(row)));
  return res.json({ users });
});

/** كل الحسابات من users.json — للبحث والمنشن (قراءة حية من القرص) */
app.get("/v1/users/directory", authMiddleware, async (_req, res) => {
  setNoStoreApi(res);
  const rows = await listUsers();
  rows.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const users = await Promise.all(rows.map(row => publicUserPayloadWithSocial(row)));
  return res.json({ users });
});

app.get("/v1/events", authMiddleware, (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const clientId = registerSseClient(userId, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(ping);
      removeSseClient(clientId);
    }
  }, 25_000);
  req.on("close", () => {
    clearInterval(ping);
    removeSseClient(clientId);
  });
});

app.get("/v1/users/by-username/:username", authMiddleware, async (req, res) => {
  const row = await findUserByUsername(String(req.params.username ?? ""));
  if (!row) return res.status(404).json({ error: "not found" });
  setNoStoreApi(res);
  return res.json({ user: await publicUserPayloadWithSocial(row) });
});

app.get("/v1/users/:userId/posts", authMiddleware, async (req, res) => {
  setNoStoreApi(res);
  const profileUserId = String(req.params.userId ?? "").trim();
  if (!profileUserId) return res.status(400).json({ error: "invalid id" });
  const viewerId = (req as Request & { userId: string }).userId;
  const row = await getUserById(profileUserId);
  if (!row && profileUserId !== "u_t_account") {
    return res.status(404).json({ error: "not found" });
  }
  const { buildUserPostsForViewer } = await import("./lib/userPosts.js");
  const { posts, users } = await buildUserPostsForViewer(profileUserId, viewerId);
  return res.json({ posts, users, fetchedAt: Date.now() });
});

app.get("/v1/users/:userId", authMiddleware, async (req, res) => {
  const userId = String(req.params.userId ?? "").trim();
  if (!userId) return res.status(400).json({ error: "invalid id" });
  const row = await getUserById(userId);
  if (!row) return res.status(404).json({ error: "not found" });
  setNoStoreApi(res);
  const status = await resolveEffectiveStatus(row.id);
  if (status === "BANNED" || status === "TEMP_BANNED" || status === "PERMANENTLY_BANNED") {
    return res.json({ user: bannedPublicProfilePayload(row.username), banned: true });
  }
  return res.json({ user: await publicUserPayloadWithSocial(row) });
});

app.get("/v1/me/username-available/:username", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const norm = normalizeUsername(String(req.params.username ?? ""));
  if (!norm) return res.status(400).json({ error: "اسم غير صالح", available: false });
  const nameErr = validateUsernameFormat(norm, userId);
  if (nameErr) return res.status(400).json({ error: nameErr, available: false });
  const available = !(await usernameExists(norm, userId));
  setNoStoreApi(res);
  return res.json({ available });
});

const putStateSchema = z.object({ state: z.any() });

const createStorySchema = z.object({
  id: z.string().min(1).optional(),
  image: z.string().min(1),
  video: z.string().optional(),
  audience: z.enum(["all", "close"]).optional(),
  stickers: z.array(z.unknown()).optional(),
  createdAt: z.number().int().positive().optional(),
});

app.post("/v1/stories", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = createStorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الستوري غير صالحة" });

  const author = await getUserById(userId);
  if (!author) return res.status(404).json({ error: "not found" });
  const { getUserEntitlements } = await import("../../src/lib/verificationEntitlements.js");
  const ent = getUserEntitlements(author);
  const expiryHours = parsed.data.expiryHours ?? 24;
  if (!ent.storyExpiryHoursOptions.includes(expiryHours)) {
    return res.status(403).json({
      error: ent.isVerified
        ? "مدة الظهور غير مسموحة"
        : "تمديد مدة الستوري متاح للحسابات الموثقة فقط",
    });
  }

  let image = parsed.data.image.trim();
  let video = parsed.data.video?.trim() || undefined;
  try {
    if (isDataUrl(image)) image = await processDataUrl(image);
    if (video && isDataUrl(video)) video = await processDataUrl(video);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[stories/create] media", e);
    return res.status(500).json({
      error: "تعذر حفظ وسائط الستوري — جرّب صورة JPG أو فيديو MP4 أقصر",
    });
  }

  const createdAt = parsed.data.createdAt ?? Date.now();
  const row: StoryRow = {
    id: parsed.data.id ?? crypto.randomUUID(),
    userId,
    image: toClientMediaRef(image) || image,
    video: video ? toClientMediaRef(video) || video : undefined,
    createdAt,
    audience: parsed.data.audience === "close" ? "close" : "all",
    expiryHours,
    stickers: parsed.data.stickers,
    likes: [],
    viewedByUserIds: [],
  };

  const existing = await listStories();
  const merged = [row, ...existing.filter(s => s.id !== row.id)];
  await replaceStories(merged);

  let snap = (await getSnapshot(userId)) as AppState | null;
  if (!snap) snap = await buildMinimalAppState(userId);
  const storyItem = row as StoryItem;
  const snapStories = Array.isArray(snap.stories) ? snap.stories : [];
  snap = {
    ...snap,
    currentUserId: userId,
    stories: [storyItem, ...snapStories.filter(s => s.id !== row.id)],
  };
  await setSnapshot(userId, sanitizeStateForStorage(snap));

  broadcastSseExcept(userId, "sync_hint", { kind: "story", fromUserId: userId });
  return res.json({ ok: true, story: storyItem });
});

app.put("/v1/app-state", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = putStateSchema.safeParse(req.body);
  if (!parsed.success || !req.body?.state) return res.status(400).json({ error: "missing state" });
  let st = req.body.state as AppState;
  if (st.currentUserId !== userId) return res.status(403).json({ error: "forbidden" });

  st = scopeAppStateToOwner(userId, st);

  const { enforceVerificationOnAppState } = await import("./lib/enforceVerificationLimits.js");
  st = await enforceVerificationOnAppState(userId, st);

  try {
    st = (await rewriteDataUrlsInValue(st)) as AppState;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[app-state] media rewrite partial failure", e);
  }

  const clean = sanitizeStateForStorage(st);
  try {
    const cleanWithProfiles = await mergeDbUsersIntoAppState(clean);
    /** لقطة العميل قد تكون أقدم من posts.json — ندمج المنشورات من القرص قبل الحفظ */
    let snapshotReady = await mergeDbPostsIntoAppState(cleanWithProfiles);
    snapshotReady = await mergeSocialGraphIntoAppState(snapshotReady);
    snapshotReady = await hydrateChatsFromUserMessages(snapshotReady, userId);
    snapshotReady = await hydrateStateWithMessages(snapshotReady, userId);
    const { sanitizeCorruptHiddenMessages } = await import("./lib/sanitizeHiddenMessages.js");
    snapshotReady = sanitizeCorruptHiddenMessages(snapshotReady, userId);
    await setSnapshot(userId, snapshotReady);
    try {
      await syncNormalizedFromAppState(snapshotReady, userId);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[app-state] sync normalized collections failed", e);
    }
    await updateUser(userId, {
      appTheme: st.theme === "dark" ? "dark" : "light",
      appLanguage: st.language === "en" ? "en" : "ar",
    });
    broadcastSseExcept(userId, "sync_hint", { kind: "feed", fromUserId: userId });
    return res.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[app-state] save failed", e);
    return res.status(500).json({ error: "تعذر حفظ البيانات على الخادم — أعد المحاولة" });
  }
});

const socialTargetSchema = z.object({ targetUserId: z.string().min(1) });

app.get("/v1/social/relation/:targetUserId", authMiddleware, async (req, res) => {
  const viewerId = (req as Request & { userId: string }).userId;
  const targetId = String(req.params.targetUserId ?? "").trim();
  if (!targetId) return res.status(400).json({ error: "targetUserId مطلوب" });
  setNoStoreApi(res);
  const relation = await getSocialRelation(viewerId, targetId);
  return res.json({ relation });
});

app.post("/v1/social/follow/toggle", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const parsed = socialTargetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "targetUserId مطلوب" });
  const targetId = parsed.data.targetUserId.trim();
  if (targetId === actorId) return res.status(400).json({ error: "لا يمكن متابعة نفسك" });
  try {
    const result = await toggleFollowOnServer(actorId, targetId);
    return res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل المتابعة";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/social/follow-request/accept", authMiddleware, async (req, res) => {
  const me = (req as Request & { userId: string }).userId;
  const parsed = z.object({ fromUserId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "fromUserId مطلوب" });
  const fromId = parsed.data.fromUserId.trim();
  try {
    await acceptFollowRequest(me, fromId);
    return res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل القبول";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/social/follow-request/decline", authMiddleware, async (req, res) => {
  const me = (req as Request & { userId: string }).userId;
  const parsed = z.object({ fromUserId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "fromUserId مطلوب" });
  const fromId = parsed.data.fromUserId.trim();
  try {
    await declineFollowRequest(me, fromId);
    return res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الرفض";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/social/block/sever", authMiddleware, async (req, res) => {
  const me = (req as Request & { userId: string }).userId;
  const parsed = socialTargetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "targetUserId مطلوب" });
  const targetId = parsed.data.targetUserId.trim();
  if (targetId === me) return res.status(400).json({ error: "لا يمكن حظر نفسك" });
  try {
    const { severSocialForBlock } = await import("./lib/socialActions.js");
    const { getSocialRelation } = await import("./lib/socialGraph.js");
    await severSocialForBlock(me, targetId);
    setNoStoreApi(res);
    return res.json({ ok: true, relation: await getSocialRelation(me, targetId) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل فصل المتابعة";
    return res.status(400).json({ error: msg });
  }
});

const createPostSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["post", "tweet", "reel"]),
  text: z.string().max(10_000).optional(),
  image: z.string().max(2_000_000).optional(),
  video: z.string().max(2_000_000).optional(),
  audio: z.string().max(2_000_000).optional(),
  createdAt: z.number().optional(),
});

app.post("/v1/posts", authMiddleware, async (req, res) => {
  const rawOwnerId = (req as Request & { userId: string }).userId;
  const { resolveCanonicalPostOwnerId } = await import("./lib/founderLegacy.js");
  const userId = resolveCanonicalPostOwnerId(rawOwnerId);
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات المنشور غير صالحة" });
  try {
    const { upsertPostOnServer } = await import("./lib/postSocial.js");
    const post = await upsertPostOnServer(userId, {
      id: parsed.data.id,
      userId,
      type: parsed.data.type,
      text: parsed.data.text ?? "",
      image: parsed.data.image,
      video: parsed.data.video,
      audio: parsed.data.audio,
      likes: [],
      reposts: [],
      comments: [],
      createdAt: parsed.data.createdAt ?? Date.now(),
    });
    setNoStoreApi(res);
    return res.json({ ok: true, post });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل حفظ المنشور";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/posts/:postId/like", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const postId = String(req.params.postId ?? "").trim();
  if (!postId) return res.status(400).json({ error: "postId مطلوب" });
  try {
    const { togglePostLikeOnServer } = await import("./lib/postSocial.js");
    const result = await togglePostLikeOnServer(actorId, postId);
    setNoStoreApi(res);
    return res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل الإعجاب";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/posts/:postId/repost", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const postId = String(req.params.postId ?? "").trim();
  if (!postId) return res.status(400).json({ error: "postId مطلوب" });
  try {
    const { togglePostRepostOnServer } = await import("./lib/postSocial.js");
    const result = await togglePostRepostOnServer(actorId, postId);
    setNoStoreApi(res);
    return res.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل إعادة النشر";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/posts/:postId/comments", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const postId = String(req.params.postId ?? "").trim();
  const parsed = z.object({ text: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!postId) return res.status(400).json({ error: "postId مطلوب" });
  if (!parsed.success) return res.status(400).json({ error: "نص التعليق مطلوب" });
  try {
    const { addPostCommentOnServer } = await import("./lib/postSocial.js");
    const comment = await addPostCommentOnServer(actorId, postId, parsed.data.text);
    setNoStoreApi(res);
    return res.json({ ok: true, comment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل التعليق";
    return res.status(400).json({ error: msg });
  }
});

app.post("/v1/stories/:storyId/view", authMiddleware, async (req, res) => {
  const viewerId = (req as Request & { userId: string }).userId;
  const storyId = String(req.params.storyId ?? "").trim();
  if (!storyId) return res.status(400).json({ error: "storyId مطلوب" });
  try {
    const { recordStoryViewOnServer } = await import("./lib/postSocial.js");
    await recordStoryViewOnServer(viewerId, storyId);
    return res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل تسجيل المشاهدة";
    return res.status(400).json({ error: msg });
  }
});

const pwdChangeSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});

const chatTypingSchema = z.object({
  chatId: z.string().min(1),
  peerId: z.string().min(1).optional(),
  active: z.boolean(),
});

app.post("/v1/chats/typing", authMiddleware, (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = chatTypingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const { chatId, peerId, active } = parsed.data;
  if (active) {
    setUserTyping(userId, { chatId, peerId: peerId ?? null });
  } else {
    clearUserTyping(userId, { chatId, peerId: peerId ?? null });
  }
  return res.json({ ok: true });
});

app.post("/v1/messages", authMiddleware, async (req, res) => {
  const senderId = (req as Request & { userId: string }).userId;
  const parsed = postMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  try {
    const row = await ingestDirectMessage(senderId, parsed.data);
    res.status(201).json({ message: messageRowToClient(row) });
  } catch (e) {
    if (e instanceof ChatAccessError) return res.status(403).json({ error: e.message });
    const msg = e instanceof Error ? e.message : "فشل إرسال الرسالة";
    return res.status(500).json({ error: msg });
  }
});

app.get("/v1/chats/:chatId/messages", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const chatId = req.params.chatId;
  if (!chatId) return res.status(400).json({ error: "chatId مطلوب" });
  try {
    const chat = await assertChatReadAccess(userId, chatId);
    let rows = await listMessagesByChatId(chat.id);
    if (!chat.isGroup && !chat.isChannel && chat.members.length === 2) {
      const peer = chat.members.find(id => id !== userId);
      if (peer) {
        const { dmChatId } = await import("./lib/dmChatId.js");
        const canonical = dmChatId(userId, peer);
        if (canonical !== chat.id) {
          const legacy = await listMessagesByChatId(chatId);
          const canonicalRows = await listMessagesByChatId(canonical);
          const byId = new Map([...legacy, ...rows, ...canonicalRows].map(r => [r.id, r]));
          rows = [...byId.values()];
        }
      }
    }
    const visible = filterMessagesForParticipant(userId, chat, rows);
    return res.json({ messages: visible.map(messageRowToClient) });
  } catch (e) {
    if (e instanceof ChatAccessError) return res.status(403).json({ error: e.message });
    const msg = e instanceof Error ? e.message : "فشل تحميل الرسائل";
    return res.status(500).json({ error: msg });
  }
});

const createGroupSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  avatar: z.string().max(2_000_000),
  memberIds: z.array(z.string().min(1)).min(2),
  welcomeMessage: z.string().max(500).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(["public", "private", "invite_only"]).optional(),
});

app.post("/v1/chats/group", authMiddleware, async (req, res) => {
  const creatorId = (req as Request & { userId: string }).userId;
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const d = parsed.data;
  let avatar = d.avatar.trim();
  if (isDataUrl(avatar)) {
    try {
      avatar = await processDataUrl(avatar);
    } catch {
      return res.status(400).json({ error: "فشل معالجة صورة المجموعة" });
    }
  }
  const members = Array.from(new Set([creatorId, ...d.memberIds.filter(id => id !== creatorId)]));
  if (members.length < 3) {
    return res.status(400).json({ error: "المجموعة تحتاج عضوين على الأقل غيرك" });
  }
  const inviteCode = generateInviteCode();
  const visibility: GroupVisibility = d.visibility ?? "invite_only";
  const memberRoles: Record<string, "owner" | "admin" | "moderator" | "member"> = {};
  for (const id of members) {
    memberRoles[id] = id === creatorId ? "owner" : "member";
  }
  const now = Date.now();
  const memberMeta = Object.fromEntries(
    members.map(id => [id, { joinedAt: now, addedBy: id === creatorId ? undefined : creatorId }]),
  );
  const chat: Chat = {
    id: d.id,
    isGroup: true,
    name: d.name.trim(),
    avatar,
    members,
    admins: [creatorId],
    ownerId: creatorId,
    createdByUserId: creatorId,
    description: d.description?.trim(),
    groupVisibility: visibility,
    memberRoles,
    memberMeta,
    messages: [],
    lastOpenAtByUser: {},
    lastReadMessageIdByUser: {},
    inviteCode,
    isPublicGroup: visibility === "public",
    joinRequests: [],
    bannedUserIds: [],
    groupSettings: {
      visibility,
      description: d.description?.trim(),
      approvalRequired: visibility === "private",
    } as Chat["groupSettings"],
  };
  await registerGroupInvite(inviteCode, chat.id, creatorId);
  const welcome =
    d.welcomeMessage?.trim() ||
    `تم إنشاء المجموعة «${chat.name}»`;
  try {
    await shareGroupChatWithMembers(creatorId, chat, welcome);
    await ensureGroupRecord(chat, creatorId);
    return res.status(201).json({ chat });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل إنشاء المجموعة";
    return res.status(500).json({ error: msg });
  }
});

const groupMembersSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
});

app.post("/v1/chats/group/:chatId/members", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const chatId = req.params.chatId;
  if (!chatId) return res.status(400).json({ error: "chatId مطلوب" });
  const parsed = groupMembersSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "memberIds مطلوب" });
  const snap = (await getSnapshot(actorId)) as { chats?: Chat[] } | null;
  const chat = snap?.chats?.find(c => c.id === chatId && c.isGroup && !c.isChannel);
  if (!chat) return res.status(404).json({ error: "المجموعة غير موجودة" });
  if (!chat.admins.includes(actorId)) return res.status(403).json({ error: "غير مصرح" });
  const requested = parsed.data.memberIds.filter(id => id !== actorId);
  if (requested.length === 0) return res.json({ chat });
  const actorRow = await getUserById(actorId);
  const actorLabel = actorRow?.username ? `@${actorRow.username}` : "مشرف";
  const addedIds = requested.filter(id => !chat.members.includes(id));
  const addedRows = await Promise.all(addedIds.map(id => getUserById(id)));
  const systemMessages = addedIds.map((targetId, idx) => ({
    id: crypto.randomUUID(),
    senderId: actorId,
    type: "text" as const,
    content: `${actorLabel} أضاف ${addedRows[idx]?.username ? `@${addedRows[idx]!.username}` : "عضو"} إلى المجموعة`,
    createdAt: Date.now() + idx,
  }));
  const updated: Chat = {
    ...chat,
    members: Array.from(new Set([...chat.members, ...requested])),
    messages: [...(chat.messages || []), ...systemMessages],
  };
  try {
    const inviteMemberIds: string[] = [];
    for (const memberId of requested) {
      if (!(await memberHasGroupChat(memberId, chatId))) {
        inviteMemberIds.push(memberId);
      }
    }
    await syncGroupChatCanonical(updated, actorId, { inviteMemberIds });
    return res.json({ chat: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "فشل إضافة الأعضاء";
    return res.status(500).json({ error: msg });
  }
});

const patchGroupSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar: z.string().max(2_000_000).optional(),
  isPublicGroup: z.boolean().optional(),
  regenerateInvite: z.boolean().optional(),
});

app.patch("/v1/chats/group/:chatId", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const chatId = req.params.chatId;
  if (!chatId) return res.status(400).json({ error: "chatId مطلوب" });
  const parsed = patchGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const snap = (await getSnapshot(actorId)) as { chats?: Chat[] } | null;
  const chat = snap?.chats?.find(c => c.id === chatId && (c.isGroup || c.isChannel));
  if (!chat) return res.status(404).json({ error: "غير موجود" });
  if (!chat.admins.includes(actorId)) return res.status(403).json({ error: "غير مصرح" });
  let avatar = parsed.data.avatar;
  if (avatar != null && isDataUrl(avatar.trim())) {
    try {
      avatar = await processDataUrl(avatar.trim());
    } catch {
      return res.status(400).json({ error: "فشل معالجة الصورة" });
    }
  }
  let inviteCode = chat.inviteCode;
  if (!inviteCode) {
    inviteCode = generateInviteCode();
    await registerGroupInvite(inviteCode, chatId, actorId);
  }
  const patch = {
    name: parsed.data.name?.trim(),
    avatar: avatar?.trim(),
    isPublicGroup: parsed.data.isPublicGroup,
    inviteCode,
  };
  await patchGroupChatForMembers(chatId, chat.members, patch);
  return res.json({
    chat: {
      ...chat,
      name: patch.name ?? chat.name,
      avatar: patch.avatar ?? chat.avatar,
      isPublicGroup: patch.isPublicGroup ?? chat.isPublicGroup,
      inviteCode,
    },
  });
});

app.get("/v1/chats/group/invite/:code", authMiddleware, async (req, res) => {
  const code = String(req.params.code ?? "").trim();
  const row = await resolveGroupInvite(code);
  if (!row) return res.status(404).json({ error: "رابط غير صالح" });
  const chat = await loadGroupChatForAdmin(row.chatId, row.creatorId);
  if (!chat) return res.status(404).json({ error: "المجموعة غير موجودة" });
  return res.json({
    inviteCode: code,
    chatId: chat.id,
    name: chat.name || "مجموعة",
    avatar: chat.avatar || "👥",
    memberCount: chat.members.length,
    isPublicGroup: chat.isPublicGroup === true,
    alreadyMember: chat.members.includes((req as Request & { userId: string }).userId),
  });
});

app.post("/v1/chats/group/invite/:code/join", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const code = String(req.params.code ?? "").trim();
  const row = await resolveGroupInvite(code);
  if (!row) return res.status(404).json({ error: "رابط غير صالح" });
  let chat = await loadGroupChatForAdmin(row.chatId, row.creatorId);
  if (!chat) return res.status(404).json({ error: "المجموعة غير موجودة" });
  if (chat.members.includes(userId)) {
    return res.json({ ok: true, chat, joined: true });
  }
  if (chat.isPublicGroup) {
    const updated: Chat = {
      ...chat,
      members: Array.from(new Set([...chat.members, userId])),
    };
    const inviteMemberIds = (await memberHasGroupChat(userId, chat.id)) ? [] : [userId];
    await syncGroupChatCanonical(updated, row.creatorId, { inviteMemberIds });
    return res.json({ ok: true, chat: updated, joined: true });
  }
  const requests = [...(chat.joinRequests || [])];
  if (!requests.some(r => r.userId === userId)) {
    requests.push({ userId, at: Date.now() });
  }
  chat = { ...chat, joinRequests: requests };
  await patchGroupChatForMembers(chat.id, chat.members, { joinRequests: requests });
  for (const adminId of chat.admins) {
    broadcastSseToUser(adminId, "sync_hint", { kind: "group_join_request", chatId: chat.id });
    emitToUsers([adminId], "sync_hint", { kind: "group_join_request", chatId: chat.id });
  }
  return res.json({ ok: true, pending: true, chat });
});

const joinRequestActionSchema = z.object({ action: z.enum(["accept", "reject"]) });

app.post(
  "/v1/chats/group/:chatId/join-requests/:userId",
  authMiddleware,
  async (req, res) => {
    const actorId = (req as Request & { userId: string }).userId;
    const chatId = req.params.chatId;
    const targetUserId = req.params.userId;
    if (!chatId || !targetUserId) return res.status(400).json({ error: "معرّف ناقص" });
    const parsed = joinRequestActionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "إجراء غير صالح" });
    const chat = await loadGroupChatForAdmin(chatId, actorId);
    if (!chat) return res.status(404).json({ error: "المجموعة غير موجودة" });
    if (!chat.admins.includes(actorId)) return res.status(403).json({ error: "غير مصرح" });
    const requests = (chat.joinRequests || []).filter(r => r.userId !== targetUserId);
    if (parsed.data.action === "reject") {
      await patchGroupChatForMembers(chatId, chat.members, { joinRequests: requests });
      return res.json({ ok: true });
    }
    const actorRow = await getUserById(actorId);
    const targetRow = await getUserById(targetUserId);
    const actorLabel = actorRow?.username ? `@${actorRow.username}` : "مشرف";
    const targetLabel = targetRow?.username ? `@${targetRow.username}` : "عضو";
    const systemMessage = {
      id: crypto.randomUUID(),
      senderId: actorId,
      type: "text" as const,
      content: `${actorLabel} أضاف ${targetLabel} إلى المجموعة`,
      createdAt: Date.now(),
    };
    const updated: Chat = {
      ...chat,
      members: Array.from(new Set([...chat.members, targetUserId])),
      joinRequests: requests,
      messages: [...(chat.messages || []), systemMessage],
    };
    const inviteMemberIds = (await memberHasGroupChat(targetUserId, chatId))
      ? []
      : [targetUserId];
    await syncGroupChatCanonical(updated, actorId, { inviteMemberIds });
    return res.json({ ok: true, chat: updated });
  },
);

app.delete("/v1/chats/group/:chatId/members/:userId", authMiddleware, async (req, res) => {
  const actorId = (req as Request & { userId: string }).userId;
  const chatId = req.params.chatId;
  const targetId = req.params.userId;
  if (!chatId || !targetId) return res.status(400).json({ error: "معرّف ناقص" });
  const chat = await loadGroupChatForAdmin(chatId, actorId);
  if (!chat) return res.status(404).json({ error: "المجموعة غير موجودة" });
  if (!chat.admins.includes(actorId)) return res.status(403).json({ error: "غير مصرح" });
  if (targetId === actorId) return res.status(400).json({ error: "استخدم مغادرة المجموعة" });
  const actorRow = await getUserById(actorId);
  const targetRow = await getUserById(targetId);
  const actorLabel = actorRow?.username ? `@${actorRow.username}` : "مشرف";
  const targetLabel = targetRow?.username ? `@${targetRow.username}` : "عضو";
  const systemMessage = {
    id: crypto.randomUUID(),
    senderId: actorId,
    type: "text" as const,
    content: `${actorLabel} طرد ${targetLabel} من المجموعة`,
    createdAt: Date.now(),
  };
  const nextMembers = chat.members.filter(id => id !== targetId);
  await patchGroupChatForMembers(chatId, chat.members, {
    removeMemberIds: [targetId],
    memberIds: undefined,
    groupPatch: { messages: [...(chat.messages || []), systemMessage] },
  });
  let targetState = (await getSnapshot(targetId)) as { chats?: Chat[] } | null;
  if (targetState?.chats) {
    targetState = {
      ...targetState,
      chats: targetState.chats.filter(c => c.id !== chatId),
    };
    await setSnapshot(targetId, targetState);
  }
  broadcastSseToUser(targetId, "sync_hint", { kind: "chats" });
  emitToUsers([targetId], "sync_hint", { kind: "chats" });
  return res.json({ ok: true, members: nextMembers });
});

app.post("/v1/chats/group/:chatId/leave", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const chatId = req.params.chatId;
  if (!chatId) return res.status(400).json({ error: "chatId مطلوب" });
  const chat = await loadGroupChatForAdmin(chatId, userId);
  if (!chat) return res.status(404).json({ error: "المجموعة غير موجودة" });
  await patchGroupChatForMembers(chatId, chat.members, { removeMemberIds: [userId] });
  let state = (await getSnapshot(userId)) as { chats?: Chat[] } | null;
  if (state?.chats) {
    state = { ...state, chats: state.chats.filter(c => c.id !== chatId) };
    await setSnapshot(userId, state);
  }
  return res.json({ ok: true });
});

app.use(createGroupRouter(authMiddleware));
app.use(createModerationRouter(authMiddleware));

const patchProfileSchema = z.object({
  username: z.string().min(1).max(30).optional(),
  displayName: z.string().max(80).optional(),
  avatar: z.string().max(2_000_000).optional(),
  bio: z.string().max(2000).optional(),
  note: z.string().max(200).optional(),
  profileLink: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
  email: z.string().email().optional(),
  phone: z.string().max(24).optional(),
});

function broadcastProfileUpdated(user: UserRow): void {
  broadcastSseEvent("user_profile_updated", { user: publicUserPayload(user) });
}

app.patch("/v1/me/profile", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = patchProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const cur = await getUserById(userId);
  if (!cur) return res.status(404).json({ error: "not found" });

  const patch: Parameters<typeof updateUser>[1] = {};
  const d = parsed.data;
  if (typeof d.username === "string") {
    const rawUsername = d.username.trim();
    if (rawUsername.length > 0) {
      const norm = normalizeUsername(rawUsername);
      const nameErr = validateUsernameFormat(norm, userId);
      if (nameErr) return res.status(400).json({ error: nameErr });
      const curNorm = normalizeUsername(cur.username);
      if (norm !== curNorm) {
        if (await usernameExists(norm, userId)) {
          return res.status(409).json({ error: "اسم المستخدم مستخدم" });
        }
        patch.username = norm;
      }
    }
  }
  if (d.avatar != null) {
    let av = d.avatar.trim();
    if (isDataUrl(av)) {
      try {
        av = await processDataUrl(av);
      } catch {
        return res.status(400).json({ error: "فشل معالجة الصورة" });
      }
    }
    const avRef = toClientMediaRef(av) || av;
    const { assertAvatarAllowed } = await import("./routes/verificationRoutes.js");
    const avatarErr = await assertAvatarAllowed(cur, avRef);
    if (avatarErr) return res.status(403).json({ error: avatarErr });
    patch.avatar = avRef;
  }
  if (d.displayName != null) patch.displayName = d.displayName.trim();
  if (d.bio != null) patch.bio = d.bio;
  const prevBio = cur.bio ?? "";
  const newBio  = d.bio   ?? cur.bio ?? "";
  if (d.note != null) patch.note = d.note.trim();
  if (d.profileLink != null) patch.profileLink = d.profileLink.trim();
  if (d.isPrivate != null) patch.isPrivate = d.isPrivate === true;
  if (d.email != null) {
    const emailNorm = d.email.trim().toLowerCase();
    if (emailNorm !== cur.email.trim().toLowerCase()) {
      if (await findUserByEmailOrUsername(emailNorm)) {
        return res.status(409).json({ error: "البريد مستخدم من قبل" });
      }
      patch.email = emailNorm;
    }
  }
  if (d.phone != null) {
    const phoneErr = validateOptionalPhone(d.phone);
    if (phoneErr) return res.status(400).json({ error: phoneErr });
    patch.phone = normalizePhone(d.phone) || undefined;
  }

  const user = await updateUser(userId, patch);
  if (!user) return res.status(404).json({ error: "not found" });

  const snap = (await getSnapshot(userId)) as AppState | null;
  if (snap?.users) {
    const st = snap as AppState;
    st.users = (st.users || []).map(u =>
      u.id === userId
        ? {
            ...u,
            username: user.username,
            displayName: user.displayName?.trim() || u.displayName,
            avatar: toClientMediaRef(user.avatar) || user.avatar,
            bio: user.bio ?? u.bio,
            note: user.note ?? u.note,
            profileLink: user.profileLink ?? u.profileLink,
            isPrivate: user.isPrivate === true,
            verified: user.verified === true,
            founderVerified: user.founderVerified === true,
            founderOfficialLabel: user.founderOfficialLabel ?? u.founderOfficialLabel,
            isSubscribed: user.isSubscribed === true,
            subscriptionPlan: user.subscriptionPlan,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            verificationStatus: user.verificationStatus,
            verificationBadgeColor: user.verificationBadgeColor,
            canUseAnimatedAvatar: user.canUseAnimatedAvatar === true,
            storyMaxDuration: user.storyMaxDuration,
            storyExpiryOptions: user.storyExpiryOptions,
            postCharacterLimit: user.postCharacterLimit,
          }
        : u,
    );
    await setSnapshot(userId, {
      ...st,
      users: st.users.map(u => ({ ...u, password: "" })),
    });
  }

  broadcastProfileUpdated(user);

  // إشعارات المنشن في البايو — فقط للمنشنات الجديدة
  if (d.bio != null && newBio !== prevBio) {
    const extractMentions = (text: string) =>
      Array.from(new Set((text.match(/@([a-z0-9_]{1,30})/gi) || []).map(m => m.slice(1).toLowerCase())));
    const prevMentions = new Set(extractMentions(prevBio));
    const newMentions  = extractMentions(newBio);
    const addedMentions = newMentions.filter(uname => !prevMentions.has(uname));
    if (addedMentions.length > 0) {
      const { listUsers } = await import("./db/engine.js");
      const { deliverBioMentionNotification } = await import("./lib/socialActions.js");
      const allUsers = await listUsers();
      for (const uname of addedMentions) {
        const target = allUsers.find(u => u.username.toLowerCase() === uname);
        if (!target || target.id === userId) continue;
        void deliverBioMentionNotification(target.id, userId, newBio);
      }
    }
  }

  return res.json({ user: publicUserPayload(user) });
});

/** تنظيف الريلزات القديمة (شاشة سوداء) — مشرفون فقط في وضع التطوير */
app.post("/v1/admin/cleanup-stale-reels", authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "1") {
    return res.status(403).json({ error: "غير مصرح في وضع الإنتاج" });
  }
  const { cleanupStaleReels } = await import("./lib/seedDemoContent.js");
  const deleted = await cleanupStaleReels();
  return res.json({ ok: true, deleted });
});

/** تسجيل زيارة ملف شخصي — يُحدّث قائمة الزوار + إشعار للمُزار */
app.post("/v1/users/:targetId/visit", authMiddleware, async (req, res) => {
  setNoStoreApi(res);
  const visitorId = (req as Request & { userId: string }).userId;
  const targetId = String(req.params.targetId ?? "").trim();
  if (!targetId || targetId === visitorId) return res.json({ ok: true });
  try {
    const { recordProfileVisitOnServer } = await import("./lib/postSocial.js");
    await recordProfileVisitOnServer(visitorId, targetId);
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
});

const deleteAccountSchema = z.object({
  confirm: z.literal("DELETE"),
  password: z.string().min(1).max(128).optional(),
});

app.delete("/v1/me/account", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "أكّد الحذف بكتابة DELETE" });
  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: "not found" });
  if (user.passwordHash) {
    const pwd = parsed.data.password?.trim() || "";
    if (!pwd) return res.status(400).json({ error: "أدخل كلمة المرور لتأكيد الحذف" });
    const ok = await bcrypt.compare(pwd, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "كلمة المرور غير صحيحة" });
  }
  const { deleteUserAccount } = await import("./lib/deleteUserAccount.js");
  const result = await deleteUserAccount(userId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  return res.json({ ok: true });
});

app.put("/v1/me/password", authMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const parsed = pwdChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });
  const { oldPassword, newPassword } = parsed.data;
  const user = await getUserById(userId);
  if (!user) return res.status(404).json({ error: "not found" });
  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "كلمة المرور الحالية خاطئة" });
  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(newPassword, rounds);
  await updateUser(userId, { passwordHash });
  return res.json({ ok: true });
});

const uploadDefault = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});
const uploadReel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function mediaUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  const isReel = String(req.query.reel ?? "") === "1";
  (isReel ? uploadReel : uploadDefault).single("file")(req, res, next);
}

app.post("/v1/media/upload", authMiddleware, mediaUploadMiddleware, async (req, res) => {
  const userId = (req as Request & { userId: string }).userId;
  const file = req.file;
  if (!file) return res.status(400).json({ error: "no file" });
  const mime = (file.mimetype || "").toLowerCase();
  const forAvatar = String(req.query.avatar ?? "") === "1";
  if (forAvatar && mime === "image/gif") {
    const author = await getUserById(userId);
    if (!author) return res.status(404).json({ error: "not found" });
    const { getUserEntitlements } = await import("../../src/lib/verificationEntitlements.js");
    if (!getUserEntitlements(author).canUseAnimatedAvatar) {
      return res.status(403).json({ error: "الافتار المتحرك (GIF) للحسابات الموثقة فقط" });
    }
  }
  try {
    if (mime.startsWith("image/")) {
      const { url, kind } = await saveUploadedImage(file.buffer, mime);
      return res.json({ url, kind });
    }
    if (mime.startsWith("video/")) {
      const tmpDir = path.join(MEDIA_VIDEOS_DIR, "_tmp");
      const fs = await import("node:fs/promises");
      await fs.mkdir(tmpDir, { recursive: true });
      const ext = mime.includes("webm")
        ? "webm"
        : mime.includes("quicktime") || mime.includes("mov")
          ? "mov"
          : "mp4";
      const tmpIn = path.join(tmpDir, `${crypto.randomUUID()}.${ext}`);
      await fs.writeFile(tmpIn, file.buffer);
      const storyFast = String(req.query.story ?? "") === "1";
      const forReel = String(req.query.reel ?? "") === "1";
      const forVoiceTweet = String(req.query.voice ?? "") === "1";
      try {
        if (forVoiceTweet) {
          const { extractVoiceAudioFromVideo } = await import("./lib/mediaCompress.js");
          const { url } = await extractVoiceAudioFromVideo(tmpIn);
          return res.json({ url, kind: "audio" });
        }
        if (storyFast) {
          const { url } = await saveVideoFile(tmpIn);
          return res.json({ url, kind: "video" });
        }
        if (forReel) {
          const { compressAndSaveReelVideo } = await import("./lib/reelTranscode.js");
          const { url, posterUrl } = await compressAndSaveReelVideo(tmpIn);
          return res.json({ url, posterUrl, kind: "video" });
        }
        const { url } = await compressAndSaveVideo(tmpIn);
        return res.json({ url, kind: "video" });
      } catch (videoErr) {
        // eslint-disable-next-line no-console
        console.warn("[media/upload] video transcode failed, saving original", videoErr);
        const { url } = await saveVideoFile(tmpIn);
        return res.json({ url, kind: "video" });
      } finally {
        await fs.unlink(tmpIn).catch(() => undefined);
      }
    }
    if (mime.startsWith("audio/")) {
      const tmpDir = path.join(MEDIA_VIDEOS_DIR, "_tmp");
      const fs = await import("node:fs/promises");
      await fs.mkdir(tmpDir, { recursive: true });
      const ext = mime.includes("wav")
        ? "wav"
        : mime.includes("ogg")
          ? "ogg"
          : mime.includes("aac")
            ? "aac"
            : mime.includes("m4a")
              ? "m4a"
              : "mp3";
      const tmpIn = path.join(tmpDir, `${crypto.randomUUID()}.${ext}`);
      await fs.writeFile(tmpIn, file.buffer);
      try {
        const { url } = await saveAudioFile(tmpIn);
        return res.json({ url, kind: "audio" });
      } finally {
        await fs.unlink(tmpIn).catch(() => undefined);
      }
    }
    return res.status(400).json({ error: "نوع ملف غير مدعوم" });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[media/upload]", e);
    return res.status(500).json({ error: "تعذر رفع الملف — جرّب صورة أو فيديو أصغر" });
  }
});

function logListenUrls(p: number, host: string) {
  // eslint-disable-next-line no-console
  console.log(`Retweet Backend on ${host}:${p} — data: ${DATA_ROOT}`);
  // eslint-disable-next-line no-console
  console.log(`  ${PUBLIC_BASE_URL}`);
  // eslint-disable-next-line no-console
  console.log(`  http://localhost:${p}`);
  if (host === "0.0.0.0" || host === "::") {
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const net of nets ?? []) {
        const fam = net.family;
        const v4 = fam === "IPv4" || fam === 4;
        if (v4 && !net.internal) {
          // eslint-disable-next-line no-console
          console.log(`  http://${net.address}:${p}`);
        }
      }
    }
  }
}

await initDatabase();

const { registerVerificationRoutes } = await import("./routes/verificationRoutes.js");
registerVerificationRoutes(app, authMiddleware, broadcastProfileUpdated);

const { registerGameRoutes } = await import("./routes/gameRoutes.js");
registerGameRoutes(app, authMiddleware);
const { registerSecurityRoutes } = await import("./routes/securityRoutes.js");
registerSecurityRoutes(app, authMiddleware);
if (isSmtpConfigured()) {
  const smtpCheck = await verifySmtpConnection();
  if (smtpCheck.ok) {
    // eslint-disable-next-line no-console
    console.log("[mail] SMTP جاهز — إرسال OTP عبر البريد مفعّل");
  } else {
    // eslint-disable-next-line no-console
    console.warn("[mail] SMTP مُعدّ لكن فشل التحقق:", smtpCheck.error);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[mail] SMTP غير مُعدّ — التسجيل واستعادة كلمة المرور لن يرسلا بريداً");
}
await import("node:fs/promises").then(fs => fs.mkdir(MEDIA_IMAGES_DIR, { recursive: true }));
await import("node:fs/promises").then(fs => fs.mkdir(MEDIA_VIDEOS_DIR, { recursive: true }));

const staticSiteDir = process.env.STATIC_SITE_DIR?.trim();
if (staticSiteDir) {
  const resolved =
    path.isAbsolute(staticSiteDir)
      ? staticSiteDir
      : path.resolve(process.cwd(), staticSiteDir);
  mountStaticSite(app, resolved);
}

const httpServer = http.createServer(app);
attachRealtimeSocket(httpServer);
httpServer.listen(PORT, HOST, () => logListenUrls(PORT, HOST));

// ——— كرون سترك المحادثات: فحص كل ساعة ———
setInterval(async () => {
  try {
    const { expireOldStreaks } = await import("./lib/chatStreak.js");
    const n = await expireOldStreaks();
    if (n > 0) {
      // eslint-disable-next-line no-console
      console.log(`[streak] أعاد تصفير ${n} سترك منتهي`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[streak] cron error", e);
  }
}, 60 * 60 * 1000);
