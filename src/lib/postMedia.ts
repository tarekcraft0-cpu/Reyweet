import type { Post } from "./types";
import { isRenderableMediaUrl, resolveMediaUrl, toStoredMediaRef } from "./mediaUrl";
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

const HIDDEN_REEL_USER_IDS = new Set(["u_omar", "u_lina", "u_sara"]);

const BLOCKED_REEL_VIDEO_URL_RE =
  /commondatastorage\.googleapis\.com\/gtv-videos-bucket\/sample/i;

/** ريلز وهمية/عينات Google — لا تُعرض في الفيد */
export function shouldHideReelPost(
  post: Pick<Post, "userId" | "type" | "image" | "video">,
): boolean {
  if (HIDDEN_REEL_USER_IDS.has(post.userId)) return true;
  const v = `${post.video || ""} ${post.image || ""}`;
  return BLOCKED_REEL_VIDEO_URL_RE.test(v);
}

/** منشور يظهر في تبويب الريلز — مقاطع فيديو فقط (لا تغريدات نصية ولا صور بدون فيديو) */
export function isReelFeedPost(
  post: Pick<Post, "userId" | "type" | "image" | "video" | "audio" | "text">,
): boolean {
  if (shouldHideReelPost(post)) return false;
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
  return t.includes("/media/videos/") || t.includes("/uploads/reels/");
}

function resolvePostImageDisplayUrl(imageRaw: string): string {
  if (!imageRaw || isVideoMediaRef(imageRaw)) return "";
  const direct = resolveMediaUrl(imageRaw);
  if (direct && isRenderableMediaUrl(direct)) return direct;
  const stored = toStoredMediaRef(imageRaw);
  if (stored && stored !== imageRaw) {
    const viaStored = resolveMediaUrl(stored);
    if (viaStored && isRenderableMediaUrl(viaStored)) return viaStored;
  }
  const slashPath = imageRaw.startsWith("/") ? imageRaw : `/${imageRaw}`;
  if (isRenderableMediaUrl(slashPath)) {
    const viaPath = resolveMediaUrl(slashPath);
    if (viaPath && isRenderableMediaUrl(viaPath)) return viaPath;
  }
  return "";
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

  const imageUrl = resolvePostImageDisplayUrl(imageRaw);
  const videoUrl = videoRaw ? resolveMediaUrl(videoRaw) : "";
  const posterUrl =
    imageUrl && isRenderableMediaUrl(imageUrl) ? imageUrl : "";

  const voiceTweet =
    !!audioRaw || (post.type === "tweet" && isVoicePlaybackVideoSrc(videoRaw) && !imageRaw);
  const voiceSrc =
    audioRaw || (voiceTweet && isVoicePlaybackVideoSrc(videoRaw) ? videoRaw : "");

  const normalized = {
    imageUrl,
    videoUrl,
    posterUrl,
    hasImage:
      !!imageUrl &&
      isRenderableMediaUrl(imageUrl) &&
      !isVideoMediaRef(imageRaw),
    hasVideo:
      !voiceTweet && !!videoRaw && isVideoMediaRef(videoRaw) && !!videoUrl,
    hasAudio:
      !!voiceSrc &&
      (isRenderableMediaUrl(resolveMediaUrl(voiceSrc)) || isVoicePlaybackVideoSrc(voiceSrc)),
    audioUrl: voiceSrc,
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
