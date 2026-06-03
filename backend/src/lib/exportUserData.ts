import type { AppState } from "../../../src/lib/types.js";
import { getSnapshot, getUserById, listMessagesForUser } from "../db/engine.js";
import { messageRowToClient } from "./chatMessages.js";

export async function buildUserDataExport(userId: string): Promise<Record<string, unknown>> {
  const user = await getUserById(userId);
  const snapshot = (await getSnapshot(userId)) as AppState | null;
  const messageRows = await listMessagesForUser(userId);
  const posts = (snapshot?.posts || []).filter(p => p.userId === userId);

  const safeUser = user
    ? {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        phone: user.phone,
        bio: user.bio,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isPrivate: user.isPrivate,
        verified: user.verified,
      }
    : null;

  return {
    exportedAt: new Date().toISOString(),
    format: "retweet-gdpr-export-v1",
    user: safeUser,
    snapshot: snapshot
      ? {
          posts: snapshot.posts,
          stories: snapshot.stories,
          chats: (snapshot.chats || []).map(c => ({
            ...c,
            messages: (c.messages || []).map(m => ({ ...m })),
          })),
          users: (snapshot.users || []).map(u => ({
            ...u,
            password: undefined,
          })),
        }
      : null,
    messagesFromDb: messageRows.map(messageRowToClient),
    postsFromDb: posts,
  };
}
