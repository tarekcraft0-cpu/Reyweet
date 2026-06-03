import type { Express, Request, Response, NextFunction } from "express";
import { getSnapshot, listRecentUsers, listUsers } from "../db/engine.js";
import { buildUserDataExport } from "../lib/exportUserData.js";
import { acceptChatMessageRequest } from "../lib/chatRequestAccept.js";
import type { AppState } from "../../../src/lib/types.js";
import { DEFAULT_AVATAR_DATA_URI } from "../lib/defaultAvatar.js";
import { toClientMediaRef } from "../lib/normalizeMediaRef.js";

type AuthedReq = Request & { userId: string };

export function registerAccountDataRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get("/v1/me/export", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    try {
      const payload = await buildUserDataExport(userId);
      const filename = `retweet-export-${userId.slice(0, 8)}-${Date.now()}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(payload, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "فشل التصدير";
      return res.status(500).json({ error: msg });
    }
  });

  app.post("/v1/chats/:chatId/accept-request", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const chatId = String(req.params.chatId || "").trim();
    if (!chatId) return res.status(400).json({ error: "chatId مطلوب" });
    const result = await acceptChatMessageRequest(userId, chatId);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ ok: true });
  });

  app.get("/v1/discover/suggestions", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
    const snap = (await getSnapshot(userId)) as AppState | null;
    const following = new Set<string>();
    const blocked = new Set<string>();
    for (const u of snap?.users || []) {
      if (u.id === userId) continue;
      if ((u.followingIds || []).includes(userId) || snap?.currentUserId === u.id) {
        /* noop */
      }
    }
    const me = snap?.users?.find(u => u.id === userId);
    if (me) {
      for (const id of me.followingIds || []) following.add(id);
      for (const id of me.blockedUserIds || []) blocked.add(id);
    }

    const recent = await listRecentUsers(limit * 3);
    const all = await listUsers();
    const candidates = [...recent, ...all];
    const seen = new Set<string>([userId]);
    const users = [];
    for (const row of candidates) {
      if (seen.has(row.id) || following.has(row.id) || blocked.has(row.id)) continue;
      seen.add(row.id);
      const av = toClientMediaRef(row.avatar) || DEFAULT_AVATAR_DATA_URI;
      users.push({
        id: row.id,
        username: row.username,
        email: row.email,
        avatar: av.startsWith("/media/") ? `${av}?v=${Date.parse(row.updatedAt) || 0}` : av,
      });
      if (users.length >= limit) break;
    }
    return res.json({ ok: true, users });
  });
}
