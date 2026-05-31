import { useCallback } from "react";
import { isGuestUserId } from "./guestUser";
import { useAppSelector } from "./useAppSelector";
import type { AppState, Chat, ID, Post, User } from "./types";

function resolveUser(s: AppState, id: ID): User | undefined {
  return s.users.find(u => u.id === id);
}

/** حالة التطبيق كاملة — للشاشات التي تحتاج userById / isMutual (مثل المحادثات) */
export function useAppState(): AppState {
  return useAppSelector(s => s);
}

/** المستخدم الحالي — لا يتغيّر عند تحديث chats/notifications */
export function useCurrentUser(): User | null {
  return useAppSelector(s => {
    const id = s.currentUserId;
    if (!id || isGuestUserId(id)) return null;
    return resolveUser(s, id) ?? null;
  });
}

export function useCurrentUserId(): ID | null {
  return useAppSelector(s => s.currentUserId || null);
}

export function useAppTheme(): AppState["theme"] {
  return useAppSelector(s => s.theme);
}

export function useAppLanguage(): AppState["language"] {
  return useAppSelector(s => s.language);
}

export function usePosts(): Post[] {
  return useAppSelector(s => s.posts);
}

export function useChats(): Chat[] {
  return useAppSelector(s => s.chats);
}

export function useChatById(chatId: ID | null | undefined): Chat | undefined {
  return useAppSelector(
    useCallback(s => (chatId ? s.chats.find(c => c.id === chatId) : undefined), [chatId]),
  );
}

export function useUnreadNotificationCount(userId: ID | null | undefined): number {
  return useAppSelector(
    useCallback(
      s =>
        userId
          ? (s.notifications ?? []).filter(
              n => n.userId === userId && !n.read && n.type !== "message",
            ).length
          : 0,
      [userId],
    ),
  );
}

export function useStoryStateForUser(userId: ID, viewerId: ID) {
  return useAppSelector(
    useCallback(
      s => ({
        author: resolveUser(s, userId),
        stories: s.stories.filter(st => st.userId === userId),
        viewerId,
      }),
      [userId, viewerId],
    ),
    (a, b) => a.author === b.author && a.stories === b.stories && a.viewerId === b.viewerId,
  );
}

/** ريلز فقط — لا يتأثر بتغيّر chats */
export function useReelsPosts(meId: ID | null, blocked: ID[]): Post[] {
  return useAppSelector(
    useCallback(
      s => {
        if (!meId) return [];
        const blockedSet = new Set(blocked);
        const seen = new Set<string>();
        const out: Post[] = [];
        for (const p of s.posts ?? []) {
          if (!p?.id || seen.has(p.id)) continue;
          if (p.type !== "reel" && !p.video) continue;
          const author = s.users.find(u => u.id === p.userId);
          if (author && blockedSet.has(author.id)) continue;
          seen.add(p.id);
          out.push(p);
        }
        out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        return out;
      },
      [meId, blocked.join(",")],
    ),
    (a, b) => {
      if (a === b) return true;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i] !== b[i]) return false;
      }
      return true;
    },
  );
}
