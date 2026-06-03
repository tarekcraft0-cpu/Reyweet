import fs from "node:fs/promises";
import path from "node:path";
import { DB_DIR } from "../config.js";

export type ServerNotificationPrefs = {
  pushEnabled: boolean;
  dmInAppBanner: boolean;
  pushInAppToast: boolean;
  mentionPush: boolean;
  followPush: boolean;
  messagePush: boolean;
};

const FILE = path.join(DB_DIR, "notification_prefs.json");

const DEFAULT_PREFS: ServerNotificationPrefs = {
  pushEnabled: true,
  dmInAppBanner: true,
  pushInAppToast: true,
  mentionPush: true,
  followPush: true,
  messagePush: true,
};

type Store = Record<string, ServerNotificationPrefs>;

let lock: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release!: () => void;
  lock = new Promise<void>(r => {
    release = r;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

function normalize(partial?: Partial<ServerNotificationPrefs>): ServerNotificationPrefs {
  return {
    pushEnabled: partial?.pushEnabled !== false,
    dmInAppBanner: partial?.dmInAppBanner !== false,
    pushInAppToast: partial?.pushInAppToast !== false,
    mentionPush: partial?.mentionPush !== false,
    followPush: partial?.followPush !== false,
    messagePush: partial?.messagePush !== false,
  };
}

export async function getNotificationPrefsForUser(
  userId: string,
): Promise<ServerNotificationPrefs> {
  const store = await readStore();
  return normalize(store[userId]);
}

export async function setNotificationPrefsForUser(
  userId: string,
  patch: Partial<ServerNotificationPrefs>,
): Promise<ServerNotificationPrefs> {
  return withLock(async () => {
    const store = await readStore();
    const next = normalize({ ...normalize(store[userId]), ...patch });
    store[userId] = next;
    await writeStore(store);
    return next;
  });
}

export function shouldSendPushType(
  prefs: ServerNotificationPrefs,
  type: string,
): boolean {
  if (!prefs.pushEnabled) return false;
  const t = (type || "").toUpperCase();
  if (t === "MESSAGE") return prefs.messagePush;
  if (t === "MENTION") return prefs.mentionPush;
  if (t === "FOLLOW" || t === "FOLLOW_REQUEST") return prefs.followPush;
  return true;
}
