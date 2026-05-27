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
import {
  captureReelCoverFromVideo,
  uploadReelCoverImage,
  uploadReelVideo,
  validateReelVideoFile,
} from "@/lib/reelMedia";
import { REEL_ACCEPT_VIDEO, REEL_MAX_UPLOAD_MB } from "@/lib/reelsSpec";
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
  const reelPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [reelCover, setReelCover] = useState("");

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

    if (type === "reel") {
      void (async () => {
        const check = await validateReelVideoFile(f);
        if (!check.ok) {
          alert(check.error);
          return;
        }
        storyFileRef.current = f;
        revokePreviewUrl();
        setReelCover("");
        const previewUrl = URL.createObjectURL(f);
        previewObjectUrlRef.current = previewUrl;
        setMedia(previewUrl);
      })();
      return;
    }

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
    let videoUrl = isVideo && type !== "reel" ? media : "";
    let imageUrl = !isVideo && type !== "reel" ? media || "" : "";

    if (type === "reel") {
      setPublishing(true);
      let coverUrl = reelCover ? resolveMediaUrl(reelCover) : "";
      let resolvedVideo = "";

      if (pickedFile) {
        const uploaded = await uploadReelVideo(pickedFile);
        if (!uploaded.ok) {
          setPublishing(false);
          alert(uploaded.error);
          return;
        }
        resolvedVideo = resolveMediaUrl(uploaded.videoUrl);
        if (!coverUrl && uploaded.posterUrl) {
          coverUrl = resolveMediaUrl(uploaded.posterUrl);
        }
      } else if (needsUpload && media.startsWith("blob:")) {
        try {
          const res = await fetch(media);
          const blob = await res.blob();
          const file = new File([blob], "reel.mp4", { type: blob.type || "video/mp4" });
          const uploaded = await uploadReelVideo(file);
          if (!uploaded.ok) {
            setPublishing(false);
            alert(uploaded.error);
            return;
          }
          resolvedVideo = resolveMediaUrl(uploaded.videoUrl);
          if (!coverUrl && uploaded.posterUrl) coverUrl = resolveMediaUrl(uploaded.posterUrl);
        } catch {
          setPublishing(false);
          alert("أعد اختيار الفيديو من زر الإرفاق");
          return;
        }
      } else if (media.startsWith("data:video")) {
        try {
          const res = await fetch(media);
          const blob = await res.blob();
          const file = new File([blob], "reel.mp4", { type: blob.type || "video/mp4" });
          const uploaded = await uploadReelVideo(file);
          if (!uploaded.ok) {
            setPublishing(false);
            alert(uploaded.error);
            return;
          }
          resolvedVideo = resolveMediaUrl(uploaded.videoUrl);
          if (!coverUrl && uploaded.posterUrl) coverUrl = resolveMediaUrl(uploaded.posterUrl);
        } catch {
          setPublishing(false);
          alert("تعذر رفع الفيديو");
          return;
        }
      } else if (isVideoMediaRef(media)) {
        resolvedVideo = resolveMediaUrl(media);
      }

      if (reelCover.startsWith("data:")) {
        const coverUp = await uploadReelCoverImage(reelCover);
        if (coverUp.ok) coverUrl = resolveMediaUrl(coverUp.url);
      }

      setPublishing(false);

      if (!resolvedVideo || !isVideoMediaRef(resolvedVideo)) {
        alert("يجب إرفاق مقطع فيديو صالح للريلز");
        return;
      }
      createPost({
        type: "reel",
        text,
        video: resolvedVideo,
        image: coverUrl && !isVideoMediaRef(coverUrl) ? coverUrl : "🎬",
      });
    } else if (needsUpload && media?.startsWith("data:")) {
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
      onBack();
      return;
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
          accept={type === "reel" ? REEL_ACCEPT_VIDEO : "image/*,video/*"}
          onChange={onFile}
          className="mt-1 block w-full text-sm"
        />
        {type === "reel" && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            عمودي 9:16 (1080×1920) · MP4 H.264 · حتى {REEL_MAX_UPLOAD_MB} ميجا — يُعاد ترميز الفيديو على الخادم
          </p>
        )}
        {type === "reel" && !media && (
          <p className="mt-1 text-xs text-muted-foreground">لا يمكن نشر ريلز بدون فيديو</p>
        )}
        {media && type === "reel" && (
          <div className="mt-2 relative aspect-[9/16] max-h-[min(52vh,420px)] mx-auto bg-black rounded-2xl overflow-hidden">
            <video
              ref={reelPreviewVideoRef}
              src={media}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-white/35"
              style={{ height: `${((1920 - 1350) / 1920) * 100}%` }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-y-0 end-0 w-[18%] border-s border-dashed border-white/25" aria-hidden />
          </div>
        )}
        {media && type !== "reel" && (
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
        {type === "reel" && media && (storyFileRef.current?.type.startsWith("video/") || media.startsWith("blob:")) && (
          <div className="space-y-2 rounded-2xl bg-secondary/60 p-3">
            <p className="text-xs font-medium text-muted-foreground">صورة الغلاف (1:1 في الملف الشخصي)</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-background px-3 py-2 text-xs font-semibold"
                onClick={() => {
                  const v = reelPreviewVideoRef.current;
                  if (!v) return;
                  void captureReelCoverFromVideo(v, v.currentTime || 1)
                    .then(setReelCover)
                    .catch(() => alert("تعذر التقاط لقطة — شغّل الفيديو ثم أعد المحاولة"));
                }}
              >
                لقطة من الفيديو
              </button>
              <label className="rounded-xl bg-background px-3 py-2 text-xs font-semibold cursor-pointer">
                صورة مخصصة
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => setReelCover(String(r.result));
                    r.readAsDataURL(f);
                  }}
                />
              </label>
            </div>
            {(reelCover || media) && (
              <div className="mx-auto aspect-square w-24 overflow-hidden rounded-xl bg-muted">
                <img
                  src={reelCover || media}
                  alt=""
                  className="h-full w-full object-cover object-center"
                />
              </div>
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
