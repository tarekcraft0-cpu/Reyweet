import { useState } from "react";
import { useApp } from "@/lib/store";
import { isUsernameTaken, validateUsernameFormat } from "@/lib/usernameRules";
import { Avatar } from "../Avatar";
import { ArrowRight } from "lucide-react";

export function EditProfileScreen({ onBack }: { onBack: () => void }) {
  const { currentUser, updateProfile, setNote, state } = useApp();
  const u = currentUser!;
  const [username, setUsername] = useState(u.username);
  const [bio, setBio] = useState(u.bio);
  const [avatar, setAvatar] = useState(u.avatar);
  const [note, setLocalNote] = useState(u.note || "");
  const [profileLink, setProfileLink] = useState(u.profileLink || "");

  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setAvatar(String(r.result));
    r.readAsDataURL(f);
  };

  const save = () => {
    const nameErr = validateUsernameFormat(username, u.id);
    if (nameErr) {
      alert(nameErr);
      return;
    }
    if (isUsernameTaken(username, state.users, u.id)) {
      alert("اسم المستخدم مستخدم من قبل");
      return;
    }
    updateProfile({ username, bio, avatar, profileLink: profileLink.trim() });
    setNote(note);
    onBack();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack}><ArrowRight /></button>
        <h2 className="font-bold">تعديل البروفايل</h2>
        <button onClick={save} className="text-primary font-semibold">حفظ</button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Avatar name={username} src={avatar} size={100} />
        <label className="text-sm text-primary font-semibold cursor-pointer">
          تغيير الصورة (يدعم GIF المتحرك)
          <input type="file" accept="image/*,.gif" hidden onChange={onAvatarFile} />
        </label>
        <p className="text-[11px] text-muted-foreground text-center max-w-xs">يمكنك رفع صورة متحركة GIF كصورة شخصية؛ ستظهر متحركة في البروفايل والمحادثات.</p>
      </div>

      <div>
        <label className="text-sm text-muted-foreground">اسم المستخدم</label>
        <input value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1" dir="ltr" />
        <p className="text-[11px] text-muted-foreground mt-1">3–30 حرفاً: إنجليزي وأرقام و _ فقط (لا عربي ولا شرطة -)</p>
      </div>
      <div>
        <label className="text-sm text-muted-foreground">البايو</label>
        <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1 resize-none" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">رابط (يظهر تحت البايو)</label>
        <input value={profileLink} onChange={e => setProfileLink(e.target.value)} placeholder="https://..." className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1" dir="ltr" />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">النوت (تظهر للأصدقاء)</label>
        <input value={note} onChange={e => setLocalNote(e.target.value)} maxLength={50} className="w-full bg-input rounded-2xl px-4 py-3 outline-none mt-1" />
      </div>
    </div>
  );
}
