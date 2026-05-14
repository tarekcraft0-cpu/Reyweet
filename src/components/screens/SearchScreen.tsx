import { useEffect, useMemo, useState } from "react";
import { useApp, userById, trendingHashtags } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import type { Post, ProfileReturnContext } from "@/lib/types";
import { Avatar } from "../Avatar";
import { PostDetail } from "../PostDetail";
import { ShareSheet } from "../ShareSheet";
import { Search, BookOpen, Hash, Compass } from "lucide-react";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";

interface Props {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenQuranChat: () => void;
  onOpenChat: (chatId: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function SearchScreen({ onOpenProfile, onOpenQuranChat, onOpenChat }: Props) {
  const { state, currentUser, touchQuranBot, isGuest } = useApp();
  const t = useT();
  const [q, setQ] = useState("");
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [focusCommentsOnOpen, setFocusCommentsOnOpen] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const me = currentUser!;
  const list = state.users.filter(
    u =>
      u.id !== me.id &&
      !u.blocked.includes(me.id) &&
      !me.blocked.includes(u.id) &&
      (q === "" || u.username.toLowerCase().includes(q.toLowerCase())),
  );
  const tags = trendingHashtags(state);

  const explorePool = useMemo(
    () =>
      state.posts.filter(p => {
        if (p.type !== "post" && p.type !== "reel") return false;
        const author = userById(state, p.userId);
        if (!author) return false;
        if (author.blocked.includes(me.id) || me.blocked.includes(author.id)) return false;
        return true;
      }),
    [state.posts, state.users, me.id, me.blocked],
  );

  const explore = useMemo(() => shuffle(explorePool).slice(0, 30), [explorePool]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ProfileReturnContext>).detail;
      if (!d || d.tab !== "search") return;
      const p = state.posts.find(x => x.id === d.postId);
      if (p) {
        setFocusCommentsOnOpen(!!d.commentsOpen);
        setOpenPost(p);
      }
    };
    window.addEventListener("retweet-restore-post", handler);
    return () => window.removeEventListener("retweet-restore-post", handler);
  }, [state.posts]);

  if (openPost) {
    return (
      <PostDetail
        post={openPost}
        onBack={() => {
          setOpenPost(null);
          setFocusCommentsOnOpen(false);
        }}
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        profileReturnTab="search"
        initialFocusComments={focusCommentsOnOpen}
      />
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2 bg-input rounded-full px-4 py-2">
        <Search size={18} className="text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>

      <button
        type="button"
        onClick={() => {
          if (isGuest) {
            notifyGuestActionBlocked();
            return;
          }
          touchQuranBot();
          onOpenQuranChat();
        }}
        className="w-full flex items-center gap-3 p-3 bg-black text-white rounded-2xl border border-white/10"
      >
        <BookOpen size={28} />
        <div className="flex-1 text-start">
          <div className="font-bold">{t("quranChannel")}</div>
          <div className="text-xs opacity-90">شات مباشر · بوت طارق يرسل دعاء/آية كل فترة</div>
        </div>
        <span className="text-xs bg-white/20 px-2 py-1 rounded-full">LIVE</span>
      </button>

      {q === "" && tags.length > 0 && (
        <div>
          <h3 className="text-xs text-muted-foreground mb-2">{t("trending")}</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map(([tag, n]) => (
              <button key={tag} type="button" onClick={() => setQ(tag)} className="bg-secondary px-3 py-1.5 rounded-full text-sm flex items-center gap-1">
                <Hash size={14} /> {tag.replace("#", "")} <span className="text-xs text-muted-foreground">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {q === "" && explore.length > 0 && (
        <div>
          <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
            <Compass size={18} className="text-primary" />
            استكشف
          </h3>
          <p className="text-xs text-muted-foreground mb-3">منشورات وريلز من الجميع (ما عدا المحظورين) — شبكة ثلاث أعمدة</p>
          <div className="grid grid-cols-3 gap-1.5">
            {explore.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setFocusCommentsOnOpen(false);
                  setOpenPost(p);
                }}
                className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {isRenderableMediaUrl(p.image) ? (
                  <img src={p.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : isRenderableMediaUrl(p.video) ? (
                  <video src={p.video} className="absolute inset-0 w-full h-full object-cover" muted playsInline preload="metadata" />
                ) : p.image ? (
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">{p.image}</span>
                ) : p.video ? (
                  <span className="absolute inset-0 flex items-center justify-center text-3xl">🎬</span>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary to-muted text-2xl">📷</div>
                )}
                {p.type === "reel" && (
                  <span className="absolute bottom-1 end-1 text-[9px] font-bold bg-black/65 text-white px-1 py-0.5 rounded">REEL</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs text-muted-foreground">حسابات</h3>
        {list.map(u => (
          <button key={u.id} type="button" onClick={() => onOpenProfile(u.id)} className="w-full flex items-center gap-3 p-2 hover:bg-secondary rounded-2xl">
            <Avatar name={u.username} src={u.avatar} />
            <div className="text-start">
              <div className="font-semibold text-sm">@{u.username}</div>
              <div className="text-xs text-muted-foreground">{u.bio}</div>
            </div>
          </button>
        ))}
      </div>

      {q.startsWith("#") && (
        <div className="space-y-2">
          {state.posts
            .filter(p => p.text.includes(q))
            .map(p => {
              const u = userById(state, p.userId);
              return (
                <div key={p.id} className="p-3 border border-border rounded-2xl">
                  <div className="text-xs font-semibold">@{u?.username}</div>
                  <div className="text-sm">{p.text}</div>
                </div>
              );
            })}
        </div>
      )}

      {sharePost && <ShareSheet target={{ kind: "post", post: sharePost }} onClose={() => setSharePost(null)} />}
    </div>
  );
}
