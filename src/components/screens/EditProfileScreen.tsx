import { useState } from "react";
import { useApp } from "@/lib/store";
import { isFounderAccount } from "@/lib/founderAccount";
import { isShortUsernameException } from "@/lib/shortUsernameAccounts";
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
import { Avatar } from "../Avatar";
import { ArrowRight } from "lucide-react";
import { SlideDismissBackButton } from "../SlideDismissShell";

async function uploadAvatarFile(
  token: string,
  file: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await ensureApiRuntimeConfig();
  return apiUploadMedia(token, file);
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

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    void (async () => {
      const token = getApiToken();
      if (apiBackendEnabled() && token && f.type.startsWith("image/")) {
        setAvatarBusy(true);
        const up = await uploadAvatarFile(token, f);
        setAvatarBusy(false);
        e.target.value = "";
        if (up.ok) {
          setAvatar(up.url);
          void persistAvatarOnly(up.url);
          return;
        }
        alert(up.error || "فشل رفع الصورة");
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
    })();
  };

  const persistAvatarOnly = async (avatarUrl: string): Promise<boolean> => {
    const token = getApiToken();
    if (!apiBackendEnabled() || !token) return false;
    const remote = await apiPatchProfile(token, { avatar: avatarUrl });
    if (!remote.ok) {
      alert(remote.error || "فشل حفظ الصورة الشخصية");
      return false;
    }
    updateProfile(
      { avatar: remote.user.avatar },
      { commitRemote: true },
    );
    return true;
  };

  const save = async () => {
    const trimmed = normalizeUsername(username);
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
    const token = getApiToken();
    if (apiBackendEnabled() && token) {
      setSaving(true);
      if (usernameChanged) {
        const available = await apiIsUsernameAvailable(trimmed, u.id);
        if (!available) {
          setSaving(false);
          alert("اسم المستخدم مستخدم من قبل — اختر اسماً آخر");
          return;
        }
      }
      let avatarToSave = avatar;
      if (avatar.startsWith("data:")) {
        const up = await uploadAvatarDataUrl(token, avatar);
        if (!up.ok) {
          setSaving(false);
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
      setSaving(false);
      if (!remote.ok) {
        alert(remote.error);
        return;
      }
      updateProfile(
        {
          username: remote.user.username,
          displayName: remote.user.displayName?.trim() || displayName.trim() || undefined,
          avatar: remote.user.avatar,
          bio: remote.user.bio ?? bio,
          profileLink: profileLink.trim(),
        },
        { commitRemote: true },
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
      profileLink: profileLink.trim(),
    });
    setNote(note);
    onBack();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <SlideDismissBackButton onDismiss={onBack}>
          <ArrowRight />
        </SlideDismissBackButton>
        <h2 className="font-bold">تعديل البروفايل</h2>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || avatarBusy}
          className="text-primary font-semibold disabled:opacity-50"
        >
          {saving ? "…" : "حفظ"}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Avatar name={username} src={avatar} size={100} />
        <label className="text-sm text-primary font-semibold cursor-pointer">
          {avatarBusy ? "جاري الرفع…" : "تغيير الصورة (يدعم GIF المتحرك)"}
          <input type="file" accept="image/*,.gif" hidden onChange={onAvatarFile} disabled={avatarBusy} />
        </label>
        <p className="text-[11px] text-muted-foreground text-center max-w-xs">
          يمكنك رفع صورة متحركة GIF كصورة شخصية؛ ستظهر متحركة في البروفايل والمحادثات.
        </p>
      </div>

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
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          rows={3}
          className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1 resize-none"
        />
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