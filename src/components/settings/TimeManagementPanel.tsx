import { useEffect, useState } from "react";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { ArrowRight } from "lucide-react";
import {
  apiGetTimeManagement,
  apiSetTimeManagement,
  type TimeManagementPrefs,
} from "@/lib/userExtrasApi";
import { apiBackendEnabled } from "@/lib/apiBackend";
import { emitUiToast } from "@/lib/uiToast";

const KEY_LOCAL = "retweet_time_mgmt_local_v1";

export function readLocalTimeManagement(): TimeManagementPrefs | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_LOCAL);
    if (!raw) return null;
    return JSON.parse(raw) as TimeManagementPrefs;
  } catch {
    return null;
  }
}

export function writeLocalTimeManagement(prefs: TimeManagementPrefs): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY_LOCAL, JSON.stringify(prefs));
}

export function TimeManagementPanel({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState<TimeManagementPrefs>({
    dailyLimitMinutes: 0,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const local = readLocalTimeManagement();
      if (local) setPrefs(local);
      if (apiBackendEnabled()) {
        const r = await apiGetTimeManagement();
        if (r.ok) setPrefs(r.timeManagement);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    writeLocalTimeManagement(prefs);
    if (apiBackendEnabled()) {
      const r = await apiSetTimeManagement(prefs);
      setBusy(false);
      if (!r.ok) {
        emitUiToast(r.error);
        return;
      }
      setPrefs(r.timeManagement);
    } else {
      setBusy(false);
    }
    emitUiToast("تم حفظ إعدادات الوقت");
  };

  return (
    <div className="min-h-full bg-background pb-10" dir="rtl">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-3 py-3 pt-[max(0.75rem,var(--sat))]">
        <SlideDismissBackButton navScope="local" onDismiss={onBack} className="mb-2 rounded-full p-2">
          <ArrowRight size={22} />
        </SlideDismissBackButton>
        <h1 className="text-[22px] font-bold text-foreground">إدارة الوقت</h1>
        <p className="mt-1 text-sm text-muted-foreground">حد يومي وتذكير بساعات الهدوء</p>
      </div>
      <div className="space-y-5 px-4 pt-4">
        {loading ? <p className="text-sm text-muted-foreground">جاري التحميل…</p> : null}
        <label className="block">
          <span className="text-sm text-muted-foreground">الحد اليومي (دقائق، 0 = بدون حد)</span>
          <input
            type="number"
            min={0}
            max={1440}
            value={prefs.dailyLimitMinutes}
            onChange={e =>
              setPrefs(p => ({ ...p, dailyLimitMinutes: Math.max(0, Number(e.target.value) || 0) }))
            }
            className="mt-2 w-full rounded-2xl bg-input px-4 py-3 outline-none"
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-foreground">ساعات الهدوء</span>
          <input
            type="checkbox"
            checked={prefs.quietHoursEnabled}
            onChange={e => setPrefs(p => ({ ...p, quietHoursEnabled: e.target.checked }))}
            className="h-5 w-5"
          />
        </label>
        {prefs.quietHoursEnabled ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">من</span>
              <input
                type="time"
                value={prefs.quietHoursStart}
                onChange={e => setPrefs(p => ({ ...p, quietHoursStart: e.target.value }))}
                className="mt-1 w-full rounded-xl bg-input px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">إلى</span>
              <input
                type="time"
                value={prefs.quietHoursEnd}
                onChange={e => setPrefs(p => ({ ...p, quietHoursEnd: e.target.value }))}
                className="mt-1 w-full rounded-xl bg-input px-3 py-2"
              />
            </label>
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-[#0095F6] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          حفظ
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          التذكيرات تُطبَّق على هذا الجهاز. الحد اليومي يُحسب من وقت فتح التطبيق.
        </p>
      </div>
    </div>
  );
}
