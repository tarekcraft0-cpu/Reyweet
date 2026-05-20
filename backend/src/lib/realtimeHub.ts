import type { Response } from "express";
import { randomUUID } from "node:crypto";

type SseClient = {
  id: string;
  userId: string;
  res: Response;
};

const clients = new Map<string, SseClient>();

export function registerSseClient(userId: string, res: Response): string {
  const id = randomUUID();
  clients.set(id, { id, userId, res });
  return id;
}

export function removeSseClient(id: string): void {
  clients.delete(id);
}

function writeSse(event: string, payload: unknown, res: Response): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
}

export function broadcastSseEvent(event: string, payload: unknown): void {
  for (const [id, client] of clients) {
    try {
      writeSse(event, payload, client.res);
    } catch {
      clients.delete(id);
    }
  }
}

export function broadcastSseToUser(userId: string, event: string, payload: unknown): void {
  for (const [id, client] of clients) {
    if (client.userId !== userId) continue;
    try {
      writeSse(event, payload, client.res);
    } catch {
      clients.delete(id);
    }
  }
}

export function broadcastSseExcept(userId: string, event: string, payload: unknown): void {
  for (const [id, client] of clients) {
    if (client.userId === userId) continue;
    try {
      writeSse(event, payload, client.res);
    } catch {
      clients.delete(id);
    }
  }
}

export function sseClientCount(): number {
  return clients.size;
}
