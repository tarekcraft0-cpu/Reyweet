import fs from "node:fs/promises";
import path from "node:path";
import type { Chat } from "../../../src/lib/types.js";
import { DB_DIR } from "../config.js";

let cached: Map<string, Chat> | null = null;

/** بيانات المحادثات (مجموعات/قنوات) المستخرجة من اللقطات — db/chats.json */
export async function getChatCatalog(): Promise<Map<string, Chat>> {
  if (cached) return cached;
  const file = path.join(DB_DIR, "chats.json");
  let raw: Record<string, Chat> = {};
  try {
    raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, Chat>;
  } catch {
    raw = {};
  }
  cached = new Map(
    Object.entries(raw).map(([id, c]) => [
      id,
      { ...c, id: c.id || id, messages: c.messages ?? [] },
    ]),
  );
  return cached;
}

export function clearChatCatalogCache(): void {
  cached = null;
}
