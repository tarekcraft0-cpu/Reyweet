import type { ID } from "./types";

const KEY = "retweet-scheduled-posts";

export type ScheduledPostDraft = {
  id: ID;
  text: string;
  image?: string;
  publishAt: number;
  createdAt: number;
};

export function loadScheduledPosts(userId: ID): ScheduledPostDraft[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledPostDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScheduledPosts(userId: ID, items: ScheduledPostDraft[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(items.slice(0, 50)));
}

export function addScheduledPost(userId: ID, draft: Omit<ScheduledPostDraft, "id" | "createdAt">): ScheduledPostDraft {
  const item: ScheduledPostDraft = {
    ...draft,
    id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  const list = [...loadScheduledPosts(userId), item].sort((a, b) => a.publishAt - b.publishAt);
  saveScheduledPosts(userId, list);
  return item;
}

export function removeScheduledPost(userId: ID, id: ID): void {
  saveScheduledPosts(
    userId,
    loadScheduledPosts(userId).filter(p => p.id !== id),
  );
}
