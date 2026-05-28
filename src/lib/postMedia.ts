import type { Post } from "./types";
import { isRenderableMediaUrl, resolveMediaUrl } from "./mediaUrl";
import { isVoicePlaybackVideoSrc } from "./voiceMedia";

const POST_PLACEHOLDER_MEDIA = new Set(["🖼️", "📝", "🎬"]);

/** نوع العرض الفعلي (يصحّح منشورات نصية قديمة مُوسومة كـ post) */
export function resolvePostDisplayType(
  post: Pick<Post, "type" | "image" | "video" | "audio" | "text">,
): Post["type"] {
  if (post.type === "tweet" || post.type === "reel") return post.type;

  const text = post.text?.trim() ?? "";
  const img = post.image?.trim() ?? "";
  const vid = post.video?.trim() ?? "";
  const aud = post.audio?.trim() ?? "";

  if (post.type === "post" && text && !vid && !aud) {
    if (!img) return "tweet";
    if (POST_PLACEHOLDER_MEDIA.has(img)) return "post";
    const media = normalizePostMedia(post);
    if (!media.hasImage && !media.hasVideo) return "tweet";
  }

  return post.type ?? "post";
}

export function isDisplayTweet(post: Pick<Post, "type" | "image" | "video" | "audio" | "text">): boolean {
  return resolvePostDisplayType(post) === "tweet";
}

const CREATE_PLACEHOLDER_MEDIA = new Set(["🎬", "🖼️", "📝"]);

/** مرفق حقيقي عند الإنشاء (ليس إيموجي placeholder) */
export function hasCreateAttachmentMedia(media: string, hasFile?: boolean): boolean {
  if (hasFile) return true;
  const m = media.trim();
  if (!m || CREATE_PLACEHOLDER_MEDIA.has(m)) return false;
  if (m.startsWith("data:video/") || m.startsWith("data:image/") || m.startsWith("data:audio/")) {
    return true;
  }
  if (m.startsWith("blob:")) return true;
  if (isVideoMediaRef(m)) return true;
  return isRenderableMediaUrl(m);
}

/** منشور يظهر في تبويب الريلز — مقاطع فيديو فقط (لا تغريدات نصية ولا صور بدون فيديو) */
export function isReelFeedPost(post: Pick<Post, "type" | "image" | "video" | "audio" | "text">): boolean {
  if (post.type === "tweet") return false;
  return normalizePostMedia(post).hasVideo;
}

/** تغريدة بدون صورة/فيديو حقيقي: نص + تفاعلات فقط.
 *  إذا رفق المستخدم صورة أو فيديو تُعرض حتى لو النوع "tweet". */
export function postShowsFeedMedia(post: Pick<Post, "type" | "image" | "video" | "audio" | "text">): boolean {
  if (!isDisplayTweet(post)) return true;
  // تغريدة لكن فيها مرفق حقيقي → أظهره
  const media = normalizePostMedia(post);
  return media.hasImage || media.hasVideo || media.hasAudio;
}

export function isVideoMediaRef(s?: string | null): boolean {
  if (!s?.trim()) return false;
  const t = s.trim();
  if (t.startsWith("data:video/")) return true;
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(t)) return true;
  return t.includes("/media/videos/");
}

/** يفصل صورة الغلاف عن رابط الفيديو (منشورات قديمة تخزّن الفيديو في image) */
export function normalizePostMedia(post: Pick<Post, "image" | "video" | "audio" | "type">) {
  let imageRaw = post.image?.trim() || "";
  let videoRaw = post.video?.trim() || "";
  let audioRaw = post.audio?.trim() || "";

  if (imageRaw && isVideoMediaRef(imageRaw) && !videoRaw) {
    videoRaw = imageRaw;
    imageRaw = "";
  }

  const imageUrl =
    imageRaw && !isVideoMediaRef(imageRaw) ? resolveMediaUrl(imageRaw) : "";
  const videoUrl = videoRaw ? resolveMediaUrl(videoRaw) : "";
  const audioUrl = audioRaw ? resolveMediaUrl(audioRaw) : "";
  const posterUrl =
    imageUrl && isRenderableMediaUrl(imageUrl) ? imageUrl : "";

  const normalized = {
    imageUrl,
    videoUrl,
    posterUrl,
    hasImage: !!imageUrl && isRenderableMediaUrl(imageUrl) && !isVideoMediaRef(imageRaw),
    hasVideo: !!videoRaw && isVideoMediaRef(videoRaw) && !!videoUrl,
    hasAudio:
      !!audioRaw &&
      (isRenderableMediaUrl(audioUrl) || isVoicePlaybackVideoSrc(audioRaw)),
    audioUrl,
    emojiFallback:
      (!imageUrl && !videoUrl && imageRaw && !isRenderableMediaUrl(imageRaw)
        ? imageRaw
        : "") ||
      (!imageUrl && !videoUrl && videoRaw && !isRenderableMediaUrl(videoRaw)
        ? videoRaw
        : "") ||
      (post.type === "reel" && !videoUrl ? "🎬" : "") ||
      (post.type === "tweet" ? "" : "📝"),
  };
  return normalized;
}

export type NormalizedPostMedia = ReturnType<typeof normalizePostMedia>;
