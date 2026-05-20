export const STORY_FULLSCREEN_EVENT = "retweet-story-fullscreen";
export const OPEN_STORY_EVENT = "retweet-open-story";

export function setStoryFullscreen(open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORY_FULLSCREEN_EVENT, { detail: { open } }));
}

export function openStoryViewer(userId: string, storyId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_STORY_EVENT, { detail: { userId, storyId } }));
}
