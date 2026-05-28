import { useCallback, useEffect, useRef, useState } from "react";
import {
  STORY_IMAGE_DURATION_MS,
  storyDurationMs,
  type StoryPlaybackState,
} from "@/lib/storyEngine";

type Options = {
  storyId: string;
  hasVideo: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  paused: boolean;
  enabled: boolean;
  videoDurationSec: number | null;
  onSegmentComplete: () => void;
};

/**
 * محرك تقدّم الستوري — مصدر واحد (RAF للصور، timeupdate للفيديو).
 */
export function useStoryPlayback({
  storyId,
  hasVideo,
  videoRef,
  paused,
  enabled,
  videoDurationSec,
  onSegmentComplete,
}: Options) {
  const [progress, setProgress] = useState(0);
  const [playbackState, setPlaybackState] = useState<StoryPlaybackState>("idle");
  const durationMsRef = useRef(STORY_IMAGE_DURATION_MS);
  const elapsedMsRef = useRef(0);
  const progressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onSegmentComplete);
  onCompleteRef.current = onSegmentComplete;

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const refreshDuration = useCallback(() => {
    durationMsRef.current = storyDurationMs({
      hasVideo,
      videoDurationSec: videoDurationSec ?? undefined,
    });
  }, [hasVideo, videoDurationSec]);

  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    progressRef.current = 1;
    setProgress(1);
    setPlaybackState("idle");
    onCompleteRef.current();
  }, []);

  const resetSegment = useCallback(() => {
    completedRef.current = false;
    elapsedMsRef.current = 0;
    progressRef.current = 0;
    setProgress(0);
    refreshDuration();
    setPlaybackState(hasVideo ? "loading" : "playing");
  }, [hasVideo, refreshDuration]);

  useEffect(() => {
    resetSegment();
  }, [storyId, resetSegment]);

  useEffect(() => {
    refreshDuration();
  }, [refreshDuration]);

  const setVideoDurationFromMetadata = useCallback((sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return;
    durationMsRef.current = storyDurationMs({ hasVideo: true, videoDurationSec: sec });
    elapsedMsRef.current = 0;
    progressRef.current = 0;
    completedRef.current = false;
    setProgress(0);
    setPlaybackState(paused ? "paused" : "playing");
  }, [paused]);

  /** فيديو — التقدّم من currentTime */
  useEffect(() => {
    if (!enabled || !hasVideo) return;
    const v = videoRef.current;
    if (!v) return;

    const onWaiting = () => setPlaybackState("buffering");
    const onPlaying = () => setPlaybackState(paused ? "paused" : "playing");
    const onLoadedMeta = () => {
      refreshDuration();
      setPlaybackState(paused ? "paused" : "playing");
    };
    const onTimeUpdate = () => {
      if (paused) return;
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const p = Math.min(1, Math.max(0, v.currentTime / d));
      progressRef.current = p;
      setProgress(p);
      setPlaybackState("playing");
      if (p >= 0.995) fireComplete();
    };
    const onEnded = () => fireComplete();

    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
    };
  }, [storyId, enabled, hasVideo, paused, videoRef, fireComplete, refreshDuration]);

  /** إيقاف/تشغيل الفيديو */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo || !enabled) return;
    if (paused) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
      setPlaybackState(s => (s === "buffering" ? "buffering" : "paused"));
    } else {
      const p = v.play();
      if (p) p.catch(() => undefined);
      if (v.readyState >= 2) setPlaybackState("playing");
    }
  }, [paused, hasVideo, enabled, videoRef, storyId]);

  /** صورة — RAF */
  useEffect(() => {
    if (!enabled || hasVideo) {
      cancelRaf();
      return;
    }

    if (paused) {
      elapsedMsRef.current = progressRef.current * durationMsRef.current;
      cancelRaf();
      setPlaybackState("paused");
      return;
    }

    setPlaybackState("playing");
    const startAt = performance.now() - elapsedMsRef.current;

    const tick = (now: number) => {
      const dur = durationMsRef.current;
      const elapsed = now - startAt;
      const p = dur > 0 ? Math.min(1, elapsed / dur) : 0;
      progressRef.current = p;
      setProgress(p);
      if (p >= 1) {
        cancelRaf();
        fireComplete();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return cancelRaf;
  }, [storyId, enabled, hasVideo, paused, cancelRaf, fireComplete]);

  return {
    progress,
    playbackState,
    resetSegment,
    setVideoDurationFromMetadata,
  };
}
