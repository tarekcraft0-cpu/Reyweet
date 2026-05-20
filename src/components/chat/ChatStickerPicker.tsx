import { memo, useMemo, useRef, useState } from "react";
import type { Sticker } from "@/lib/types";
import { Image as ImageIcon } from "lucide-react";
import { getCustomStickerLibrary, isVideoStickerSrc } from "@/lib/customStickerLibrary";

export type ChatStickerTab = "favorite" | "from_image" | "custom";

const TAB_LABELS: Record<ChatStickerTab, string> = {
  favorite: "مفضلة",
  from_image: "من صورتي",
  custom: "مخصص",
};

const BASE_TABS: ChatStickerTab[] = ["custom", "favorite", "from_image"];

const GRID_COLS = 5;
const ROW_PX = 76;
const GRID_PAD_PX = 16;

/** ارتفاع لوحة الشبكة: يتمدد مع عدد الملصقات حتى حد أقصى ثم يُفعَّل التمرير */
function stickerGridPanelHeight(itemCount: number): number {
  if (itemCount === 0) return 120;
  const rows = Math.ceil(itemCount / GRID_COLS);
  const content = rows * ROW_PX + GRID_PAD_PX;
  const cap =
    typeof window !== "undefined" ? Math.min(Math.round(window.innerHeight * 0.58), 520) : 480;
  return Math.min(Math.max(content, 108), cap);
}

function StickerMediaGrid({
  items,
  onPick,
  emptyText,
}: {
  items: { id: string; src: string }[];
  onPick: (src: string) => void;
  emptyText: string;
}) {
  const panelHeight = stickerGridPanelHeight(items.length);

  return (
    <div
      className="min-h-0 shrink-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y"
      style={{ maxHeight: panelHeight, WebkitOverflowScrolling: "touch" }}
    >
      <div className="p-1.5 grid grid-cols-5 gap-1.5 content-start pb-2 w-full">
        {items.length === 0 ? (
          <div className="col-span-5 py-10 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          items.map(item => {
            const isVid = isVideoStickerSrc(item.src);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item.src)}
                className={
                  "aspect-square w-full min-h-[64px] overflow-hidden rounded-md p-0 border-0 bg-transparent " +
                  "hover:bg-secondary/30 active:scale-[0.97] transition"
                }
              >
                {isVid ? (
                  <video
                    src={item.src}
                    className="w-full h-full object-contain block bg-transparent"
                    muted
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={item.src}
                    alt=""
                    className="w-full h-full object-contain block bg-transparent"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export const ChatStickerPicker = memo(function ChatStickerPicker({
  isQuranChannel,
  userStickers: _userStickers,
  favoriteStickerContents = [],
  createdStickerContents: _createdStickerContents,
  onPick,
  onClose,
  isTyping = false,
}: {
  isQuranChannel: boolean;
  userStickers: Sticker[];
  favoriteStickerContents?: string[];
  createdStickerContents?: string[];
  onPick: (content: string, meta?: { createdFromImage?: boolean }) => void;
  onClose?: () => void;
  isTyping?: boolean;
}) {
  const [tab, setTab] = useState<ChatStickerTab>("custom");
  const fileRef = useRef<HTMLInputElement>(null);

  const fileStickers = useMemo(() => getCustomStickerLibrary(), []);

  const favoriteItems = useMemo(
    () =>
      (favoriteStickerContents || []).map((src, i) => ({
        id: `fav_${i}_${String(src).slice(0, 48)}`,
        src,
      })),
    [favoriteStickerContents],
  );

  const shell =
    "border-t border-border flex flex-col min-h-0 max-h-[72vh] " +
    (isQuranChannel ? "bg-zinc-900 border-zinc-700" : "bg-background");

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => {
      const data = String(r.result || "");
      if (data.startsWith("data:image")) onPick(data, { createdFromImage: true });
    };
    r.readAsDataURL(f);
  };

  return (
    <div className={shell}>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <div className="flex gap-1 p-2 border-b border-border overflow-x-auto no-scrollbar shrink-0">
        {BASE_TABS.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              "shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap " +
              (tab === id ? "bg-primary text-primary-foreground" : "bg-secondary")
            }
          >
            {TAB_LABELS[id]}
            {id === "custom" && fileStickers.length > 0 ? ` (${fileStickers.length})` : ""}
          </button>
        ))}
        {isTyping && (
          <button
            key="typing"
            type="button"
            className="shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap bg-green-500 text-white"
          >
            يكتب الان
          </button>
        )}
      </div>

      {tab === "from_image" && (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 min-h-[200px] shrink-0">
          <div className="rounded-full bg-secondary p-4">
            <ImageIcon size={40} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-center text-muted-foreground max-w-xs">
            اختر صورة من معرضك لتحويلها إلى ملصق وإرسالها فوراً في المحادثة.
          </p>
          <button
            type="button"
            className="bg-primary text-primary-foreground px-6 py-3 rounded-2xl text-sm font-semibold"
            onClick={() => fileRef.current?.click()}
          >
            اختيار صورة
          </button>
        </div>
      )}

      {tab === "favorite" && (
        <StickerMediaGrid
          items={favoriteItems}
          onPick={src => onPick(src)}
          emptyText="لا ملصقات في المفضلة بعد — اضغط مطولاً على ملصق في الشات واختر «إضافة للمفضلة»"
        />
      )}

      {tab === "custom" && (
        <StickerMediaGrid
          items={fileStickers}
          onPick={src => onPick(src)}
          emptyText="ضع الصور في public/stickers/custom ثم npm run stickers:manifest"
        />
      )}
    </div>
  );
});
