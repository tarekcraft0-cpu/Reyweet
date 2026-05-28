import { VoiceWavePlayer } from "./VoiceWavePlayer";
import { resolveMediaUrl } from "@/lib/mediaUrl";

/** مشغّل تغريدة صوتية — موجات صوتية وليس مشغّل فيديو */
export function TweetVoicePlayer({ src, className = "" }: { src: string; className?: string }) {
  return <VoiceWavePlayer src={resolveMediaUrl(src)} className={className} />;
}
