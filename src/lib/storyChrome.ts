export const STORY_FULLSCREEN_EVENT = "retweet-story-fullscreen";
export const OPEN_STORY_EVENT = "retweet-open-story";

let fullscreenLocks = 0;

function emitStoryFullscreen() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(STORY_FULLSCREEN_EVENT, {
      detail: { open: fullscreenLocks > 0, locks: fullscreenLocks },
    }),
  );
}

export function setStoryFullscreen(open: boolean) {
  fullscreenLocks = open ? 1 : 0;
  emitStoryFullscreen();
}

/** lock/unlock يحمي من سباقات mount/unmount بين عدة Story viewers */
export function lockStoryFullscreen(): () => void {
  fullscreenLocks += 1;
  emitStoryFullscreen();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fullscreenLocks = Math.max(0, fullscreenLocks - 1);
    emitStoryFullscreen();
  };
}

export function openStoryViewer(userId: string, storyId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_STORY_EVENT, { detail: { userId, storyId } }));
}
