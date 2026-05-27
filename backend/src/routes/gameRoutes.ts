import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  createGameRoom,
  getRoom,
  getRoomByChat,
  applyShot,
  forfeitGame,
  broadcastGameEvent,
  serializeRoom,
} from "../lib/poolGame.js";

type AuthedReq = Request & { userId: string };

const shotSchema = z.object({
  balls: z.array(z.object({
    id: z.number(),
    x: z.number(),
    y: z.number(),
    vx: z.number().default(0),
    vy: z.number().default(0),
    pocketed: z.boolean(),
  })),
  pocketedThisShot: z.array(z.number()),
  cuePocketed: z.boolean(),
});

export function registerGameRoutes(
  app: Express,
  authMiddleware: (req: Request, res: Response, next: NextFunction) => void,
): void {
  /** إنشاء غرفة لعبة عند قبول الدعوة */
  app.post("/v1/games/pool/create", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const { chatId, opponentId, inviteMessageId } = req.body as {
      chatId?: string;
      opponentId?: string;
      inviteMessageId?: string;
    };
    if (!chatId || !opponentId || !inviteMessageId) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }
    const room = createGameRoom(chatId, userId, opponentId, inviteMessageId);
    const payload = serializeRoom(room);
    broadcastGameEvent(room, "pool:room_created", payload);
    return res.json({ ok: true, room: payload });
  });

  /** جلب حالة الغرفة */
  app.get("/v1/games/pool/:roomId", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const room = getRoom(req.params.roomId!);
    if (!room) return res.status(404).json({ error: "الغرفة غير موجودة" });
    if (room.player1Id !== userId && room.player2Id !== userId) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    return res.json({ room: serializeRoom(room) });
  });

  /** جلب غرفة المحادثة */
  app.get("/v1/games/pool/by-chat/:chatId", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const chatId = decodeURIComponent(req.params.chatId!);
    const room = getRoomByChat(chatId);
    if (!room) return res.status(404).json({ error: "لا توجد لعبة نشطة" });
    if (room.player1Id !== userId && room.player2Id !== userId) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    return res.json({ room: serializeRoom(room) });
  });

  /** تطبيق نتيجة ضربة */
  app.post("/v1/games/pool/:roomId/shot", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const parsed = shotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "بيانات الضربة غير صالحة" });

    const result = applyShot(req.params.roomId!, userId, parsed.data);
    if (!result.ok) return res.status(400).json({ error: result.error });

    const payload = serializeRoom(result.room);
    broadcastGameEvent(result.room, "pool:state_update", payload);
    return res.json({ ok: true, room: payload });
  });

  /** انسحاب */
  app.post("/v1/games/pool/:roomId/forfeit", authMiddleware, async (req, res) => {
    const userId = (req as AuthedReq).userId;
    const room = forfeitGame(req.params.roomId!, userId);
    if (!room) return res.status(404).json({ error: "الغرفة غير موجودة" });

    const payload = serializeRoom(room);
    broadcastGameEvent(room, "pool:state_update", payload);
    return res.json({ ok: true, room: payload });
  });
}
