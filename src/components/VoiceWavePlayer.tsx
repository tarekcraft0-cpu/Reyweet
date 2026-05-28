import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  VOICE_MEDIA_OFFSCREEN,
  VOICE_WAVE_BARS,
  fmtVoiceTime,
  voiceUsesVideoElement,
  voiceWaveHeightsFromSrc,
  waitVoiceMediaCanPlay,
} from "@/lib/voiceMedia";

function waveBarsFromAnalyser(analyser: AnalyserNode, barCount: number): number[] {
  const n = analyser.frequencyBinCount;
  const data = new Uint8Array(n);
  analyser.getByteFrequencyData(data);
  const heights: number[] = [];
  for (let b = 0; b < barCount; b++) {
    const t0 = (b / barCount) ** 1.05;
    const t1 = ((b + 1) / barCount) ** 1.05;
    const start = Math.floor(n * t0);
    const end = Math.ceil(n * t1);
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[Math.min(i, n - 1)];
    const avg = sum / Math.max(1, end - start) / 255;
    const boosted = Math.min(1.15, avg * 1.75 + 0.03);
    const eased = Math.pow(boosted, 0.82);
    const pct = Math.round(20 + eased * 80);
    heights.push(Math.min(100, Math.max(17, pct)));
  }
  return heights;
}

type VoiceAnalyserGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
};

function useVoicePlaybackSrc(src: string): string {
  const [playbackSrc, setPlaybackSrc] = useState(src);
  useEffect(() => {
    if (!src.startsWith("data:")) {
      setPlaybackSrc(src);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await (await fetch(src)).blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setPlaybackSrc(revoked);
      } catch {
        if (!cancelled) setPlaybackSrc(src);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [src]);
  return playbackSrc;
}

/** مشغّل صوت بموجات — للتغريدات والمحادثات */
export function VoiceWavePlayer({
  src,
  className = "",
  durationSec,
}: {
  src: string;
  className?: string;
  durationSec?: number;
}) {
  const playbackSrc = useVoicePlaybackSrc(src);
  const useVideoEl = voiceUsesVideoElement(playbackSrc);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyserGraphRef = useRef<VoiceAnalyserGraph | null>(null);
  const ensureAnalyserRef = useRef<(() => Promise<void>) | null>(null);
  const waveRafRef = useRef(0);
  const waveSmoothRef = useRef<number[]>(Array.from({ length: VOICE_WAVE_BARS }, () => 40));
  const waveFrameRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(durationSec || 0);
  const [levelsLive, setLevelsLive] = useState<number[] | null>(null);

  const idleHeights = useMemo(() => voiceWaveHeightsFromSrc(src), [src]);
  const idleRef = useRef(idleHeights);
  idleRef.current = idleHeights;

  useEffect(() => {
    waveSmoothRef.current = idleRef.current.slice();
    setLevelsLive(null);
    setPlaying(false);
    setCur(0);
    setDur(durationSec || 0);
    if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
    waveRafRef.current = 0;
    void analyserGraphRef.current?.ctx.close().catch(() => {});
    analyserGraphRef.current = null;
    ensureAnalyserRef.current = null;

    const el = (useVideoEl ? videoRef.current : audioRef.current) as HTMLMediaElement | null;
    if (!el) return undefined;
    try {
      el.load();
    } catch {
      /* ignore */
    }
    const onT = () => setCur(el.currentTime);
    const onMeta = () => {
      const d = el.duration;
      setDur(d && isFinite(d) && d > 0 ? d : durationSec || 0);
    };
    const onPlay = () => setPlaying(true);
    const stopWaveRaf = () => {
      if (waveRafRef.current) cancelAnimationFrame(waveRafRef.current);
      waveRafRef.current = 0;
    };
    const onWaveStop = () => {
      stopWaveRaf();
      setLevelsLive(null);
    };
    const onPause = () => {
      setPlaying(false);
      onWaveStop();
    };
    const onEnded = () => {
      setPlaying(false);
      setCur(0);
      onWaveStop();
    };

    const attachAnalyser = async () => {
      if (analyserGraphRef.current) return;
      const AW =
        typeof window !== "undefined" &&
        (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AW) return;
      try {
        const ctx = new AW();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.72;
        const source = ctx.createMediaElementSource(el);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserGraphRef.current = { ctx, analyser };
        await ctx.resume();
      } catch {
        analyserGraphRef.current = null;
      }
    };
    ensureAnalyserRef.current = attachAnalyser;

    const waveLoop = () => {
      if (el.paused) return;
      const graph = analyserGraphRef.current;
      if (!graph) return;
      const raw = waveBarsFromAnalyser(graph.analyser, VOICE_WAVE_BARS);
      const sm = waveSmoothRef.current;
      for (let i = 0; i < VOICE_WAVE_BARS; i++) {
        sm[i] = sm[i] * 0.56 + raw[i] * 0.44;
      }
      waveFrameRef.current += 1;
      if ((waveFrameRef.current & 3) === 0) setLevelsLive([...sm]);
      waveRafRef.current = requestAnimationFrame(waveLoop);
    };

    const onPlaying = () => {
      setLoading(false);
      void ensureAnalyserRef.current?.();
      void analyserGraphRef.current?.ctx.resume().catch(() => {});
      waveSmoothRef.current = idleRef.current.slice();
      waveFrameRef.current = 0;
      stopWaveRaf();
      if (analyserGraphRef.current) waveRafRef.current = requestAnimationFrame(waveLoop);
    };

    el.addEventListener("timeupdate", onT);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("timeupdate", onT);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      stopWaveRaf();
      setLevelsLive(null);
      void analyserGraphRef.current?.ctx.close().catch(() => {});
      analyserGraphRef.current = null;
      ensureAnalyserRef.current = null;
    };
  }, [playbackSrc, useVideoEl, durationSec]);

  const toggle = async () => {
    const el = (useVideoEl ? videoRef.current : audioRef.current) as HTMLMediaElement | null;
    if (!el) return;
    try {
      if (!el.paused) {
        el.pause();
        setLoading(false);
        return;
      }
      setLoading(true);
      await waitVoiceMediaCanPlay(el);
      await el.play();
    } catch {
      try {
        await waitVoiceMediaCanPlay(el);
        await el.play();
      } catch {
        setLoading(false);
      }
    }
  };

  const total = dur || durationSec || 0;
  const filledBars = total > 0 ? Math.min(VOICE_WAVE_BARS, Math.ceil((cur / total) * VOICE_WAVE_BARS)) : 0;
  const remaining = Math.max(0, total - cur);
  const displayHeights = levelsLive ?? idleHeights;

  return (
    <div className={"flex w-full flex-col " + className}>
      {useVideoEl ? (
        <video
          ref={videoRef}
          src={playbackSrc}
          preload="auto"
          className={VOICE_MEDIA_OFFSCREEN}
          playsInline
          controls={false}
        />
      ) : (
        <audio ref={audioRef} src={playbackSrc} preload="auto" className={VOICE_MEDIA_OFFSCREEN} />
      )}
      <div
        className="flex w-full min-w-0 items-center gap-3 rounded-2xl bg-muted/60 px-2.5 py-2 dark:bg-muted/40"
        dir="ltr"
      >
        <button
          type="button"
          onClick={toggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition active:scale-[0.97] dark:bg-white dark:text-zinc-950"
          aria-label={playing ? "إيقاف" : loading ? "تحميل" : "تشغيل"}
          disabled={loading && !playing}
        >
          {loading && !playing ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : playing ? (
            <Pause size={18} className="fill-current" />
          ) : (
            <Play size={18} className="ms-0.5 fill-current" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex h-9 min-w-0 flex-1 items-end justify-stretch gap-[2px] px-0.5">
            {displayHeights.map((hPct, i) => {
              const active = i < filledBars;
              return (
                <span
                  key={i}
                  className={
                    "min-h-[4px] min-w-[2px] max-w-[4px] flex-1 origin-bottom rounded-full transition-colors duration-100 " +
                    (active ? "bg-zinc-800 dark:bg-white" : "bg-zinc-400/42 dark:bg-white/24") +
                    (playing && active ? " motion-safe:opacity-95" : "")
                  }
                  style={{ height: `${hPct}%` }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-end px-0.5">
            <span className="text-[12px] font-semibold tabular-nums tracking-tight text-zinc-600 dark:text-zinc-300">
              {total > 0 ? fmtVoiceTime(remaining) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
