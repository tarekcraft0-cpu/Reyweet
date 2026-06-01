import { createHash } from "node:crypto";
import type { PushTokenRecord, SavePushTokenInput } from "./types.js";

const COLLECTION = "push_tokens";
const MAX_TOKENS_PER_USER = 12;

function tokenDocId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 40);
}

async function getDb() {
  const { getApps, initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) {
    const json = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
    if (json) {
      initializeApp({ credential: cert(JSON.parse(json) as Parameters<typeof cert>[0]) });
    } else {
      const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
      const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
      let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
      if (!projectId || !clientEmail || !privateKey) {
        throw new Error("Firestore push store requires Firebase credentials");
      }
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey } as Parameters<typeof cert>[0]),
      });
    }
  }
  return getFirestore();
}

export async function firestoreUpsertPushToken(input: SavePushTokenInput): Promise<void> {
  const t = input.token.trim();
  if (!t) return;
  const db = await getDb();
  const now = new Date().toISOString();
  const docId = tokenDocId(t);
  await db
    .collection(COLLECTION)
    .doc(docId)
    .set(
      {
        userId: input.userId,
        token: t,
        platform: input.platform,
        deviceId: input.deviceId?.trim() || null,
        updatedAt: now,
      },
      { merge: true },
    );

  const snap = await db.collection(COLLECTION).where("userId", "==", input.userId).get();
  if (snap.size <= MAX_TOKENS_PER_USER) return;

  const sorted = snap.docs
    .map(d => ({ id: d.id, updatedAt: String(d.data().updatedAt || "") }))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const toDelete = sorted.slice(0, snap.size - MAX_TOKENS_PER_USER);
  const batch = db.batch();
  for (const row of toDelete) {
    if (row.id !== docId) batch.delete(db.collection(COLLECTION).doc(row.id));
  }
  await batch.commit();
}

export async function firestoreRemovePushToken(token: string): Promise<void> {
  const t = token.trim();
  if (!t) return;
  const db = await getDb();
  await db.collection(COLLECTION).doc(tokenDocId(t)).delete();
}

export async function firestoreListPushTokensForUser(userId: string): Promise<PushTokenRecord[]> {
  const db = await getDb();
  const snap = await db.collection(COLLECTION).where("userId", "==", userId).get();
  return snap.docs.map(d => {
    const x = d.data();
    return {
      token: String(x.token || ""),
      userId: String(x.userId || userId),
      platform: (x.platform as PushTokenRecord["platform"]) || "web",
      deviceId: x.deviceId ? String(x.deviceId) : undefined,
      updatedAt: String(x.updatedAt || ""),
    };
  });
}

export async function firestoreRemovePushTokens(tokens: string[]): Promise<void> {
  const db = await getDb();
  const batch = db.batch();
  for (const t of tokens) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    batch.delete(db.collection(COLLECTION).doc(tokenDocId(trimmed)));
  }
  await batch.commit();
}
