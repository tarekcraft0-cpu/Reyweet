import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Repeat2, Trash2, X } from "lucide-react";
import type { StoryItem } from "@/lib/types";
import { useApp } from "@/lib/store";
import { normalizeStoryMedia } from "@/lib/storyMedia";
import { StoryStickerLayer } from "../story/StoryStickerLayer";
import { ShareSheet } from "../ShareSheet";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { setStoryFullscreen } from "@/lib/storyChrome";

const SEGMENT_MS = 8000;

export function StoriesArchiveViewer({
  stories,
  initialIndex,
  onClose,
}: {
  stories: StoryItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { state, currentUser, deleteStory, addHighlight } = useApp();
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1)));
  const [shareOpen, setShareOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const lang = state.language;

  const safeIndex = stories.length > 0 ? Math.min(Math.max(0, index), stories.length - 1) : 0;
  const cur = stories[safeIndex];

  useEffect(() => {
    setStoryFullscreen(true);
    document.documentElement.classList.add("retweet-story-open");
    return () => {
      setStoryFullscreen(false);
      document.documentElement.classList.remove("retweet-story-open");
    };
  }, []);

  useEffect(() => {
    if (stories.length === 0) onClose();
    else if (index >= stories.length) setIndex(Math.max(0, stories.length - 1));
  }, [stories.length, index, onClose]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goForward = useCallback(() => {
    if (stories.length === 0) return;
    if (safeIndex >= stories.length - 1) {
      onClose();
      return;
    }
    setIndex((i) => Math.min(stories.length - 1, i + 1));
  }, [safeIndex, stories.length, onClose]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    clearTimer();
    if (!cur || highlightOpen || shareOpen) return;
    const media = normalizeStoryMedia(cur);
    const ms = media.hasVideo ? Math.max(SEGMENT_MS, 12000) : SEGMENT_MS;
    timerRef.current = window.setTimeout(goForward, ms);
    return clearTimer;
  }, [cur?.id, highlightOpen, shareOpen, goForward, clearTimer]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cur) return;
    const media = normalizeStoryMedia(cur);
    if (!media.hasVideo) return;
    v.muted = false;
    v.volume = 1;
    void v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [cur?.id]);

  if (!cur) return null;

  const media = normalizeStoryMedia(cur);

  const handleDelete = () => {
    if (!window.confirm("حذف هذه القصة من الأرشيف؟")) return;
    clearTimer();
    const remaining = stories.length - 1;
    deleteStory(cur.id);
    if (remaining <= 0) {
      onClose();
      return;
    }
    if (safeIndex >= remaining) setIndex((i) => Math.max(0, i - 1));
  };

  const saveHighlight = () => {
    const title = highlightTitle.trim();
    if (!title) return;
    const cover = media.hasVideo ? "🎬" : media.hasImage ? "📸" : cur.image || "⭐";
    const coverImage = media.hasImage ? media.imageUrl : undefined;
    addHighlight({ title, cover, coverImage, storyIds: [cur.id] });
    setHighlightOpen(false);
    setHighlightTitle("");
  };

  return (
    <div className="fixed inset-0 z-[240] flex flex-col bg-black touch-none" dir="rtl">
      <div className="absolute inset-x-0 top-0 z-50 flex gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        {stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full bg-white transition-all duration-150"
              style={{ width: i < safeIndex ? "100%" : i === safeIndex ? "55%" : "0%" }}
            />
          </div>
        ))}
      </div>

      <div className="relative z-40 flex shrink-0 items-center justify-between px-3 pt-10 pb-2">
        <button
          type="button"
          className="rounded-full p-2 text-white hover:bg-white/10"
          onClick={onClose}
          aria-label="إغلاق"
        >
          <X size={24} />
        </button>
        <span className="text-xs font-medium text-white/70">{formatRelativeTime(cur.createdAt, lang)}</span>
        <span className="w-10" aria-hidden />
      </div>

      <div className="relative min-h-0 flex-1">
        {media.hasVideo ? (
          <video
            ref={videoRef}
            key={cur.id}
            src={media.videoUrl}
            className="absolute inset-0 h-full w-full object-contain bg-black"
            playsInline
            controls={false}
          />
        ) : media.hasImage ? (
          <img src={media.imageUrl} alt="" className="absolute inset-0 h-full w-full object-contain bg-black" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl bg-zinc-900">{media.emojiFallback || "📷"}</div>
        )}
        {cur.stickers && cur.stickers.length > 0 && currentUser && (
          <StoryStickerLayer story={cur} storyAuthorId={currentUser.id} />
        )}

        <button
          type="button"
          className="absolute inset-y-0 start-0 z-40 w-[26%] bg-transparent"
          aria-label="القصة السابقة"
          onClick={goBack}
        />
        <button
          type="button"
          className="absolute inset-y-0 end-0 z-40 w-[28%] bg-transparent"
          aria-label="القصة التالية"
          onClick={goForward}
        />
      </div>

      <div className="z-50 flex shrink-0 items-center justify-around border-t border-white/10 bg-black/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-white/90 active:opacity-70"
          onClick={() => setShareOpen(true)}
        >
          <Repeat2 size={22} />
          <span className="text-[10px]">إعادة نشر</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-white/90 active:opacity-70"
          onClick={() => {
            setHighlightTitle("");
            setHighlightOpen(true);
          }}
        >
          <Bookmark size={22} />
          <span className="text-[10px]">هايلايت</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-red-400 active:opacity-70"
          onClick={handleDelete}
        >
          <Trash2 size={22} />
          <span className="text-[10px]">حذف</span>
        </button>
      </div>

      {shareOpen && <ShareSheet target={{ kind: "story", storyId: cur.id }} onClose={() => setShareOpen(false)} />}

      {highlightOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-background p-6" dir="rtl">
            <h3 className="mb-2 text-lg font-bold">حفظ في الهايلايت</h3>
            <p className="mb-4 text-sm text-muted-foreground">تُحفظ نسخة من القصة في ملفك بشكل دائم</p>
            <input
              type="text"
              value={highlightTitle}
              onChange={(e) => setHighlightTitle(e.target.value)}
              placeholder="اسم الهايلايت"
              className="mb-4 w-full rounded-2xl bg-input px-4 py-3 outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-secondary py-3 font-semibold"
                onClick={() => setHighlightOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl bg-primary py-3 font-semibold text-primary-foreground"
                onClick={saveHighlight}
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
