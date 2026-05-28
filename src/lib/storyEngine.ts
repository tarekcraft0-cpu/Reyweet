/** مدة عرض الستوري — مطابقة Instagram */
export const STORY_IMAGE_DURATION_MS = 5000;
export const STORY_VIDEO_MAX_MS = 60_000;
export const STORY_VIDEO_MIN_MS = 1000;

export type StoryPlaybackState = "idle" | "playing" | "paused" | "loading" | "buffering";

export function storyDurationMs(opts: {
  hasVideo: boolean;
  videoDurationSec?: number;
}): number {
  if (opts.hasVideo && opts.videoDurationSec && Number.isFinite(opts.videoDurationSec)) {
    const ms = Math.ceil(opts.videoDurationSec * 1000);
    return Math.max(STORY_VIDEO_MIN_MS, Math.min(STORY_VIDEO_MAX_MS, ms));
  }
  return STORY_IMAGE_DURATION_MS;
}
