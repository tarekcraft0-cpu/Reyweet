import type { AppState } from "../../../src/lib/types.js";
import { rewriteAppStateMediaRefs, toClientMediaRef } from "./normalizeMediaRef.js";
import { DEFAULT_AVATAR_DATA_URI } from "./defaultAvatar.js";

/** يضمن شكل الحالة متوافقاً مع الواجهة ويمنع crash عند حقول ناقصة */
export function coerceAppStateForClient(state: AppState): AppState {
  const coerced: AppState = {
    ...state,
    users: (state.users ?? []).map(u => ({
      ...u,
      username: u.username ?? "user",
      email: u.email ?? "",
      bio: u.bio ?? "",
      avatar:
        toClientMediaRef(u.avatar) || DEFAULT_AVATAR_DATA_URI,
      password: "",
      followers: u.followers ?? [],
      following: u.following ?? [],
      blocked: u.blocked ?? [],
      closeFriends: u.closeFriends ?? [],
      favorites: u.favorites ?? [],
      highlights: u.highlights ?? [],
      followRequestIn: u.followRequestIn ?? [],
      followRequestOut: u.followRequestOut ?? [],
      isPrivate: u.isPrivate === true,
    })),
    posts: (state.posts ?? []).map(p => ({
      ...p,
      text: p.text ?? "",
      likes: p.likes ?? [],
      reposts: p.reposts ?? [],
      comments: p.comments ?? [],
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
    })),
    stories: state.stories ?? [],
    storyArchive: state.storyArchive ?? [],
    chats: (state.chats ?? []).map(c => ({
      ...c,
      members: c.members ?? [],
      admins: c.admins ?? [],
      hosts: c.hosts ?? [],
      messages: c.messages ?? [],
      pinnedMessageIds: c.pinnedMessageIds ?? [],
      lastOpenAtByUser: c.lastOpenAtByUser ?? {},
      lastReadMessageIdByUser: c.lastReadMessageIdByUser ?? {},
    })),
    stickers: state.stickers ?? [],
    notifications: state.notifications ?? [],
    mediaNotes: state.mediaNotes ?? [],
    accountIds: state.accountIds ?? (state.currentUserId ? [state.currentUserId] : []),
    theme: state.theme === "dark" ? "dark" : "light",
    language: state.language === "en" ? "en" : "ar",
  };
  return rewriteAppStateMediaRefs(coerced);
}
