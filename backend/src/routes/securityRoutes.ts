import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getUserById, updateUser } from "../db/engine.js";
import {
  revokeAllTrustedDevices,
  securitySummary,
} from "../lib/loginSecurity.js";

type AuthedReq = Request & { userId: string };

const twoFactorSchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1).max(128),
});

const revokeSchema = z.object({
  password: z.string().min(1).max(128),
});

export function registerSecurityRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/v1/me/security", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "غير موجود" });
    return res.json(securitySummary(user));
  });

  app.put("/v1/me/two-factor", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = twoFactorSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "غير موجود" });
    if (user.googleId && !user.passwordHash) {
      return res.status(400).json({
        error: "هذا الحساب عبر Google فقط — عيّن كلمة مرور من الإعدادات أولاً",
      });
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });

    await updateUser(userId, { twoFactorEnabled: parsed.data.enabled });
    const updated = await getUserById(userId);
    return res.json({
      ok: true,
      ...securitySummary(updated!),
    });
  });

  app.post("/v1/me/trusted-devices/revoke-all", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = revokeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات غير صالحة" });

    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "غير موجود" });

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });

    await revokeAllTrustedDevices(userId);
    const updated = await getUserById(userId);
    return res.json({
      ok: true,
      message: "تم إزالة جميع الأجهزة الموثوقة — سيُطلب كود بريد عند الدخول التالي",
      ...securitySummary(updated!),
    });
  });
}
