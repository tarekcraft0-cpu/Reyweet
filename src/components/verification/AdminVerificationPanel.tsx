import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import {
  apiAdminApproveVerification,
  apiAdminListVerificationRequests,
  apiAdminRejectVerification,
  type AdminVerificationRequest,
} from "@/lib/verificationApi";
import { getApiToken } from "@/lib/apiBackend";
import { RSocialAvatar } from "../rsocial/RSocialAvatar";

export function AdminVerificationPanel() {
  const [requests, setRequests] = useState<AdminVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getApiToken();
    if (!token) return;
    setLoading(true);
    const r = await apiAdminListVerificationRequests(token);
    setLoading(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setErr(null);
    setRequests(r.requests);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    const token = getApiToken();
    if (!token) return;
    const r =
      action === "approve"
        ? await apiAdminApproveVerification(token, id)
        : await apiAdminRejectVerification(token, id);
    if (!r.ok) {
      alert(r.error);
      return;
    }
    await load();
  };

  if (loading) return <p className="px-4 py-6 text-sm text-muted-foreground">جاري التحميل…</p>;
  if (err) return <p className="px-4 py-6 text-sm text-destructive">{err}</p>;
  if (requests.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">لا توجد طلبات معلّقة</p>;
  }

  return (
    <div className="mx-4 mt-4 space-y-3">
      <h2 className="text-[15px] font-semibold text-foreground">لوحة طلبات التوثيق</h2>
      {requests.map(req => (
        <div key={req.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <RSocialAvatar name={req.username} src={req.avatar} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">@{req.username}</p>
              <p className="truncate text-xs text-muted-foreground">{req.email}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void act(req.id, "approve")}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#0095F6] py-2 text-xs font-semibold text-white"
            >
              <Check size={16} />
              قبول
            </button>
            <button
              type="button"
              onClick={() => void act(req.id, "reject")}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-secondary py-2 text-xs font-semibold text-foreground"
            >
              <X size={16} />
              رفض
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
