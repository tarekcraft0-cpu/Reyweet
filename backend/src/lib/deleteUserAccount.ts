import fs from "node:fs/promises";
import path from "node:path";
import { DB_DIR } from "../config.js";
import { deleteOtpsForUser, getUserById } from "../db/engine.js";
import { purgeUserPublicContent } from "./purgeUserPublicContent.js";

const usersFile = path.join(DB_DIR, "users.json");

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    let raw = await fs.readFile(file, "utf8");
    raw = raw.replace(/^\uFEFF/, "").trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** يحذف حساب المستخدم من قاعدة البيانات (متطلب App Store 5.1.1). */
export async function deleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await getUserById(userId);
  if (!user) return { ok: false, error: "not found", status: 404 };

  const usersMap = await readJson<Record<string, unknown>>(usersFile, {});
  if (!usersMap[userId]) return { ok: false, error: "not found", status: 404 };

  await purgeUserPublicContent(userId);

  delete usersMap[userId];
  await writeJsonAtomic(usersFile, usersMap);

  for (const purpose of [
    "login",
    "password_reset",
    "password_reset_link",
    "signup",
    "appeal",
  ] as const) {
    await deleteOtpsForUser(userId, purpose);
  }

  return { ok: true };
}
