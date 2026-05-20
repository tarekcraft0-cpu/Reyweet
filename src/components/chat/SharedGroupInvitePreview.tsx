import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Avatar } from "../Avatar";
import { useApp } from "@/lib/store";
import { apiBackendEnabled, apiFetchGroupInvitePreview, getApiToken } from "@/lib/apiBackend";

export function SharedGroupInvitePreview({
  inviteCode,
  onJoined,
}: {
  inviteCode: string;
  onJoined?: (chatId: string) => void;
}) {
  const { joinGroupByInviteCode } = useApp();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{
    name: string;
    avatar: string;
    memberCount: number;
    isPublicGroup: boolean;
    alreadyMember: boolean;
  } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const token = getApiToken();
    if (!token || !apiBackendEnabled()) {
      setErr("الخادم غير متصل");
      return;
    }
    let cancelled = false;
    void (async () => {
      const row = await apiFetchGroupInvitePreview(token, inviteCode);
      if (cancelled) return;
      if (row) {
        setInfo({
          name: row.name,
          avatar: row.avatar,
          memberCount: row.memberCount,
          isPublicGroup: row.isPublicGroup,
          alreadyMember: row.alreadyMember,
        });
        setErr("");
      } else {
        setErr("رابط مجموعة غير صالح");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const join = async () => {
    setBusy(true);
    setErr("");
    const res = await joinGroupByInviteCode(inviteCode);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    onJoined?.(res.chatId);
  };

  if (err && !info) {
    return (
      <div className="rounded-2xl bg-muted/40 p-3 text-center text-xs text-muted-foreground">{err}</div>
    );
  }

  if (!info) {
    return <div className="rounded-2xl bg-muted/40 p-3 text-center text-xs text-muted-foreground">…</div>;
  }

  return (
    <div className="w-full max-w-[min(96vw,340px)] overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={info.name} src={info.avatar} size={52} />
        <div className="min-w-0 flex-1 text-start">
          <div className="truncate font-semibold">{info.name}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={14} />
            {info.memberCount} عضو
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {info.isPublicGroup ? "مجموعة عامة" : "مجموعة خاصة — طلب انضمام"}
          </p>
        </div>
      </div>
      {!info.alreadyMember && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void join()}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "…" : info.isPublicGroup ? "انضمام للمجموعة" : "طلب انضمام"}
        </button>
      )}
      {info.alreadyMember && (
        <p className="mt-3 text-center text-xs text-primary font-medium">أنت عضو في هذه المجموعة</p>
      )}
      {err && <p className="mt-2 text-center text-xs text-destructive">{err}</p>}
    </div>
  );
}
