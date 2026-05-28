import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  ChevronDown,
  Grid2X2,
  Heart,
  Images,
  LayoutGrid,
  Music,
  PlayCircle,
  Settings,
  SquareStack,
  X,
} from "lucide-react";
import type { CameraComposeDraft } from "../chat/ChatCameraComposeModal";
import {
  filterByMediaType,
  filterGalleryTiles,
  importFilesToGallery,
  loadGalleryTiles,
  resolveGalleryDraft,
  revokeGalleryTileUrls,
  summarizeAlbums,
  type GalleryFilter,
  type GalleryTile,
  type MediaTypeFilter,
} from "@/lib/storyGalleryStore";
import { StoryAlbumPicker } from "./StoryAlbumPicker";

type RecentsMenuId = "all" | "videos" | "favorites" | "albums";

const FILTER_LABELS: Record<GalleryFilter, { ar: string; en: string }> = {
  all: { ar: "الأحدث", en: "Recents" },
  videos: { ar: "فيديو", en: "Videos" },
  favorites: { ar: "المفضلة", en: "Favorites" },
};

export function StoryGalleryPicker({
  open,
  onClose,
  onOpenCamera,
  onPickDraft,
  language = "ar",
}: {
  open: boolean;
  onClose: () => void;
  onOpenCamera: () => void;
  onPickDraft: (draft: CameraComposeDraft) => void;
  language?: string;
}) {
  const ar = language === "ar";
  const importRef = useRef<HTMLInputElement>(null);
  const [tiles, setTiles] = useState<GalleryTile[]>([]);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const local = await loadGalleryTiles();
      setTiles(prev => {
        revokeGalleryTileUrls(prev.filter(p => !p.remoteUrl));
        return local;
      });
    } catch {
      /* IndexedDB غير متاح */
      setTiles(prev => {
        revokeGalleryTileUrls(prev.filter(p => !p.remoteUrl));
        return [];
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const local = await loadGalleryTiles();
        if (cancelled) return;
        setTiles(prev => {
          revokeGalleryTileUrls(prev.filter(p => !p.remoteUrl));
          return local;
        });
      } catch {
        if (!cancelled) {
          setTiles(prev => {
            revokeGalleryTileUrls(prev.filter(p => !p.remoteUrl));
            return [];
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return () => revokeGalleryTileUrls(tiles.filter(t => !t.remoteUrl));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = filterGalleryTiles(tiles, filter);
    if (albumFilter) list = list.filter(t => t.album === albumFilter);
    if (mediaTypeFilter) list = filterByMediaType(list, mediaTypeFilter);
    return list;
  }, [tiles, filter, albumFilter, mediaTypeFilter]);

  const albums = useMemo(() => summarizeAlbums(tiles), [tiles]);

  const filterLabel = useMemo(() => {
    if (albumFilter) return albumFilter;
    if (mediaTypeFilter) {
      const map: Record<MediaTypeFilter, string> = {
        videos: ar ? "فيديو" : "Videos",
        selfies: ar ? "سيلفي" : "Selfies",
        panoramas: ar ? "بانوراما" : "Panoramas",
        bursts: ar ? "متتابعة" : "Bursts",
        timelapse: ar ? "تايم لابس" : "Time-lapse",
      };
      return map[mediaTypeFilter];
    }
    return ar ? FILTER_LABELS[filter].ar : FILTER_LABELS[filter].en;
  }, [albumFilter, mediaTypeFilter, filter, ar]);

  const pickItem = async (item: GalleryTile) => {
    const draft = await resolveGalleryDraft(item);
    if (!draft) return;
    onPickDraft(draft);
    onClose();
  };

  const onImport = async (files: FileList | null) => {
    if (!files?.length) return;
    await importFilesToGallery([...files]);
    await refresh();
  };

  const applyMenu = (id: RecentsMenuId) => {
    setMenuOpen(false);
    setAlbumFilter(null);
    setMediaTypeFilter(null);
    if (id === "albums") {
      setAlbumPickerOpen(true);
      return;
    }
    setFilter(id);
  };

  const closePicker = () => {
    setMenuOpen(false);
    setAlbumPickerOpen(false);
    onClose();
  };

  if (!open || typeof document === "undefined") return null;

  const title = ar ? "إضافة إلى الستوري" : "Add to story";

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[600] flex flex-col bg-black text-white touch-manipulation"
        style={{
          height: "100dvh",
          maxHeight: "100dvh",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between px-4 pb-2"
          style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}
        >
          <button type="button" onClick={closePicker} aria-label={ar ? "إغلاق" : "Close"} className="p-1">
            <X size={28} strokeWidth={2.5} />
          </button>
          <h1 className="text-[17px] font-bold">{title}</h1>
          <button
            type="button"
            aria-label={ar ? "الإعدادات" : "Settings"}
            className="p-1 text-white/90"
            onClick={() => importRef.current?.click()}
          >
            <Settings size={24} strokeWidth={2} />
          </button>
        </header>

        <div className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-3 no-scrollbar">
          {[
            { icon: Images, label: ar ? "أضف قصتك" : "Add Yours" },
            { icon: Music, label: ar ? "موسيقى" : "Music" },
            { icon: LayoutGrid, label: ar ? "كولاج" : "Collage" },
          ].map((card, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (i === 0 ? importRef.current?.click() : undefined)}
              className="flex min-w-[7.5rem] flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-[#262626] py-4"
            >
              <card.icon size={28} strokeWidth={1.75} className="text-white/95" />
              <span className="text-[12px] font-medium">{card.label}</span>
            </button>
          ))}
        </div>

        <div className="relative z-20 flex shrink-0 items-center justify-between px-4 pb-2">
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-0.5 text-[16px] font-semibold"
          >
            {filterLabel}
            <ChevronDown size={18} className={menuOpen ? "rotate-180 transition" : "transition"} />
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[15px] font-semibold"
            onClick={() => importRef.current?.click()}
          >
            <SquareStack size={18} strokeWidth={2} />
            {ar ? "اختيار" : "Select"}
          </button>
        </div>

        {menuOpen && (
          <>
            <button type="button" className="fixed inset-0 z-[221] bg-black/20" onClick={() => setMenuOpen(false)} />
            <div className="absolute start-4 top-[calc(env(safe-area-inset-top,0px)+7.5rem)] z-[222] min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-[#262626]/95 shadow-2xl backdrop-blur-xl">
              {(
                [
                  { id: "all" as const, icon: Grid2X2, label: ar ? "الأحدث" : "Recents" },
                  { id: "videos" as const, icon: PlayCircle, label: ar ? "فيديو" : "Videos" },
                  { id: "favorites" as const, icon: Heart, label: ar ? "المفضلة" : "Favorites" },
                  { id: "albums" as const, icon: LayoutGrid, label: ar ? "كل الألبومات" : "All albums" },
                ] as const
              ).map(row => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => applyMenu(row.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-[15px] active:bg-white/10"
                >
                  <row.icon size={22} strokeWidth={1.75} />
                  {row.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-3 gap-[2px]">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCamera();
              }}
              className="relative aspect-[3/4] bg-[#1c1c1c] active:opacity-80"
            >
              <Camera size={36} strokeWidth={1.75} className="absolute inset-0 m-auto text-white" />
            </button>
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => void pickItem(item)}
                className="relative aspect-[3/4] bg-[#1c1c1c] active:opacity-80"
              >
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                {item.kind === "video" && (
                  <span className="absolute end-1.5 top-1.5 rounded bg-black/55 px-1 text-[10px] font-semibold">
                    ▶
                  </span>
                )}
                {item.favorite && (
                  <Heart size={14} className="absolute bottom-1.5 start-1.5 fill-white text-white" />
                )}
              </button>
            ))}
          </div>
          {!loading && filtered.length === 0 && (
            <p className="py-16 text-center text-sm text-white/50">
              {ar ? "لا توجد وسائط — اضغط الإعدادات لاستيراد الاستوديو" : "No media — tap settings to import"}
            </p>
          )}
        </div>

        <input
          ref={importRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={e => {
            void onImport(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <StoryAlbumPicker
        open={albumPickerOpen}
        albums={albums}
        language={language}
        onClose={() => setAlbumPickerOpen(false)}
        onPickAlbum={name => {
          setAlbumPickerOpen(false);
          setFilter("all");
          setMediaTypeFilter(null);
          setAlbumFilter(name);
        }}
        onQuickFilter={id => {
          setAlbumPickerOpen(false);
          setAlbumFilter(null);
          setMediaTypeFilter(null);
          if (id === "search") {
            importRef.current?.click();
            return;
          }
          if (id === "favorites") {
            setFilter("favorites");
            return;
          }
          if (id === "videos") {
            setFilter("videos");
            return;
          }
          setFilter("all");
        }}
        onMediaType={type => {
          setAlbumPickerOpen(false);
          setAlbumFilter(null);
          setFilter("all");
          setMediaTypeFilter(type);
        }}
      />
    </>,
    document.body,
  );
}
