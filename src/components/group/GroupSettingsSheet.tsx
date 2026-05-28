import { useState } from "react";
import type { Chat } from "@/lib/types";
import type { GroupSettings, GroupVisibility } from "@/lib/groupTypes";
import { DEFAULT_GROUP_SETTINGS } from "@/lib/groupTypes";
import { canGroup } from "@/lib/groupRbac";
import { apiPatchGroupSettings } from "@/lib/groupApi";
import { apiBackendEnabled } from "@/lib/apiBackend";
import { useApp } from "@/lib/store";

export function GroupSettingsSheet({
  chat,
  onClose,
}: {
  chat: Chat;
  onClose: () => void;
}) {
  const { currentUser, setState } = useApp();
  const me = currentUser!;
  const base = { ...DEFAULT_GROUP_SETTINGS, ...chat.groupSettings };
  const [settings, setSettings] = useState<GroupSettings>(base);
  const [description, setDescription] = useState(chat.description || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canEdit = canGroup(chat, me.id, "group.edit_settings");

  const save = async () => {
    if (!canEdit) return;
    setBusy(true);
    setErr("");
    try {
      if (apiBackendEnabled()) {
        const res = await apiPatchGroupSettings(chat.id, {
          ...settings,
          description,
        });
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        if (res.data.chat) {
          setState(s => ({
            ...s,
            chats: s.chats.map(c => (c.id === chat.id ? res.data.chat! : c)),
          }));
        }
      } else {
        setState(s => ({
          ...s,
          chats: s.chats.map(c =>
            c.id === chat.id
              ? {
                  ...c,
                  description,
                  groupSettings: settings,
                  groupVisibility: settings.visibility,
                  isPublicGroup: settings.visibility === "public",
                }
              : c,
          ),
        }));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const vis: GroupVisibility = settings.visibility;

  return (
    <div className="fixed inset-0 z-[220] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        className="mx-auto max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background animate-in slide-in-from-bottom"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 border-b border-border bg-background px-4 py-3">
          <h2 className="font-semibold">إعدادات المجموعة</h2>
        </div>
        <div className="space-y-4 px-4 py-4">
          {!canEdit && (
            <p className="text-sm text-muted-foreground">عرض فقط — تحتاج صلاحية مشرف</p>
          )}
          <label className="block text-sm">
            <span className="text-muted-foreground">الوصف</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              disabled={!canEdit}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              rows={2}
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">نوع المجموعة</span>
            <select
              value={vis}
              disabled={!canEdit}
              onChange={e =>
                setSettings(s => ({
                  ...s,
                  visibility: e.target.value as GroupVisibility,
                }))
              }
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2"
            >
              <option value="public">عامة — انضمام مباشر</option>
              <option value="private">خاصة — موافقة مطلوبة</option>
              <option value="invite_only">بالدعوة فقط</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">من يستطيع الإرسال؟</span>
            <select
              value={settings.whoCanSendMessages}
              disabled={!canEdit}
              onChange={e =>
                setSettings(s => ({
                  ...s,
                  whoCanSendMessages: e.target.value as GroupSettings["whoCanSendMessages"],
                }))
              }
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2"
            >
              <option value="everyone">الجميع</option>
              <option value="moderators">المشرفون والمراقبون</option>
              <option value="admins">المشرفون فقط</option>
            </select>
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>وضع بطيء (ثوانٍ بين الرسائل)</span>
            <input
              type="number"
              min={0}
              max={3600}
              disabled={!canEdit}
              value={settings.slowModeSeconds}
              onChange={e =>
                setSettings(s => ({
                  ...s,
                  slowModeSeconds: Math.max(0, Number(e.target.value) || 0),
                }))
              }
              className="w-20 rounded-lg border border-border bg-card px-2 py-1 text-end"
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>منع الروابط</span>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.blockLinks}
              onChange={e => setSettings(s => ({ ...s, blockLinks: e.target.checked }))}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>مكافحة السبام</span>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.antiSpam}
              onChange={e => setSettings(s => ({ ...s, antiSpam: e.target.checked }))}
            />
          </label>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background p-4 pb-[max(1rem,var(--sab))]">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-secondary py-2.5 text-sm">
            إلغاء
          </button>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground"
            >
              {busy ? "جاري الحفظ…" : "حفظ"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
