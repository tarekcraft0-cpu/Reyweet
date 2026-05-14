import { memo, useMemo, useRef, useState } from "react";
import type { Sticker } from "@/lib/types";
import { Image as ImageIcon } from "lucide-react";

export type ChatStickerTab = "favorite" | "from_image" | "custom";

const TAB_LABELS: Record<ChatStickerTab, string> = {
  favorite: "مفضلة",
  from_image: "من صورتي",
  custom: "مخصص",
};

const BASE_TABS: ChatStickerTab[] = ["favorite", "from_image", "custom"];

const VIDEO_STICKER_RE = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i;

function loadBundledCustomStickerUrls(): { id: string; src: string }[] {
  try {
    const mods = import.meta.glob("/public/stickers/custom/*.{png,jpg,jpeg,webp,gif,avif,svg,mp4,webm,mov,m4v,ogg}", {
      eager: true,
      query: "?url",
      import: "default",
    }) as Record<string, string>;
    return Object.entries(mods).map(([path, src], i) => ({ id: `bundled_${i}_${path}`, src }));
  } catch {
    return [];
  }
}

function isVideoStickerSrc(src: string) {
  const value = src.trim().toLowerCase();
  return value.startsWith("data:video") || VIDEO_STICKER_RE.test(value);
}

export const ChatStickerPicker = memo(function ChatStickerPicker({
  isQuranChannel,
  userStickers,
  favoriteStickerContents = [],
  createdStickerContents = [],
  onPick,
  isTyping = false,
}: {
  isQuranChannel: boolean;
  userStickers: Sticker[];
  favoriteStickerContents?: string[];
  createdStickerContents?: string[];
  onPick: (content: string, meta?: { createdFromImage?: boolean }) => void;
  isTyping?: boolean;
}) {
  const [tab, setTab] = useState<ChatStickerTab>("custom");
  const fileRef = useRef<HTMLInputElement>(null);
  const bundledCache = useRef<{ id: string; src: string }[] | null>(null);

  const customItems = useMemo(() => {
    const emojiRows = userStickers.map(s => ({ id: s.id, kind: "emoji" as const, content: s.emoji, label: s.label }));
    const imgs = (createdStickerContents || []).map((src, i) => ({
      id: `custom_img_${i}_${String(src).slice(0, 32)}`,
      kind: "image" as const,
      content: src,
      label: "",
    }));
    return [...emojiRows, ...imgs];
  }, [userStickers, createdStickerContents]);

  const bundledLibrary = useMemo(() => {
    if (tab !== "custom") return [];
    if (!bundledCache.current) bundledCache.current = loadBundledCustomStickerUrls();
    return bundledCache.current;
  }, [tab]);

  const favoriteItems = useMemo(
    () =>
      (favoriteStickerContents || []).map((src, i) => ({
        id: `fav_${i}_${String(src).slice(0, 48)}`,
        src,
      })),
    [favoriteStickerContents],
  );

  const shell = "border-t border-border flex flex-col min-h-0 " + (isQuranChannel ? "bg-zinc-900 border-zinc-700" : "bg-background");

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
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 min-h-[200px]">
          <div className="rounded-full bg-secondary p-4">
            <ImageIcon size={40} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-center text-muted-foreground max-w-xs">
            اختر صورة من معرضك لتحويلها إلى ملصق وإرسالها فوراً في المحادثة وتُحفظ في «مخصص».
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
        <div
          className="overflow-y-auto p-1.5 grid content-start min-h-0 grid-cols-5 gap-1.5"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            maxHeight: favoriteItems.length > 80 ? "78vh" : favoriteItems.length > 28 ? "62vh" : "44vh",
          }}
        >
          {favoriteItems.length === 0 ? (
            <div className="col-span-5 py-10 text-center text-sm text-muted-foreground">
              لا ملصقات في المفضلة بعد — اضغط مطولاً على ملصق في الشات واختر «إضافة للمفضلة»
            </div>
          ) : (
            favoriteItems.map(item => {
              const isVid = isVideoStickerSrc(item.src);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item.src)}
                  className={
                    "aspect-square w-full overflow-hidden rounded-md p-0 border-0 bg-transparent " +
                    "hover:bg-secondary/30 active:scale-[0.97] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
                  }
                  title={isVid ? "ملصق متحرك" : undefined}
                >
                  {isVid ? (
                    <video
                      src={item.src}
                      className="w-full h-full object-contain block bg-transparent"
                      muted
                      playsInline
                      loop
                      autoPlay
                      preload="auto"
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
      )}

      {tab === "custom" && (
        <div className="overflow-y-auto min-h-0 font-ios-emoji" style={{ maxHeight: "72vh" }}>
          <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground">ملصقاتك</div>
          <div className="p-2 grid grid-cols-6 gap-1.5 content-start">
            {customItems.length === 0 ? (
              <div className="col-span-6 py-6 text-center text-sm text-muted-foreground">
                لا ملصقات أنشأتها بعد — استخدم «من صورتي» أو «+ إنشاء إيموجي» أدناه
              </div>
            ) : (
              customItems.map(item =>
                item.kind === "emoji" ? (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    className="h-11 rounded-lg bg-secondary hover:bg-secondary/80 text-2xl leading-none flex items-center justify-center font-ios-emoji active:scale-95"
                    onClick={() => onPick(item.content)}
                  >
                    {item.content}
                  </button>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className="aspect-square w-full overflow-hidden rounded-md p-0 border-0 bg-transparent hover:bg-secondary/30 active:scale-[0.97]"
                    onClick={() => onPick(item.content)}
                  >
                    {isVideoStickerSrc(item.content) ? (
                      <video
                        src={item.content}
                        className="w-full h-full object-contain block bg-transparent"
                        muted
                        playsInline
                        loop
                        autoPlay
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={item.content}
                        alt=""
                        className="w-full h-full object-contain block bg-transparent"
                        loading="lazy"
                        draggable={false}
                      />
                    )}
                  </button>
                )
              )
            )}
            <button
              type="button"
              className="h-10 rounded-lg border border-dashed border-border text-[10px] col-span-2 leading-tight px-1"
              onClick={() => {
                const e = prompt("ايموجي الملصق؟");
                if (!e) return;
                const l = prompt("اسم الملصق؟") || "ملصق";
                window.dispatchEvent(new CustomEvent("create-sticker", { detail: { emoji: e, label: l } }));
              }}
            >
              + إنشاء إيموجي
            </button>
          </div>

          {bundledLibrary.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground border-t border-border">من المكتبة</div>
              <div className="p-1.5 grid grid-cols-5 gap-1.5 content-start pb-3">
                {bundledLibrary.map(item => {
                  const isVid = isVideoStickerSrc(item.src);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onPick(item.src)}
                      className={
                        "aspect-square w-full overflow-hidden rounded-md p-0 border-0 bg-transparent " +
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
                          draggable={false}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
