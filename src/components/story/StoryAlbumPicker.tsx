import { useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  PlayCircle,
  Search,
  Smile,
} from "lucide-react";
import type { AlbumSummary, GalleryTile, MediaTypeFilter } from "@/lib/storyGalleryStore";

const QUICK = [
  { id: "search", icon: Search, label: "بحث" },
  { id: "recents", icon: Grid2X2, label: "الأحدث" },
  { id: "favorites", icon: Heart, label: "المفضلة" },
  { id: "videos", icon: PlayCircle, label: "فيديو" },
  { id: "selfies", icon: Smile, label: "سيلفي" },
] as const;

const MEDIA_TYPES: { id: MediaTypeFilter; label: string }[] = [
  { id: "videos", label: "فيديو" },
  { id: "selfies", label: "سيلفي" },
  { id: "panoramas", label: "بانوراما" },
  { id: "bursts", label: "متتابعة" },
  { id: "timelapse", label: "تايم لابس" },
];

export function StoryAlbumPicker({
  open,
  albums,
  onClose,
  onPickAlbum,
  onQuickFilter,
  onMediaType,
  language = "ar",
}: {
  open: boolean;
  albums: AlbumSummary[];
  onClose: () => void;
  onPickAlbum: (name: string) => void;
  onQuickFilter: (id: (typeof QUICK)[number]["id"]) => void;
  onMediaType: (type: MediaTypeFilter) => void;
  language?: string;
}) {
  const ar = language === "ar";
  const title = ar ? "اختر ألبوماً" : "Select album";
  const albumsLabel = ar ? "الألبومات" : "Albums";
  const seeAll = ar ? "عرض الكل" : "See all";
  const mediaTypesLabel = ar ? "أنواع الوسائط" : "Media Types";
  const cancel = ar ? "إلغاء" : "Cancel";

  const topAlbums = useMemo(() => albums.slice(0, 6), [albums]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[650] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div
        className="mx-auto flex w-full max-w-md flex-col rounded-t-[22px] bg-black text-white"
        style={{ maxHeight: "min(92vh, 780px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="flex shrink-0 items-center justify-between px-4 pb-3">
          <button type="button" onClick={onClose} className="text-[17px] font-medium text-[#3897f0]">
            {cancel}
          </button>
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <span className="w-14" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
          <div className="mb-5 flex gap-4 overflow-x-auto no-scrollbar">
            {QUICK.map(q => (
              <button
                key={q.id}
                type="button"
                onClick={() => onQuickFilter(q.id)}
                className="flex w-[4.5rem] shrink-0 flex-col items-center gap-2"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#262626]">
                  <q.icon size={26} strokeWidth={1.75} />
                </span>
                <span className="text-[11px] text-white/90">{q.label}</span>
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-[15px] font-semibold">{albumsLabel}</span>
            <button type="button" className="text-[13px] font-semibold text-[#3897f0]">
              {seeAll}
            </button>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3">
            {topAlbums.map(a => (
              <button
                key={a.name}
                type="button"
                onClick={() => onPickAlbum(a.name)}
                className="text-start"
              >
                <div className="mb-1.5 aspect-square overflow-hidden rounded-md bg-[#262626]">
                  {a.coverUrl ? (
                    <img src={a.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon size={32} className="text-white/30" />
                    </div>
                  )}
                </div>
                <p className="truncate text-[13px] font-medium">{a.name}</p>
                <p className="text-[12px] text-white/55">
                  {a.count.toLocaleString(ar ? "ar" : "en")}
                </p>
              </button>
            ))}
          </div>

          <p className="mb-2 text-[13px] font-semibold text-white/45">{mediaTypesLabel}</p>
          <ul className="divide-y divide-white/10 rounded-xl bg-[#121212]">
            {MEDIA_TYPES.map(mt => (
              <li key={mt.id}>
                <button
                  type="button"
                  onClick={() => onMediaType(mt.id)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-[15px] active:bg-white/5"
                >
                  {mt.label}
                  <ChevronRight size={18} className="text-white/35" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}
