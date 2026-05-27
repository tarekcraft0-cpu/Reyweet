import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { clientMessageFromRow, ingestDirectMessage, postMessageSchema } from "./ingestDirectMessage.js";
import { ChatAccessError } from "./chatAccess.js";
import { verifyAccessToken } from "./jwt.js";
import { clearAllTypingForUser, clearUserTyping, setUserTyping } from "./chatPresence.js";
import { markMessagesDelivered, markMessagesRead } from "./messageStatus.js";

let io: Server | null = null;

export function attachRealtimeSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    transports: ["websocket"],
    pingInterval: 10_000,
    pingTimeout: 25_000,
    perMessageDeflate: false,
  });

  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token ?? socket.handshake.query?.token;
      const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
      if (!token) return next(new Error("unauthorized"));
      const { sub } = verifyAccessToken(token);
      (socket.data as { userId?: string }).userId = sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = (socket.data as { userId?: string }).userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    void socket.join(`user:${userId}`);

    socket.on("message:send", (raw, ack) => {
      void (async () => {
        const parsed = postMessageSchema.safeParse(raw);
        if (!parsed.success) {
          ack?.({ ok: false, error: "بيانات غير صالحة" });
          return;
        }
        let senderId = userId;
        try {
          const rawToken = socket.handshake.auth?.token ?? socket.handshake.query?.token;
          const token = typeof rawToken === "string" ? rawToken : Array.isArray(rawToken) ? rawToken[0] : "";
          if (token) {
            const { sub } = verifyAccessToken(token);
            senderId = sub;
            (socket.data as { userId?: string }).userId = sub;
          }
        } catch {
          ack?.({ ok: false, error: "غير مصرح" });
          return;
        }
        if (!senderId) {
          ack?.({ ok: false, error: "غير مصرح" });
          return;
        }
        try {
          const row = await ingestDirectMessage(senderId, parsed.data);
          ack?.({ ok: true, message: clientMessageFromRow(row) });
        } catch (e) {
          const msg =
            e instanceof ChatAccessError
              ? e.message
              : e instanceof Error
                ? e.message
                : "فشل الإرسال";
          ack?.({ ok: false, error: msg });
        }
      })();
    });

    socket.on("call:signal", (raw, ack) => {
      const parsed = z
        .object({
          toUserId: z.string().min(1),
          chatId: z.string().min(1),
          signal: z.unknown(),
        })
        .safeParse(raw);
      if (!parsed.success) {
        ack?.({ ok: false });
        return;
      }
      const { toUserId, chatId, signal } = parsed.data;
      if (toUserId === userId) {
        ack?.({ ok: false });
        return;
      }
      emitToUser(toUserId, "call:signal", { fromUserId: userId, chatId, signal });
      ack?.({ ok: true });
    });

    socket.on("typing", (raw) => {
      const parsed = z
        .object({
          chatId: z.string().min(1),
          peerId: z.string().min(1).optional(),
          active: z.boolean(),
        })
        .safeParse(raw);
      if (!parsed.success || !userId) return;
      if (parsed.data.active) {
        setUserTyping(userId, { chatId: parsed.data.chatId, peerId: parsed.data.peerId ?? null });
      } else {
        clearUserTyping(userId, { chatId: parsed.data.chatId, peerId: parsed.data.peerId ?? null });
      }
    });

    socket.on("message:ack_delivered", (raw) => {
      void (async () => {
        const parsed = z
          .object({
            chatId: z.string().min(1),
            messageIds: z.array(z.string().min(1)).min(1),
          })
          .safeParse(raw);
        if (!parsed.success || !userId) return;
        await markMessagesDelivered(userId, parsed.data.chatId, parsed.data.messageIds);
      })();
    });

    socket.on("message:ack_read", (raw) => {
      void (async () => {
        const parsed = z
          .object({
            chatId: z.string().min(1),
            messageIds: z.array(z.string().min(1)).min(1),
          })
          .safeParse(raw);
        if (!parsed.success || !userId) return;
        await markMessagesRead(userId, parsed.data.chatId, parsed.data.messageIds);
      })();
    });

    socket.on("disconnect", () => {
      if (userId) clearAllTypingForUser(userId);
    });

    socket.on("call:ring", (raw, ack) => {
      const parsed = z
        .object({
          toUserId: z.string().min(1),
          chatId: z.string().min(1),
          video: z.boolean().optional(),
        })
        .safeParse(raw);
      if (!parsed.success) {
        ack?.({ ok: false });
        return;
      }
      const { toUserId, chatId, video } = parsed.data;
      if (toUserId === userId) {
        ack?.({ ok: false });
        return;
      }
      emitToUser(toUserId, "call:ring", { fromUserId: userId, chatId, video: video === true });
      ack?.({ ok: true });
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers(userIds: string[], event: string, payload: unknown): void {
  if (!io) return;
  const seen = new Set<string>();
  for (const uid of userIds) {
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    io.to(`user:${uid}`).emit(event, payload);
  }
}

/** بث لجميع متصلي Socket.io (إعجابات/تعليقات المنشورات) */
export function broadcastSocketEvent(event: string, payload: unknown): void {
  io?.emit(event, payload);
}
