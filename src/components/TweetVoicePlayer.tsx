import { isVoicePlaybackVideoSrc } from "@/lib/voiceMedia";
import { resolveMediaUrl } from "@/lib/mediaUrl";

/** مشغّل تغريدة صوتية — يدعم mp3/m4a وفيديو قصير كصوت (مثل المحادثات) */
export function TweetVoicePlayer({ src, className = "" }: { src: string; className?: string }) {
  const url = resolveMediaUrl(src);
  const useVideo = isVoicePlaybackVideoSrc(url);

  return (
    <div className={className}>
      {useVideo ? (
        <video src={url} controls playsInline preload="metadata" className="w-full max-h-40 rounded-xl" />
      ) : (
        <audio src={url} controls preload="metadata" className="w-full" />
      )}
    </div>
  );
}
