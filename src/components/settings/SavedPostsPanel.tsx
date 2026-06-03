import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { apiListSavedPostIds, apiToggleSavedPost } from "@/lib/userExtrasApi";
import { apiBackendEnabled } from "@/lib/apiBackend";
import { SlideDismissBackButton } from "../SlideDismissShell";
import { ArrowRight } from "lucide-react";
import type { Post } from "@/lib/types";

export function SavedPostsPanel({
  onBack,
  onOpenPost,
}: {
  onBack: () => void;
  onOpenPost?: (postId: string) => void;
}) {
  const { state } = useApp();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      if (!apiBackendEnabled()) {
        setErr("يتطلب اتصالاً بالخادم");
        setLoading(false);
        return;
      }
      const r = await apiListSavedPostIds();
      setLoading(false);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setIds(r.savedPostIds);
    })();
  }, []);

  const posts = useMemo(() => {
    const map = new Map<string, Post>();
    for (const p of state.posts) map.set(p.id, p);
    return ids.map(id => map.get(id)).filter((p): p is Post => !!p);
  }, [ids, state.posts]);

  const remove = async (postId: string) => {
    const r = await apiToggleSavedPost(postId);
    if (r.ok && !r.saved) setIds(prev => prev.filter(x => x !== postId));
  };

  return (
    <div className="min-h-full bg-background pb-10" dir="rtl">
      <div className="sticky top-0 z-10 border-b border-border bg-background px-3 py-3 pt-[max(0.75rem,var(--sat))]">
        <SlideDismissBackButton navScope="local" onDismiss={onBack} className="mb-2 rounded-full p-2">
          <ArrowRight size={22} />
        </SlideDismissBackButton>
        <h1 className="text-[22px] font-bold text-foreground">المحفوظات</h1>
        <p className="mt-1 text-sm text-muted-foreground">منشورات وريلز حفظتها للمراجعة لاحقاً</p>
      </div>
      <div className="px-4 pt-4">
        {loading ? <p className="text-sm text-muted-foreground">جاري التحميل…</p> : null}
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        {!loading && !err && posts.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            لا توجد عناصر محفوظة بعد. احفظ ريلز أو منشورات من زر الحفظ.
          </p>
        ) : null}
        <ul className="space-y-2">
          {posts.map(p => (
            <li
              key={p.id}
              className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-start"
                onClick={() => onOpenPost?.(p.id)}
              >
                <p className="text-xs text-muted-foreground">{p.type === "reel" ? "ريل" : "منشور"}</p>
                <p className="mt-1 line-clamp-2 text-sm text-foreground">{p.text || "—"}</p>
              </button>
              <button
                type="button"
                className="shrink-0 text-xs font-semibold text-destructive"
                onClick={() => void remove(p.id)}
              >
                إزالة
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
