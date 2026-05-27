import { useEffect, useRef, useState } from "react";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { useApp, isMutual } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import type { StorySticker } from "@/lib/types";
import { StoryCreationStickers } from "../story/StoryCreationStickers";
import { isRenderableMediaUrl, resolveMediaUrl } from "@/lib/mediaUrl";
import {
  resolvePostMediaForSave,
  resolveStoryMediaForSave,
  storyPayloadFromUrl,
  takePendingStoryFile,
  uploadStoryFile,
} from "@/lib/storyMedia";
import { hasCreateAttachmentMedia, isVideoMediaRef } from "@/lib/postMedia";
import { MentionComposerField } from "../MentionComposerField";
import { ArrowRight } from "lucide-react";

export type CreateScreenInitial = {
  type?: "tweet" | "reel" | "story";
  media?: string;
};

type CreateType = "tweet" | "reel" | "story";

export function CreateScreen({
  onBack,
  initial,
}: {
  onBack: () => void;
  initial?: CreateScreenInitial | null;
}) {
  const { state, currentUser, createPost, addStory } = useApp();
  const t = useT();
  const me = currentUser!;
  const [type, setType] = useState<CreateType>((initial?.type as CreateType) ?? "tweet");
  const [text, setText] = useState("");
  const [media, setMedia] = useState(initial?.media ?? "");
  const [audience, setAudience] = useState<"all" | "close">("all");
  const [closeOnly, setCloseOnly] = useState<string[]>([]);
  const [storyStickers, setStoryStickers] = useState<StorySticker[]>([]);
  const [storyExpiryHours, setStoryExpiryHours] = useState<24 | 48 | 72>(24);
  const [publishing, setPublishing] = useState(false);
  const ent = getUserEntitlements(me);
  const postCharLimit = ent.postCharacterLimit;
  const storyFileRef = useRef<File | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };

  useEffect(() => {
    if (initial?.type && initial.type !== "post") setType(initial.type as CreateType);
    const pending = takePendingStoryFile();
    if (pending && initial?.type === "story") {
      revokePreviewUrl();
      storyFileRef.current = pending;
      const previewUrl = URL.createObjectURL(pending);
      previewObjectUrlRef.current = previewUrl;
      setMedia(previewUrl);
    } else if (initial?.media) {
      setMedia(initial.media);
    }
  }, [initial?.type, initial?.media]);

  useEffect(() => {
    if (type !== "story") setStoryStickers([]);
  }, [type]);

  useEffect(() => () => revokePreviewUrl(), []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (type === "story") {
      revokePreviewUrl();
      storyFileRef.current = f;
      const previewUrl = URL.createObjectURL(f);
      previewObjectUrlRef.current = previewUrl;
      setMedia(previewUrl);
      return;
    }

    storyFileRef.current = f;
    revokePreviewUrl();
    const r = new FileReader();
    r.onload = () => setMedia(String(r.result));
    r.readAsDataURL(f);
  };

  const submit = async () => {
    if (publishing) return;
    const pickedFile = storyFileRef.current;
    const isVideo =
      pickedFile?.type.startsWith("video/") || media.startsWith("data:video") || isVideoMediaRef(media);
    if (type === "story") {
      setPublishing(true);
      const uploaded = pickedFile
        ? await uploadStoryFile(pickedFile)
        : await resolveStoryMediaForSave(media);
      setPublishing(false);
      if (!uploaded.ok) {
        alert(uploaded.error);
        return;
      }
      const payload = storyPayloadFromUrl(uploaded.url);
      const published = await addStory(
        payload.image,
        audience,
        storyStickers.length > 0 ? storyStickers : undefined,
        payload.video,
        storyExpiryHours,
      );
      if (!published.ok) {
        alert(published.error);
        return;
      }
      onBack();
      return;
    }

    if (text.length > postCharLimit) {
      alert(`النص طويل — الحد ${postCharLimit} حرفاً`);
      return;
    }

    if (type === "reel") {
      if (!hasCreateAttachmentMedia(media, !!pickedFile)) {
        alert("يجب إرفاق مقطع فيديو للريلز — لا يمكن النشر بالنص فقط");
        return;
      }
      if (!isVideo && !media.startsWith("data:video") && !isVideoMediaRef(media)) {
        alert("الريلز يتطلب مقطع فيديو فقط");
        return;
      }
    }

    const needsUpload = media.startsWith("data:") || media.startsWith("blob:");
    let videoUrl = isVideo || type === "reel" ? media : "";
    let imageUrl = !isVideo && type !== "reel" ? media || "" : "";
    if (type === "reel" && !isVideo && hasCreateAttachmentMedia(media, !!pickedFile)) {
      imageUrl = media;
      videoUrl = "";
    }
    if (needsUpload && media?.startsWith("data:")) {
      setPublishing(true);
      const uploaded = await resolvePostMediaForSave(media);
      setPublishing(false);
      if (!uploaded.ok) {
        alert(uploaded.error);
        return;
      }
      const payload = storyPayloadFromUrl(uploaded.url);
      videoUrl = payload.video || (isVideo ? uploaded.url : "");
      imageUrl = payload.image || (!isVideo ? uploaded.url : imageUrl);
    }

    if (type === "reel") {
      const resolvedVideo = videoUrl ? resolveMediaUrl(videoUrl) : "";
      const hasVideo =
        !!resolvedVideo &&
        (isVideoMediaRef(resolvedVideo) || resolvedVideo.startsWith("data:video"));
      if (!hasVideo) {
        alert("يجب إرفاق مقطع فيديو صالح للريلز");
        return;
      }
      createPost({
        type: "reel",
        text,
        video: resolvedVideo,
        image: imageUrl && !isVideoMediaRef(imageUrl) ? resolveMediaUrl(imageUrl) : "🎬",
      });
    } else if (type === "tweet") {
      createPost(
        videoUrl
          ? { type: "tweet", text, video: videoUrl }
          : { type: "tweet", text, image: imageUrl || undefined },
      );
    }
    onBack();
  };

  const mutuals = me.following.filter(id => isMutual(state, me.id, id));

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <SlideDismissBackButton onDismiss={onBack} disabled={publishing}>
          <ArrowRight />
        </SlideDismissBackButton>
        <h2 className="font-bold">{t("create")}</h2>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={publishing}
          className="text-primary font-semibold disabled:opacity-50"
        >
          {publishing ? "…" : t("publish")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["tweet", "reel", "story"] as const).map(tp => (
          <button
            key={tp}
            type="button"
            onClick={() => setType(tp)}
            className={
              "py-2 rounded-2xl text-sm font-semibold " +
              (type === tp ? "bg-primary text-primary-foreground" : "bg-secondary")
            }
          >
            {tp === "tweet" ? t("tweet") : tp === "reel" ? t("reels") : t("story")}
          </button>
        ))}
      </div>

      {type !== "story" && (
        <>
          <MentionComposerField
            value={text}
            onChange={v => setText(v.slice(0, postCharLimit))}
            rows={5}
            placeholder={type === "tweet" ? "بم تفكر؟" : "اكتب وصفاً للريلز (اختياري)..."}
            wrapperClassName="rounded-2xl bg-input"
            className="w-full rounded-2xl px-4 py-3 text-[15px] leading-relaxed outline-none resize-none"
            overlayClassName="px-4 py-3 text-[15px] leading-relaxed"
          />
          <p className="mt-1 text-end text-xs text-muted-foreground">
            {text.length}/{postCharLimit}
          </p>
        </>
      )}

      <div>
        <label className="text-sm text-muted-foreground">
          {type === "reel" ? "فيديو أو صورة (مطلوب للريلز)" : t("attach")}
        </label>
        <input
          type="file"
          accept={type === "reel" ? "image/*,video/*" : "image/*,video/*"}
          onChange={onFile}
          className="mt-1 block w-full text-sm"
        />
        {type === "reel" && !media && (
          <p className="mt-1 text-xs text-muted-foreground">لا يمكن نشر ريلز بدون فيديو أو صورة</p>
        )}
        {media && (
          <div className="mt-2 aspect-[9/16] max-h-[min(52vh,420px)] mx-auto bg-muted rounded-2xl overflow-hidden flex items-center justify-center">
            {storyFileRef.current?.type.startsWith("video/") || isVideoMediaRef(media) ? (
              <video src={media} controls className="w-full h-full object-cover" playsInline />
            ) : media.startsWith("data:image") || media.startsWith("blob:") || isRenderableMediaUrl(media) ? (
              <img src={media} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-7xl">{media}</span>
            )}
          </div>
        )}
      </div>

      {type === "story" && (
        <div className="space-y-3">
          <StoryCreationStickers stickers={storyStickers} setStickers={setStoryStickers} />
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAudience("all")}
                className={
                  "flex-1 py-2 rounded-2xl text-sm " +
                  (audience === "all" ? "bg-primary text-primary-foreground" : "bg-secondary")
                }
              >
                {t("audienceAll")}
              </button>
              <button
                type="button"
                onClick={() => setAudience("close")}
                className={
                  "flex-1 py-2 rounded-2xl text-sm " +
                  (audience === "close" ? "bg-primary text-primary-foreground" : "bg-secondary")
                }
              >
                ⭐ {t("audienceClose")}
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">مدة ظهور الستوري</p>
              <div className="flex gap-2">
                {ent.storyExpiryHoursOptions.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setStoryExpiryHours(h as 24 | 48 | 72)}
                    className={
                      "flex-1 rounded-xl py-2 text-xs font-semibold " +
                      (storyExpiryHours === h
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground")
                    }
                  >
                    {h} ساعة
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                فيديو حتى {ent.storyMaxDurationSec} ثانية
              </p>
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
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() =>
                            setCloseOnly(s =>
                              s.includes(id) ? s.filter(x => x !== id) : [...s, id],
                            )
                          }
                        />
                        @{u.username}
                      </label>
                    );
                  })}
                  {mutuals.length === 0 && (
                    <p className="text-xs text-muted-foreground">لا يوجد أصدقاء متبادلون</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
