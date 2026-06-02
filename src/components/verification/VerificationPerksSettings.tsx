import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import {
  loadQuickReplies,
  saveQuickReplies,
  DEFAULT_QUICK_REPLIES_AR,
  type QuickReplyTemplate,
} from "@/lib/quickReplies";
import {
  loadScheduledPosts,
  addScheduledPost,
  removeScheduledPost,
  type ScheduledPostDraft,
} from "@/lib/scheduledPosts";
import type { Post, User } from "@/lib/types";
import { getApiToken, apiBackendEnabled } from "@/lib/apiBackend";

type Props = {
  onNeedSubscription: () => void;
};

export function VerificationPerksSettings({ onNeedSubscription }: Props) {
  const { currentUser, updateProfile, state } = useApp();
  const [quickReplies, setQuickReplies] = useState<QuickReplyTemplate[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPostDraft[]>([]);
  const [scheduleText, setScheduleText] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [pinPostId, setPinPostId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const ent = getUserEntitlements(currentUser);
    if (!ent.isSubscribed && !ent.isVerified) return;
    const saved = loadQuickReplies(currentUser.id);
    if (saved.length) setQuickReplies(saved);
    else {
      const defaults = DEFAULT_QUICK_REPLIES_AR.map((text, i) => ({
        id: `qr-${i}`,
        text,
      }));
      setQuickReplies(defaults);
      saveQuickReplies(currentUser.id, defaults);
    }
    setScheduled(loadScheduledPosts(currentUser.id));
    setPinPostId(currentUser.pinnedPostId || "");
  }, [currentUser?.id, currentUser?.pinnedPostId]);

  if (!currentUser) return null;
  const ent = getUserEntitlements(currentUser);
  const premium = ent.isSubscribed || ent.isVerified;

  if (!premium) return null;

  const myPosts = state.posts.filter(
    p => p.userId === currentUser.id && (p.type === "post" || p.type === "tweet"),
  );

  const persistProfile = (patch: Partial<User>) => {
    updateProfile(patch, { commitRemote: apiBackendEnabled() && !!getApiToken() });
    setMsg("تم الحفظ");
    window.setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="mx-4 mt-4 space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-[15px] font-semibold text-foreground">مزايا الاشتراك</h2>
      {msg ? <p className="text-xs text-[#0095F6]">{msg}</p> : null}

      {ent.canPinPost ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">تثبيت منشور في البروفايل</label>
          <select
            value={pinPostId}
            onChange={e => {
              const v = e.target.value;
              setPinPostId(v);
              persistProfile({ pinnedPostId: v || undefined });
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">بدون تثبيت</option>
            {myPosts.map(p => (
              <option key={p.id} value={p.id}>
                {p.text.slice(0, 48) || "منشور بدون نص"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {(ent.canRestrictComments || ent.canRestrictDm) && (
        <div className="space-y-3">
          {ent.canRestrictComments ? (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>تعطيل التعليقات على منشوراتي</span>
              <input
                type="checkbox"
                checked={!!currentUser.restrictComments}
                onChange={e => persistProfile({ restrictComments: e.target.checked })}
                className="h-5 w-5 accent-[#0095F6]"
              />
            </label>
          ) : null}
          {ent.canRestrictDm ? (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>الرسائل من غير المتابعين كطلبات فقط</span>
              <input
                type="checkbox"
                checked={!!currentUser.restrictDmFromNonFollowers}
                onChange={e => persistProfile({ restrictDmFromNonFollowers: e.target.checked })}
                className="h-5 w-5 accent-[#0095F6]"
              />
            </label>
          ) : null}
        </div>
      )}

      {ent.hasQuickReplies ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            ردود سريعة في الرسائل (حتى {ent.maxQuickReplies})
          </p>
          {quickReplies.slice(0, ent.maxQuickReplies).map((q, i) => (
            <input
              key={q.id}
              value={q.text}
              onChange={e => {
                const next = [...quickReplies];
                next[i] = { ...q, text: e.target.value };
                setQuickReplies(next);
                saveQuickReplies(currentUser.id, next);
              }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          ))}
        </div>
      ) : null}

      {ent.hasScheduledPosts ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">جدولة منشور</p>
          <textarea
            value={scheduleText}
            onChange={e => setScheduleText(e.target.value)}
            rows={2}
            placeholder="نص المنشور…"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
          />
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={e => setScheduleAt(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            className="rounded-xl bg-[#0095F6] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              const text = scheduleText.trim();
              const at = scheduleAt ? new Date(scheduleAt).getTime() : 0;
              if (!text || !at || at <= Date.now()) {
                setMsg("أدخل نصاً ووقتاً في المستقبل");
                return;
              }
              addScheduledPost(currentUser.id, { text, publishAt: at });
              setScheduled(loadScheduledPosts(currentUser.id));
              setScheduleText("");
              setScheduleAt("");
              setMsg("تمت الجدولة");
            }}
          >
            إضافة للجدولة
          </button>
          {scheduled.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {scheduled.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="truncate flex-1">{s.text}</span>
                  <button
                    type="button"
                    className="text-destructive shrink-0"
                    onClick={() => {
                      removeScheduledPost(currentUser.id, s.id);
                      setScheduled(loadScheduledPosts(currentUser.id));
                    }}
                  >
                    حذف
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!ent.isSubscribed && !ent.isVerified ? (
        <button
          type="button"
          className="text-sm text-[#0095F6] underline"
          onClick={onNeedSubscription}
        >
          ترقية الاشتراك لمزيد من المزايا
        </button>
      ) : null}
    </div>
  );
}

/** ينشر المنشورات المجدولة عند حلول وقتها */
export function useScheduledPostsPublisher(
  userId: string | undefined,
  createPostFn: (text: string) => void,
  hasScheduled: boolean,
) {
  useEffect(() => {
    if (!userId || !hasScheduled) return;
    const tick = () => {
      const now = Date.now();
      const due = loadScheduledPosts(userId).filter(p => p.publishAt <= now);
      if (!due.length) return;
      for (const p of due) {
        createPostFn(p.text);
        removeScheduledPost(userId, p.id);
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [userId, hasScheduled, createPostFn]);
}
