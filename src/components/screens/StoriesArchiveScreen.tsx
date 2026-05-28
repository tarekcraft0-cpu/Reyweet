import { useMemo, useState } from "react";
import { Clock, Play } from "lucide-react";
import { archivedStoriesForUser, useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { normalizeStoryMedia, storyArchiveThumbnailUrl } from "@/lib/storyMedia";
import { StoriesArchiveViewer } from "../stories/StoriesArchiveViewer";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { ArrowRight } from "lucide-react";

function ArchiveHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-30 flex flex-row items-center gap-3 border-b border-border bg-background px-2 py-3 pt-[max(0.5rem,var(--sat))]"
    >
      <SlideDismissBackButton
        navScope="local"
        onDismiss={onBack}
        className="relative z-40 shrink-0 rounded-full p-2 text-foreground active:bg-accent"
        aria-label="رجوع"
      >
        <ArrowRight size={24} strokeWidth={1.75} />
      </SlideDismissBackButton>
      <h1 className="min-w-0 flex-1 truncate px-2 text-center text-[17px] font-semibold text-foreground">{title}</h1>
      <span className="w-10 shrink-0" aria-hidden />
    </div>
  );
}

export function StoriesArchiveScreen({ onBack }: { onBack: () => void }) {
  const { state, currentUser } = useApp();
  const t = useT();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const stories = useMemo(() => {
    if (!currentUser) return [];
    return archivedStoriesForUser(state, currentUser.id);
  }, [state.storyArchive, state.stories, currentUser?.id]);

  const lang = state.language;

  return (
    <div className="settings-screen-root min-h-full w-full overflow-x-hidden bg-background pb-10" dir="rtl">
      <ArchiveHeader title={t("storiesArchive")} onBack={onBack} />
      <p className="px-4 pt-3 text-center text-sm leading-relaxed text-muted-foreground">{t("archiveHint")}</p>

      {stories.length === 0 ? (
        <div className="px-6 pt-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary">
            <Clock size={28} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">{t("archiveEmpty")}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("archiveEmptyDetail")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 p-0.5 pt-4 sm:grid-cols-4">
          {stories.map((st, i) => {
            const thumb = storyArchiveThumbnailUrl(st);
            const media = normalizeStoryMedia(st);
            const isVideo = media.hasVideo;
            return (
              <button
                key={st.id}
                type="button"
                className="relative aspect-[9/16] overflow-hidden bg-zinc-900 active:opacity-90"
                onClick={() => setViewerIndex(i)}
                aria-label={formatRelativeTime(st.createdAt, lang)}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-3xl">
                    {media.emojiFallback || "📷"}
                  </div>
                )}
                {isVideo && (
                  <span className="absolute bottom-1.5 start-1.5 flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    <Play size={10} fill="currentColor" />
                  </span>
                )}
                <span className="absolute top-1 end-1 rounded bg-black/50 px-1 py-0.5 text-[9px] text-white/90">
                  {formatRelativeTime(st.createdAt, lang)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewerIndex != null && stories.length > 0 && (
        <StoriesArchiveViewer
          stories={stories}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
