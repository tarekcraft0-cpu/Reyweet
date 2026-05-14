import { useEffect, useState } from "react";
import { useApp, isMutual } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { StorySticker } from "@/lib/types";
import { StoryCreationStickers } from "../story/StoryCreationStickers";
import { ArrowRight } from "lucide-react";

export function CreateScreen({ onBack }: { onBack: () => void }) {
  const { state, currentUser, createPost, addStory } = useApp();
  const t = useT();
  const me = currentUser!;
  const [type, setType] = useState<"post" | "tweet" | "reel" | "story">("post");
  const [text, setText] = useState("");
  const [media, setMedia] = useState<string>("");
  const [audience, setAudience] = useState<"all" | "close">("all");
  const [closeOnly, setCloseOnly] = useState<string[]>([]);
  const [storyStickers, setStoryStickers] = useState<StorySticker[]>([]);

  useEffect(() => {
    if (type !== "story") setStoryStickers([]);
  }, [type]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setMedia(String(r.result)); r.readAsDataURL(f);
  };

  const submit = () => {
    if (type === "story") {
      addStory(media || "📷", audience, storyStickers.length > 0 ? storyStickers : undefined);
    }
    else if (type === "post") createPost({ type: "post", text, image: media || "🖼️" });
    else if (type === "tweet") createPost({ type: "tweet", text, image: media || undefined });
    else if (type === "reel") createPost({ type: "reel", text, video: media || "🎬" });
    onBack();
  };

  const mutuals = me.following.filter(id => isMutual(state, me.id, id));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack}><ArrowRight /></button>
        <h2 className="font-bold">{t("create")}</h2>
        <button onClick={submit} className="text-primary font-semibold">{t("publish")}</button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {(["post", "tweet", "reel", "story"] as const).map(tp => (
          <button key={tp} onClick={() => setType(tp)} className={"py-2 rounded-2xl text-sm font-semibold " + (type === tp ? "bg-primary text-primary-foreground" : "bg-secondary")}>
            {tp === "post" ? t("post") : tp === "tweet" ? t("tweet") : tp === "reel" ? t("reels") : t("story")}
          </button>
        ))}
      </div>

      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder={type === "tweet" ? "بم تفكر؟" : "اكتب وصف..."} className="w-full bg-input rounded-2xl px-4 py-3 outline-none resize-none" />

      <div>
        <label className="text-sm text-muted-foreground">{t("attach")}</label>
        <input type="file" accept="image/*,video/*" onChange={onFile} className="mt-1 block w-full text-sm" />
        {media && <div className="mt-2 aspect-square bg-muted rounded-2xl overflow-hidden flex items-center justify-center">
          {media.startsWith("data:image") ? <img src={media} className="w-full h-full object-cover" /> :
           media.startsWith("data:video") ? <video src={media} controls className="w-full h-full" /> :
           <span className="text-7xl">{media}</span>}
        </div>}
      </div>

      {type === "story" && (
        <div className="space-y-3">
          <StoryCreationStickers stickers={storyStickers} setStickers={setStoryStickers} />
          <div className="space-y-2">
            <div className="flex gap-2">
              <button onClick={() => setAudience("all")} className={"flex-1 py-2 rounded-2xl text-sm " + (audience === "all" ? "bg-primary text-primary-foreground" : "bg-secondary")}>{t("audienceAll")}</button>
              <button onClick={() => setAudience("close")} className={"flex-1 py-2 rounded-2xl text-sm " + (audience === "close" ? "bg-primary text-primary-foreground" : "bg-secondary")}>⭐ {t("audienceClose")}</button>
            </div>
            {audience === "close" && (
              <div className="bg-card rounded-2xl p-3">
                <p className="text-xs text-muted-foreground mb-2">اختر الأصدقاء المقربين (يُحفظون لاحقاً)</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {mutuals.map(id => {
                    const u = state.users.find(x => x.id === id)!;
                    const sel = closeOnly.includes(id) || me.closeFriends.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={sel} onChange={() => setCloseOnly(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} />
                        @{u.username}
                      </label>
                    );
                  })}
                  {mutuals.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد أصدقاء متبادلون</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
