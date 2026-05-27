/** مواصفات الريلز (9:16) — مشتركة بين الواجهة والخادم */

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_ASPECT = 9 / 16;

/** منطقة المحتوى الآمن (لا تُغطى بأزرار التفاعل) */
export const REEL_SAFE_CONTENT_HEIGHT = 1350;

export const REEL_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const REEL_MAX_UPLOAD_MB = 500;

export const REEL_VIDEO_BITRATE = "10M";
export const REEL_VIDEO_MAXRATE = "12M";
export const REEL_VIDEO_BUFSIZE = "20M";
export const REEL_MIN_FPS = 30;
export const REEL_MAX_FPS = 60;

export const REEL_ACCEPT_VIDEO = "video/mp4,video/quicktime,video/webm,video/*";

export function formatReelMaxSizeError(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(0);
  return `الملف ${mb} ميجا — الحد الأقصى ${REEL_MAX_UPLOAD_MB} ميجا للريلز.`;
}

/** نسبة ارتفاع منطقة المحتوى الآمن من الإطار الكامل */
export const REEL_SAFE_CONTENT_RATIO = REEL_SAFE_CONTENT_HEIGHT / REEL_HEIGHT;
