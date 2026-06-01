import {
  fileListPushTokensForUser,
  fileRemovePushToken,
  fileRemovePushTokens,
  fileUpsertPushToken,
} from "./fileStore.js";
import {
  firestoreListPushTokensForUser,
  firestoreRemovePushToken,
  firestoreRemovePushTokens,
  firestoreUpsertPushToken,
} from "./firestoreStore.js";
import type { PushTokenRecord, PushPlatform, SavePushTokenInput } from "./types.js";

export type { PushTokenRecord, PushPlatform, SavePushTokenInput };

function useFirestore(): boolean {
  return (process.env.PUSH_TOKEN_STORE || "file").trim().toLowerCase() === "firestore";
}

export async function upsertPushToken(
  userId: string,
  token: string,
  platform: PushPlatform,
  deviceId?: string,
): Promise<void> {
  const input: SavePushTokenInput = { userId, token, platform, deviceId };
  if (useFirestore()) return firestoreUpsertPushToken(input);
  return fileUpsertPushToken(input);
}

export async function removePushToken(token: string): Promise<void> {
  if (useFirestore()) return firestoreRemovePushToken(token);
  return fileRemovePushToken(token);
}

export async function listPushTokensForUser(userId: string): Promise<PushTokenRecord[]> {
  if (useFirestore()) return firestoreListPushTokensForUser(userId);
  return fileListPushTokensForUser(userId);
}

export async function removePushTokens(tokens: string[]): Promise<void> {
  if (useFirestore()) return firestoreRemovePushTokens(tokens);
  return fileRemovePushTokens(tokens);
}
