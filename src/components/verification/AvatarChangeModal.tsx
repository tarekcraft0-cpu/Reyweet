import { useCallback, useRef, useState } from "react";
import { ArrowRight, Image, Sparkles, X } from "lucide-react";
import { Drawer } from "vaul";
import { useApp } from "@/lib/store";
import { getUserEntitlements, isAnimatedAvatarUrl } from "@/lib/verificationEntitlements";
import {
  apiBackendEnabled,
  apiPatchProfile,
  apiUploadMedia,
  ensureApiRuntimeConfig,
  getApiToken,
} from "@/lib/apiBackend";
import { toStoredMediaRef } from "@/lib/mediaUrl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNeedSubscription: () => void;
  onAvatarUpdated?: (url: string) => void;
};

export function AvatarChangeModal({
  open,
  onOpenChange,
  onNeedSubscription,
  onAvatarUpdated,
}: Props) {
  const { currentUser, updateProfile } = useApp();
  const staticRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const ent = currentUser ? getUserEntitlements(currentUser) : null;

  const upload = useCallback(
    async (file: File) => {
      if (!currentUser) return;
      const isGif = file.type === "image/gif";
      if (isGif && !ent?.canUseAnimatedAvatar) {
        onNeedSubscription();
        return;
      }
      setBusy(true);
      try {
        await ensureApiRuntimeConfig();
        const token = getApiToken();
        if (!apiBackendEnabled() || !token) {
          alert("يلزم الاتصال بالخادم");
          return;
        }
        const up = await apiUploadMedia(token, file, {
          timeoutMs: 90_000,
          avatarAnimated: isGif,
        });
        if (!up.ok) {
          alert(up.error);
          return;
        }
        const remote = await apiPatchProfile(token, { avatar: up.url });
        if (!remote.ok) {
          alert(remote.error);
          return;
        }
        const av = toStoredMediaRef(remote.user.avatar || up.url);
        updateProfile({ avatar: av }, { skipRemotePush: true });
        onAvatarUpdated?.(av);
        onOpenChange(false);
      } finally {
        setBusy(false);
      }
    },
    [currentUser, ent, onAvatarUpdated, onNeedSubscription, onOpenChange, updateProfile],
  );

  const onFile = (e: React.ChangeEvent<HTMLInputElement>, animated: boolean) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (animated && f.type !== "image/gif") {
      alert("اختر ملف GIF للافتار المتحرك");
      return;
    }
    void upload(f);
  };

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[200] bg-black/55" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[201] mx-auto flex max-h-[92dvh] max-w-md flex-col rounded-t-[28px] bg-background outline-none"
          dir="rtl"
        >
          <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35" />
          <div className="flex items-center gap-2 px-4 pb-2 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary"
              aria-label="رجوع"
            >
              <ArrowRight size={22} />
            </button>
            <Drawer.Title className="flex-1 text-center text-[17px] font-semibold text-foreground">
              تغيير الصورة
            </Drawer.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
            <input
              ref={staticRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={e => onFile(e, false)}
            />
            <input
              ref={animRef}
              type="file"
              accept="image/gif"
              className="hidden"
              onChange={e => onFile(e, true)}
            />

            <button
              type="button"
              disabled={busy}
              onClick={() => staticRef.current?.click()}
              className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-start disabled:opacity-60"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                <Image size={24} className="text-foreground" />
              </span>
              <div>
                <p className="font-semibold text-foreground">صورة عادية</p>
                <p className="text-xs text-muted-foreground">JPG أو PNG — للجميع</p>
              </div>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!ent?.canUseAnimatedAvatar) {
                  onOpenChange(false);
                  onNeedSubscription();
                  return;
                }
                animRef.current?.click();
              }}
              className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-start disabled:opacity-60"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0095F6]/15">
                <Sparkles size={24} className="text-[#0095F6]" />
              </span>
              <div>
                <p className="font-semibold text-foreground">افتار متحرك</p>
                <p className="text-xs text-muted-foreground">
                  {ent?.canUseAnimatedAvatar ? "GIF — للموثقين" : "يتطلب اشتراك التوثيق"}
                </p>
              </div>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export { isAnimatedAvatarUrl };
