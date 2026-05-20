import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { DATA_ROOT } from "../config.js";

const FILE = path.join(DATA_ROOT, "group_invites.json");

export type GroupInviteRow = { chatId: string; creatorId: string };

export function generateInviteCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 10);
}

async function readAll(): Promise<Record<string, GroupInviteRow>> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, GroupInviteRow>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, GroupInviteRow>): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function registerGroupInvite(
  code: string,
  chatId: string,
  creatorId: string,
): Promise<void> {
  const all = await readAll();
  all[code] = { chatId, creatorId };
  await writeAll(all);
}

export async function resolveGroupInvite(code: string): Promise<GroupInviteRow | null> {
  const norm = code.trim();
  if (!norm) return null;
  const all = await readAll();
  return all[norm] ?? null;
}

export async function removeGroupInvite(code: string): Promise<void> {
  const all = await readAll();
  delete all[code.trim()];
  await writeAll(all);
}
