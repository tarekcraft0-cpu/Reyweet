/** إشعار التطبيق بفتح/إغلاق الكاميرا — إخفاء الشريط السفلي والتنقل */
export function notifyCameraOpen() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("retweet-camera-open");
  window.dispatchEvent(new CustomEvent("retweet-camera-open"));
}

export function notifyCameraClose() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("retweet-camera-open");
  window.dispatchEvent(new CustomEvent("retweet-camera-close"));
}

/** معرض اختيار الستوري — إخفاء الشريط السفلي فقط (ليس وضع الكاميرا) */
export function notifyStoryPickerOpen() {
  if (typeof document === "undefined") return;
  window.dispatchEvent(new CustomEvent("retweet-story-picker-open"));
}

export function notifyStoryPickerClose() {
  if (typeof document === "undefined") return;
  window.dispatchEvent(new CustomEvent("retweet-story-picker-close"));
}

/** إعادة ضبط الشريط السفلي إن علِق بعد إغلاق غير نظيف */
export function resetMediaChromeOverlays() {
  notifyCameraClose();
  notifyStoryPickerClose();
}

export const STORY_GALLERY_OPEN_EVENT = "retweet-open-story-gallery";

export function requestOpenStoryGallery() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORY_GALLERY_OPEN_EVENT));
}
