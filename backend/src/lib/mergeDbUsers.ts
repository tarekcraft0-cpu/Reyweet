import type { AppState, User } from "../../../src/lib/types.js";
import { listUsers, type UserRow } from "../db/engine.js";

function rowToProfileOverlay(row: UserRow): Partial<User> {
  return {
    username: row.username,
    displayName: row.displayName?.trim() || undefined,
    email: row.email,
    phone: row.phone || undefined,
    avatar: row.avatar,
    bio: row.bio ?? "",
    profileLink: row.profileLink || row.officialSiteUrl || undefined,
    verified: row.verified === true,
    founderVerified: row.founderVerified === true,
    founderOfficialLabel: row.founderOfficialLabel,
    note: row.note || undefined,
    isPrivate: row.isPrivate === true,
  };
}

/** دمج حقول الحساب من users.json — مصدر الحقيقة لتوثيق المؤسس والملاحظة الرسمية */
export async function mergeDbUsersIntoAppState(state: AppState): Promise<AppState> {
  const rows = await listUsers();
  if (rows.length === 0) return state;

  const byId = new Map(rows.map(r => [r.id, r]));
  const users = (state.users || []).map(u => {
    const row = byId.get(u.id);
    if (!row) return u;
    return { ...u, ...rowToProfileOverlay(row) };
  });

  for (const row of rows) {
    if (users.some(u => u.id === row.id)) continue;
    const followers: string[] = [];
    const following: string[] = [];
    users.push({
      id: row.id,
      username: row.username,
      email: row.email,
      password: "",
      bio: row.bio ?? "",
      avatar: row.avatar,
      followers,
      following,
      highlights: [],
      followRequestIn: [],
      followRequestOut: [],
      publicChannelIds: [],
      blocked: [],
      closeFriends: [],
      favorites: [],
      profileViews: [],
      favoriteStickerContents: [],
      createdStickerContents: [],
      pinnedChatIds: [],
      mutedChatIds: [],
      isPrivate: row.isPrivate === true,
      ...rowToProfileOverlay(row),
    });
  }

  return { ...state, users };
}
