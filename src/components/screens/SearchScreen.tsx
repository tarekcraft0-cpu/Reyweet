import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp, userById, trendingHashtags } from "@/lib/store";
import { rankUsersBySearchQuery } from "@/lib/searchRank";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import type { Post, ProfileReturnContext, User } from "@/lib/types";
import { Avatar } from "../Avatar";
import { PostDetail } from "../PostDetail";
import { ShareSheet } from "../ShareSheet";
import { Search, BookOpen, Hash, MoreHorizontal } from "lucide-react";
import { formatTrendPostCount } from "@/lib/rsocialUi";
import { userDisplayName } from "@/lib/userDisplay";
import { PostGridThumbnail } from "../PostGridThumbnail";
import { isGuestUserId } from "@/lib/guestUser";
import {
  apiBackendEnabled,
  apiFetchUserDirectory,
  apiSearchUsers,
  getApiToken,
  userFromSearchResult,
} from "@/lib/apiBackend";
import { USER_REGISTERED_WINDOW_EVENT } from "@/lib/realtimeEvents";

interface Props {
  onOpenProfile: (id: string, ctx?: ProfileReturnContext) => void;
  onOpenQuranChat: () => void;
  onOpenChat: (chatId: string) => void;
  restoreFromProfileContext?: ProfileReturnContext | null;
  onConsumedRestoreFromProfile?: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isBlockedBetween(me: User, other: User): boolean {
  return other.blocked.includes(me.id) || me.blocked.includes(other.id);
}

export function SearchScreen({
  onOpenProfile,
  onOpenQuranChat,
  onOpenChat,
  restoreFromProfileContext = null,
  onConsumedRestoreFromProfile,
}: Props) {
  const { state, currentUser, touchQuranBot, isGuest, mergeDiscoveredUsers, refreshUserDirectory } = useApp();
  const t = useT();
  const [q, setQ] = useState("");
  const [remoteHits, setRemoteHits] = useState<User[]>([]);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [focusCommentsOnOpen, setFocusCommentsOnOpen] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const searchSeqRef = useRef(0);
  const me = currentUser!;
  const qq = q.trim();

  const runServerSearch = useCallback(
    async (query: string) => {
      if (!apiBackendEnabled() || !getApiToken() || isGuest) {
        setRemoteHits([]);
        setSearching(false);
        return;
      }
      const seq = ++searchSeqRef.current;
      setSearching(true);
      const rows = await apiSearchUsers(query);
      if (seq !== searchSeqRef.current) return;
      const users = rows.map(userFromSearchResult);
      setRemoteHits(users);
      mergeDiscoveredUsers(users);
      setSearching(false);
    },
    [isGuest, mergeDiscoveredUsers],
  );

  const loadRecentFromServer = useCallback(async () => {
    if (!apiBackendEnabled() || !getApiToken() || isGuest) {
      setRecentUsers([]);
      return;
    }
    const rows = await apiFetchUserDirectory();
    const users = rows.map(userFromSearchResult);
    setRecentUsers(users);
    mergeDiscoveredUsers(users);
  }, [isGuest, mergeDiscoveredUsers]);

  useEffect(() => {
    void refreshUserDirectory();
  }, [refreshUserDirectory]);

  useEffect(() => {
    if (!qq) {
      setRemoteHits([]);
      setSearching(false);
      void loadRecentFromServer();
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void runServerSearch(qq);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [qq, isGuest, runServerSearch, loadRecentFromServer]);

  useEffect(() => {
    const onRegistered = () => {
      if (qq) void runServerSearch(qq);
      else void loadRecentFromServer();
    };
    window.addEventListener(USER_REGISTERED_WINDOW_EVENT, onRegistered);
    return () => window.removeEventListener(USER_REGISTERED_WINDOW_EVENT, onRegistered);
  }, [qq, runServerSearch, loadRecentFromServer]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (qq) void runServerSearch(qq);
      else void loadRecentFromServer();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [qq, runServerSearch, loadRecentFromServer]);

  const accountList = useMemo(() => {
    const source = qq ? remoteHits : recentUsers;
    const byId = new Map<string, User>();
    for (const u of source) {
      if (u.id === me.id || isGuestUserId(u.id) || isBlockedBetween(me, u)) continue;
      byId.set(u.id, u);
    }
    if (qq) {
      for (const u of state.users) {
        if (u.id === me.id || isGuestUserId(u.id) || isBlockedBetween(me, u)) continue;
        const un = u.username.toLowerCase();
        const ql = qq.toLowerCase();
        if (!un.includes(ql) && !u.email?.toLowerCase().includes(ql)) continue;
        if (!byId.has(u.id)) byId.set(u.id, u);
      }
    }
    return rankUsersBySearchQuery([...byId.values()], qq);
  }, [qq, remoteHits, recentUsers, state.users, me]);

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

  useLayoutEffect(() => {
    if (!restoreFromProfileContext || restoreFromProfileContext.tab !== "search") return;
    const d = restoreFromProfileContext;
    onConsumedRestoreFromProfile?.();
    if (!d.postId || !d.homeSurface) return;
    const p = state.posts.find(x => x.id === d.postId);
    if (!p) return;
    setFocusCommentsOnOpen(!!d.commentsOpen);
    setOpenPostId(d.postId);
  }, [restoreFromProfileContext, state.posts, onConsumedRestoreFromProfile]);

  const openPost = useMemo(
    () => (openPostId ? state.posts.find(p => p.id === openPostId) ?? null : null),
    [openPostId, state.posts],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-background">
    <div
      className={
        "flex min-h-full flex-1 flex-col bg-white dark:bg-background " +
        (openPost ? "pointer-events-none select-none" : "")
      }
      aria-hidden={openPost ? true : undefined}
    >
      <h1 className="px-4 pt-3 text-[2rem] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Explore</h1>
      <div className="px-4 mt-3">
        <div className="flex items-center gap-2 rounded-full bg-zinc-100 dark:bg-zinc-800/80 px-4 py-3">
          <Search size={18} className="text-zinc-400 shrink-0" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search R - Social"
            className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {q === "" && tags.length > 0 && (
        <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100">
          {tags.slice(0, 12).map(([tag, n], i) => (
            <button
              key={tag}
              type="button"
              onClick={() => setQ(tag)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-start hover:bg-zinc-50 active:bg-zinc-100"
            >
              <span className="w-6 text-center text-sm font-medium text-zinc-400 tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-zinc-900">{tag.startsWith("#") ? tag : `#${tag.replace(/^#/, "")}`}</div>
                <div className="text-sm text-zinc-500">{formatTrendPostCount(n)}</div>
              </div>
              <MoreHorizontal size={18} className="text-zinc-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

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
          <div className="text-xs opacity-90">شات مباشر · بوت طارق يرسل أدعية كل فترة</div>
        </div>
        <span className="text-xs bg-white/20 px-2 py-1 rounded-full">LIVE</span>
      </button>

      {qq ? (
      <div className="space-y-2 px-4 mt-4">
        <h3 className="text-xs text-muted-foreground">
          {qq ? "نتائج البحث" : "حسابات جديدة"}
        </h3>
        {searching && accountList.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">جاري التحديث من الخادم…</p>
        )}
        {!searching && accountList.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            {qq ? "لا توجد حسابات مطابقة" : "لا توجد حسابات بعد"}
          </p>
        )}
        {accountList.map(u => (
          <button key={u.id} type="button" onClick={() => onOpenProfile(u.id)} className="w-full flex items-center gap-3 p-2 hover:bg-secondary rounded-2xl">
            <Avatar name={u.username} src={u.avatar} />
            <div className="min-w-0 text-start">
              <div className="truncate text-sm font-semibold">{userDisplayName(u)}</div>
              <div className="truncate text-xs text-muted-foreground" dir="ltr">@{u.username}</div>
              {u.bio ? <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{u.bio}</div> : null}
            </div>
          </button>
        ))}
      </div>
      ) : null}

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

    {openPost && (
      <PostDetail
        post={openPost}
        onBack={() => {
          setOpenPostId(null);
          setFocusCommentsOnOpen(false);
        }}
        onOpenProfile={onOpenProfile}
        onOpenChat={onOpenChat}
        profileReturnTab="search"
        initialFocusComments={focusCommentsOnOpen}
      />
    )}
    </div>
  );
}
