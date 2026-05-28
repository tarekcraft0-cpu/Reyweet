import { useState } from "react";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import { AvatarChangeModal } from "../verification/AvatarChangeModal";
import { useApp } from "@/lib/store";
import { isFounderAccount } from "@/lib/founderAccount";
import { isShortUsernameException } from "@/lib/shortUsernameAccounts";
import { getAccountSession, upsertAccountSession, ensureApiTokenMatchesUser } from "@/lib/accountSessions";
import {
  isUsernameTaken,
  normalizeUsername,
  sanitizeUsernameInput,
  validateUsernameFormat,
} from "@/lib/usernameRules";
import {
  apiBackendEnabled,
  apiIsUsernameAvailable,
  apiPatchProfile,
  apiUploadMedia,
  ensureApiRuntimeConfig,
  getApiToken,
} from "@/lib/apiBackend";
import { toStoredMediaRef } from "@/lib/mediaUrl";
import { Avatar } from "../Avatar";
import { ArrowRight, Loader2 } from "lucide-react";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { MentionComposerField } from "../MentionComposerField";

async function uploadAvatarFile(
  token: string,
  file: File,
  opts?: { timeoutMs?: number },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await ensureApiRuntimeConfig();
  return apiUploadMedia(token, file, opts);
}

async function uploadAvatarDataUrl(
  token: string,
  dataUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type === "image/gif" ? "gif" : blob.type === "image/png" ? "png" : "jpg";
  const file = new File([blob], `avatar.${ext}`, { type: blob.type || "image/jpeg" });
  return uploadAvatarFile(token, file);
}

export function EditProfileScreen({ onBack }: { onBack: () => void }) {
  const { currentUser, updateProfile, setNote, state } = useApp();
  const u = currentUser!;
  const [username, setUsername] = useState(u.username);
  const [displayName, setDisplayName] = useState(u.displayName || "");
  const founder = isFounderAccount(u);
  const shortName = isShortUsernameException(username, u.id);
  const [bio, setBio] = useState(u.bio);
  const [avatar, setAvatar] = useState(u.avatar);
  const [note, setLocalNote] = useState(u.note || "");
  const [profileLink, setProfileLink] = useState(u.profileLink || "");
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const ent = getUserEntitlements(u);

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void (async () => {
      setAvatarBusy(true);
      const prevAvatar = avatar;
      try {
        const token = ensureApiTokenMatchesUser(u.id) ?? getApiToken();
        if (apiBackendEnabled() && token && f.type.startsWith("image/")) {
          const up = await uploadAvatarFile(token, f, { timeoutMs: 60_000 });
          e.target.value = "";
          if (!up.ok) {
            alert(up.error || "فشل رفع الصورة");
            return;
          }
          setAvatar(up.url);
          const saved = await persistAvatarOnly(up.url);
          if (!saved) setAvatar(prevAvatar);
          return;
        }
        if (f.size > 4 * 1024 * 1024) {
          alert("الصورة كبيرة جداً (الحد 4 ميجا)");
          e.target.value = "";
          return;
        }
        const r = new FileReader();
        r.onload = () => setAvatar(String(r.result));
        r.readAsDataURL(f);
      } catch {
        alert("تعذر رفع الصورة — تحقق من الاتصال بالخادم وحاول مرة أخرى");
      } finally {
        e.target.value = "";
        setAvatarBusy(false);
      }
    })();
  };

  const persistAvatarOnly = async (avatarUrl: string): Promise<boolean> => {
      const token = ensureApiTokenMatchesUser(u.id) ?? getApiToken();
      if (!apiBackendEnabled() || !token) return false;
      const remote = await apiPatchProfile(token, { avatar: avatarUrl });
      if (!remote.ok) {
        const err = remote.error || "فشل حفظ الصورة الشخصية";
        if (/اسم المستخدم/i.test(err)) {
          alert("تعذر حفظ الصورة الشخصية. جرّب مرة أخرى.");
        } else {
          alert(err);
        }
        return false;
      }
      const av = toStoredMediaRef(remote.user.avatar || avatarUrl);
    const sess = getAccountSession(u.id);
    if (sess) upsertAccountSession({ ...sess, avatar: av });
    updateProfile({ avatar: av }, { skipRemotePush: true });
    return true;
  };

  const save = async () => {
    if (saving || avatarBusy) return;
    const trimmed = normalizeUsername(sanitizeUsernameInput(username));
    const usernameChanged = trimmed !== normalizeUsername(u.username);
    if (usernameChanged) {
      const nameErr = validateUsernameFormat(trimmed, u.id);
      if (nameErr) {
        alert(nameErr);
        return;
      }
      if (isUsernameTaken(trimmed, state.users, u.id)) {
        alert("اسم المستخدم مستخدم من قبل — اختر اسماً آخر");
        return;
      }
    }

    setSaving(true);
    try {
      await ensureApiRuntimeConfig();
      const token = ensureApiTokenMatchesUser(u.id) ?? getApiToken();

      if (apiBackendEnabled() && !token) {
        alert("انتهت جلستك — سجّل الدخول مرة أخرى ثم حاول الحفظ");
        return;
      }

      if (apiBackendEnabled() && token) {
        if (usernameChanged && !isShortUsernameException(trimmed, u.id)) {
          const available = await apiIsUsernameAvailable(trimmed, u.id);
          if (!available) {
            alert("اسم المستخدم مستخدم من قبل — اختر اسماً آخر");
            return;
          }
        }
        let avatarToSave = avatar;
        if (avatar.startsWith("data:")) {
          const up = await uploadAvatarDataUrl(token, avatar);
          if (!up.ok) {
            alert(up.error || "فشل رفع الصورة — جرّب صورة أصغر");
            return;
          }
          avatarToSave = up.url;
        }
        const profilePatch: Parameters<typeof apiPatchProfile>[1] = {
          displayName: displayName.trim(),
          bio,
          note: note.trim(),
          profileLink: profileLink.trim(),
        };
        if (usernameChanged) profilePatch.username = trimmed;
        if (avatarToSave.trim()) profilePatch.avatar = avatarToSave;
        const remote = await apiPatchProfile(token, profilePatch);
        if (!remote.ok) {
          alert(
            remote.error === "unauthorized" || remote.error?.includes("401")
              ? "انتهت جلستك — سجّل الدخول مرة أخرى"
              : remote.error || "تعذر حفظ الملف الشخصي — تحقق من الاتصال وحاول مرة أخرى",
          );
          return;
        }
        updateProfile(
          {
            username: remote.user.username,
            displayName: remote.user.displayName?.trim() || displayName.trim() || undefined,
            avatar: toStoredMediaRef(remote.user.avatar),
            bio: remote.user.bio ?? bio,
            note: remote.user.note ?? note.trim(),
            profileLink: remote.user.profileLink ?? profileLink.trim(),
          },
          { skipRemotePush: true },
        );
        setNote(note);
        onBack();
        return;
      }

      updateProfile({
        ...(usernameChanged ? { username: trimmed } : {}),
        displayName: displayName.trim() || undefined,
        bio,
        avatar,
        note: note.trim(),
        profileLink: profileLink.trim(),
      });
      setNote(note);
      onBack();
    } catch (e) {
      alert(
        e instanceof Error && e.message.includes("fetch")
          ? "تعذر الاتصال بالخادم — تأكد من اتصالك وحاول مرة أخرى"
          : "حدث خطأ غير متوقع — حاول مرة أخرى",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative p-4 space-y-4">
      {(saving || avatarBusy) && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card px-8 py-7 shadow-xl">
            <Loader2 className="h-11 w-11 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-semibold text-foreground">
              {avatarBusy && !saving ? "جاري رفع الصورة…" : "جاري حفظ البروفايل…"}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <SlideDismissBackButton onDismiss={onBack} disabled={saving || avatarBusy}>
          <ArrowRight />
        </SlideDismissBackButton>
        <h2 className="font-bold">تعديل البروفايل</h2>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || avatarBusy}
          className="inline-flex min-w-[3.5rem] items-center justify-center gap-1.5 text-primary font-semibold disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>حفظ</span>
            </>
          ) : (
            "حفظ"
          )}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => setAvatarModalOpen(true)} className="rounded-full">
          <Avatar name={username} src={avatar} size={100} />
        </button>
        <button
          type="button"
          onClick={() => setAvatarModalOpen(true)}
          disabled={avatarBusy}
          className="text-sm font-semibold text-primary"
        >
          {avatarBusy ? "جاري الرفع…" : "تغيير الصورة"}
        </button>
        <p className="max-w-xs text-center text-[11px] text-muted-foreground">
          {ent.canUseAnimatedAvatar
            ? "صورة عادية أو افتار GIF متحرك"
            : "صورة ثابتة — الافتار المتحرك يتطلب التوثيق"}
        </p>
      </div>

      <AvatarChangeModal
        open={avatarModalOpen}
        onOpenChange={setAvatarModalOpen}
        onNeedSubscription={() => {
          setAvatarModalOpen(false);
          alert("اشترك من الإعدادات → Get Verified");
        }}
        onAvatarUpdated={url => setAvatar(url)}
      />

      <div>
        <label className="text-sm text-muted-foreground">الاسم</label>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="اسمك كما يظهر للآخرين"
          className="mt-1 w-full rounded-2xl bg-input px-4 py-3 outline-none"
          maxLength={80}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">يظهر بخط عريض — مختلف عن @username</p>
      </div>

      <div>
        <label className="text-sm text-muted-foreground">اسم المستخدم</label>
        <input
          value={username}
          onChange={e => setUsername(sanitizeUsernameInput(e.target.value))}
          className="mt-1 w-full rounded-2xl bg-input px-4 py-3 outline-none"
          dir="ltr"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {shortName
            ? "اسم قصير مسموح لهذا الحساب فقط (@t @7 @l @1 @m)"
            : "3–30 حرفاً: a-z صغيرة وأرقام و _ فقط (لا عربي ولا أحرف كبيرة)"}
        </p>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">البايو</label>
        <MentionComposerField
          value={bio}
          onChange={v => setBio(v.slice(0, 160))}
          rows={3}
          placeholder="اكتب بايو مختصر… يمكنك منشن @شخص"
          wrapperClassName="rounded-2xl bg-input mt-1"
          className="w-full px-4 py-3 text-sm text-foreground outline-none resize-none"
          overlayClassName="px-4 py-3 text-sm leading-relaxed"
          maxLength={160}
        />
        <p className="mt-1 text-[11px] text-muted-foreground text-end">{bio.length}/160</p>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">رابط (يظهر تحت البايو)</label>
        <input
          value={profileLink}
          onChange={e => setProfileLink(e.target.value)}
          placeholder="https://..."
          className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1"
          dir="ltr"
        />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">النوت (تظهر للأصدقاء)</label>
        <input
          value={note}
          onChange={e => setLocalNote(e.target.value)}
          maxLength={50}
          className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1"
        />
      </div>
    </div>
  );
}