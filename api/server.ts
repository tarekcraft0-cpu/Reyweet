import "dotenv/config";
import crypto from "node:crypto";
import os from "node:os";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/db";
import { signAccessToken, verifyAccessToken } from "./lib/jwt";
import { buildAppState } from "./lib/mapper";
import { generateOtpDigits } from "./lib/otp";
import type { AppState } from "../src/lib/types";

type Variables = { userId: string };

const app = new Hono<{ Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: origin => {
      // يجب إرجاع نفس سلسلة الـ Origin (أو "*") — لا تُرجع true وإلا يضع المتصفح Allow-Origin: true ويرفض الطلب.
      if (!origin) return "*";
      if (origin.startsWith("capacitor://") || origin.startsWith("ionic://")) return origin;
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
      if (process.env.NODE_ENV !== "production") {
        if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return origin;
        if (/^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return origin;
        if (/^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return origin;
      }
      return false;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
  }),
);

app.get("/health", c => c.json({ ok: true, service: "retweet-api" }));

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

function sanitizeStateForStorage(state: AppState): AppState {
  return {
    ...state,
    users: (state.users || []).map(u => ({ ...u, password: "" })),
  };
}

app.post("/auth/register", async c => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "جسم الطلب ليس JSON صالحاً" }, 400);
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "بيانات غير صالحة", details: parsed.error.flatten() }, 400);
  const { email, username, password } = parsed.data;
  const emailNorm = email.trim().toLowerCase();
  try {
    const exists = await prisma.user.findFirst({
      where: { OR: [{ email: emailNorm }, { username: { equals: username, mode: "insensitive" } }] },
    });
    if (exists) return c.json({ error: "البريد أو اسم المستخدم مستخدم" }, 409);
    const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
    const passwordHash = await bcrypt.hash(password, rounds);
    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        username: username.trim(),
        passwordHash,
        avatar: username.slice(0, 2).toUpperCase(),
      },
    });
    const token = signAccessToken(user.id);
    return c.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "P2002") {
      return c.json({ error: "البريد أو اسم المستخدم مستخدم" }, 409);
    }
    // eslint-disable-next-line no-console
    console.error("[auth/register]", e);
    return c.json({ error: "تعذر حفظ الحساب — تأكد أن PostgreSQL يعمل ونفّذ prisma db push" }, 500);
  }
});

app.post("/auth/login", async c => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "جسم الطلب ليس JSON صالحاً" }, 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "بيانات غير صالحة" }, 400);
  const identifier = parsed.data.identifier.trim();
  const password = parsed.data.password;
  const q = identifier.toLowerCase();
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: q }, { username: { equals: identifier, mode: "insensitive" } }],
      },
    });
    if (!user) return c.json({ error: "بيانات خاطئة" }, 401);
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      if (user.googleId) {
        return c.json({ error: "هذا الحساب مرتبط بـ Google — استخدم «تسجيل الدخول عبر Google»" }, 401);
      }
      return c.json({ error: "بيانات خاطئة" }, 401);
    }
    const token = signAccessToken(user.id);
    return c.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (e: unknown) {
    // eslint-disable-next-line no-console
    console.error("[auth/login]", e);
    return c.json({ error: "تعذر الاتصال بقاعدة البيانات" }, 500);
  }
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
  const trimmed = local.replace(/^_|_$/g, "") || "user";
  return trimmed.slice(0, 24);
}

async function uniqueUsernameFromEmail(emailNorm: string): Promise<string> {
  let base = usernameBaseFromEmail(emailNorm);
  if (base.length < 3) base = base.padEnd(3, "x");
  base = base.slice(0, 20);
  let candidate = base;
  for (let i = 0; i < 40; i++) {
    const c = candidate.slice(0, 30);
    const exists = await prisma.user.findFirst({
      where: { username: { equals: c, mode: "insensitive" } },
    });
    if (!exists) return c;
    candidate = `${base}_${Math.floor(1000 + Math.random() * 8999)}`;
  }
  return `${base.slice(0, 18)}_${crypto.randomBytes(3).toString("hex")}`.slice(0, 30);
}

const googleAuthSchema = z.object({ idToken: z.string().min(20) });

app.post("/auth/google", async c => {
  const audiences = googleAudiences();
  if (audiences.length === 0) {
    return c.json({ error: "خادم Google غير مُعدّ (GOOGLE_WEB_CLIENT_ID)" }, 503);
  }
  const parsed = googleAuthSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "بيانات غير صالحة" }, 400);

  const oauth = new OAuth2Client();
  let sub: string;
  let emailNorm: string;
  let name: string | undefined;
  let picture: string | undefined;
  try {
    const ticket = await oauth.verifyIdToken({
      idToken: parsed.data.idToken,
      audience: audiences,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return c.json({ error: "بيانات Google ناقصة" }, 401);
    }
    if (payload.email_verified === false) {
      return c.json({ error: "البريد غير موثّق في Google" }, 401);
    }
    sub = payload.sub;
    emailNorm = payload.email.trim().toLowerCase();
    name = payload.name ?? undefined;
    picture = payload.picture ?? undefined;
  } catch {
    return c.json({ error: "رمز Google غير صالح أو منتهي" }, 401);
  }

  const byGoogle = await prisma.user.findUnique({ where: { googleId: sub } });
  const byEmail = await prisma.user.findUnique({ where: { email: emailNorm } });

  if (byGoogle) {
    const token = signAccessToken(byGoogle.id);
    return c.json({
      token,
      user: { id: byGoogle.id, username: byGoogle.username, email: byGoogle.email },
    });
  }

  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== sub) {
      return c.json({ error: "البريد مرتبط بحساب Google آخر" }, 409);
    }
    const user = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: sub,
        ...(!byEmail.avatar
          ? { avatar: picture || (name?.trim() ? name.trim().slice(0, 2).toUpperCase() : byEmail.username.slice(0, 2).toUpperCase()) }
          : {}),
      },
    });
    const token = signAccessToken(user.id);
    return c.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  }

  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), rounds);
  const username = await uniqueUsernameFromEmail(emailNorm);
  const avatar =
    picture ||
    (name?.trim() ? name.trim().slice(0, 2).toUpperCase() : username.slice(0, 2).toUpperCase());

  const user = await prisma.user.create({
    data: {
      email: emailNorm,
      username,
      googleId: sub,
      passwordHash,
      avatar,
    },
  });
  const token = signAccessToken(user.id);
  return c.json({
    token,
    user: { id: user.id, username: user.username, email: user.email },
  });
});

const resetRequestSchema = z.object({ identifier: z.string().min(1) });
const resetCompleteSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(4).max(12),
  newPassword: z.string().min(6).max(128),
});

app.post("/auth/request-password-reset", async c => {
  const parsed = resetRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "بيانات غير صالحة" }, 400);
  const identifier = parsed.data.identifier.trim();
  const q = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: q }, { username: { equals: identifier, mode: "insensitive" } }] },
  });
  if (!user) {
    return c.json({ ok: true });
  }
  const code = generateOtpDigits();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.otpCode.deleteMany({ where: { userId: user.id, purpose: "password_reset" } });
  await prisma.otpCode.create({
    data: { userId: user.id, purpose: "password_reset", codeHash, expiresAt },
  });
  const dev = process.env.OTP_DEBUG === "1" || process.env.NODE_ENV !== "production";
  return c.json(dev ? { ok: true, devCode: code } : { ok: true });
});

app.post("/auth/complete-password-reset", async c => {
  const parsed = resetCompleteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "بيانات غير صالحة" }, 400);
  const { identifier, code, newPassword } = parsed.data;
  const q = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: q }, { username: { equals: identifier.trim(), mode: "insensitive" } }] },
  });
  if (!user) return c.json({ error: "تعذر التحقق" }, 400);
  const otp = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose: "password_reset" },
    orderBy: { expiresAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) return c.json({ error: "انتهت صلاحية الرمز" }, 400);
  const match = await bcrypt.compare(code.trim(), otp.codeHash);
  if (!match) return c.json({ error: "رمز غير صحيح" }, 400);
  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(newPassword, rounds);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.otpCode.deleteMany({ where: { userId: user.id, purpose: "password_reset" } }),
  ]);
  return c.json({ ok: true });
});

app.use("/v1/*", async (c, next) => {
  const raw = c.req.header("Authorization") || "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try {
    const { sub } = verifyAccessToken(token);
    c.set("userId", sub);
    await next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
});

app.get("/v1/app-state", async c => {
  const userId = c.get("userId");
  const snap = await prisma.userAppSnapshot.findUnique({ where: { userId } });
  if (snap?.state) {
    return c.json({ state: snap.state });
  }
  const state = await buildAppState(prisma, userId);
  return c.json({ state });
});

const putStateSchema = z.object({ state: z.any() });

app.put("/v1/app-state", async c => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = putStateSchema.safeParse(body);
  if (!parsed.success || !body?.state) return c.json({ error: "missing state" }, 400);
  const st = body.state as AppState;
  if (st.currentUserId !== userId) return c.json({ error: "forbidden" }, 403);
  const clean = sanitizeStateForStorage(st);
  await prisma.userAppSnapshot.upsert({
    where: { userId },
    create: { userId, state: clean as object },
    update: { state: clean as object },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { appTheme: st.theme === "dark" ? "dark" : "light", appLanguage: st.language === "en" ? "en" : "ar" },
  });
  return c.json({ ok: true });
});

const pwdChangeSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});

app.put("/v1/me/password", async c => {
  const userId = c.get("userId");
  const parsed = pwdChangeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "بيانات غير صالحة" }, 400);
  const { oldPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "not found" }, 404);
  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) return c.json({ error: "كلمة المرور الحالية خاطئة" }, 400);
  const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
  const passwordHash = await bcrypt.hash(newPassword, rounds);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return c.json({ ok: true });
});

const port = Number(process.env.PORT || 8788);
/** 0.0.0.0 حتى يقبل الاتصال من الهاتف (آيفون/أندرويد) على نفس شبكة الـ Wi‑Fi */
const hostname = (process.env.HOST || "0.0.0.0").trim();

function logListenUrls(p: number, host: string) {
  // eslint-disable-next-line no-console
  console.log(`Retweet API on ${host}:${p} (LAN + localhost)`);
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

logListenUrls(port, hostname);

serve({ fetch: app.fetch, port, hostname });
