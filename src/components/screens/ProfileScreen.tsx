import { useEffect, useMemo, useRef, useState } from "react";
import { formatCompactCount } from "@/lib/formatCount";
import { useApp, userById, canViewProfile, canViewPrivatePosts } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useT } from "@/lib/i18n";
import type { HighlightEntry, StoryItem, Post, ProfileGridTab, ProfileReturnContext } from "@/lib/types";
import { ProfilePostsFeedOverlay } from "../profile/ProfilePostsFeedOverlay";
import { Avatar } from "../Avatar";
import { Grid3x3, Repeat2, Heart, Bookmark, ArrowRight, MoreVertical, Lock, Plus, Link as LinkIcon, Megaphone, ChevronLeft, ChevronRight } from "lucide-react";
import { VerifiedMarkForUser } from "../VerifiedBadge";
import { ProfileShareModal } from "../ProfileShareModal";
import { isRenderableMediaUrl } from "@/lib/mediaUrl";

interface Props {
  userId: string;
  onBack?: () => void;
  onEdit?: () => void;
  onOpenChat?: (userId: string) => void;
  onOpenChannel?: (chatId: string) => void;
  /** فتح بروفايل مستخدم آخر (مثلاً من تعليق داخل التغذية) مع سياق الرجوع */
  onOpenProfile?: (userId: string, ctx?: ProfileReturnContext) => void;
  /** فتح محادثة موجودة بالمعرّف (مثلاً بعد رد على نوت من المنشور) */
  onOpenExistingChat?: (chatId: string) => void;
}

function profilePostThumb(p: Post) {
  const vid = p.video?.trim();
  const img = p.image?.trim();
  const hasRenderableImage = isRenderableMediaUrl(img);
  if (vid && isRenderableMediaUrl(vid)) {
    return (
      <video
        src={vid}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        poster={hasRenderableImage ? img : undefined}
      />
    );
  }
  if (hasRenderableImage) {
    return <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  }
  if (vid) {
    return <span className="text-2xl text-muted-foreground">🎬</span>;
  }
  if (img) {
    return <span className="text-2xl text-muted-foreground">{img}</span>;
  }
  return <span className="text-2xl text-muted-foreground">📝</span>;
}

export function ProfileScreen({ userId, onBack, onEdit, onOpenChat, onOpenChannel, onOpenProfile, onOpenExistingChat }: Props) {
  const {
    state,
    currentUser,
    toggleFollow,
    toggleBlock,
    addHighlight,
    recordProfileVisit,
    acceptFollowRequest,
    declineFollowRequest,
    isGuest,
  } = useApp();
  const t = useT();
  const u = userById(state, userId);
  const [tab, setTab] = useState<ProfileGridTab>("posts");
  const [profileFeed, setProfileFeed] = useState<null | { orderedIds: string[]; initialIndex: number; gridTab: ProfileGridTab; scrollToComments?: boolean }>(null);
  const [showFollowers, setShowFollowers] = useState<"followers" | "following" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHL, setShowHL] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [hlView, setHlView] = useState<HighlightEntry | null>(null);
  const [hlSlide, setHlSlide] = useState(0);
  const visitRecordedFor = useRef<string | null>(null);

  useEffect(() => {
    setProfileFeed(null);
  }, [userId]);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<ProfileReturnContext>).detail;
      if (d.profileUserId !== userId || !d.profileGridTab) return;
      const uu = userById(state, userId);
      if (!uu) return;
      let list: Post[];
      if (d.profileGridTab === "posts") list = state.posts.filter(p => p.userId === userId);
      else if (d.profileGridTab === "reposts") list = state.posts.filter(p => p.reposts.includes(userId));
      else if (d.profileGridTab === "likes") list = state.posts.filter(p => p.likes.includes(userId));
      else list = state.posts.filter(p => uu.favorites.includes(p.id));
      const orderedIds = list.map(p => p.id);
      const idx = orderedIds.indexOf(d.postId);
      setTab(d.profileGridTab);
      if (idx >= 0)
        setProfileFeed({
          orderedIds,
          initialIndex: idx,
          gridTab: d.profileGridTab,
          scrollToComments: !!d.commentsOpen,
        });
      else setProfileFeed(null);
    };
    window.addEventListener("retweet-restore-profile-feed", h);
    return () => window.removeEventListener("retweet-restore-profile-feed", h);
  }, [userId, state.posts, state.users]);

  const myStoriesSorted = useMemo(() => {
    if (!currentUser) return [];
    return state.stories
      .filter(st => st.userId === currentUser.id)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [state.stories, currentUser]);

  const followerCountFormatted = useMemo(() => {
    const usr = userById(state, userId);
    if (!usr) return "0";
    const n = usr.displayFollowerCount ?? usr.followers.length;
    return formatCompactCount(n);
  }, [state.users, userId]);

  const myPosts = useMemo(() => state.posts.filter(p => p.userId === userId), [state.posts, userId]);
  const reposts = useMemo(() => state.posts.filter(p => p.reposts.includes(userId)), [state.posts, userId]);
  const likes = useMemo(() => state.posts.filter(p => p.likes.includes(userId)), [state.posts, userId]);
  const favorites = useMemo(() => {
    const usr = userById(state, userId);
    if (!usr) return [];
    return state.posts.filter(p => usr.favorites.includes(p.id));
  }, [state.posts, userId, state.users]);
  const tabPosts = tab === "posts" ? myPosts : tab === "reposts" ? reposts : tab === "likes" ? likes : favorites;

  const publicChannels = useMemo(() => {
    const usr = userById(state, userId);
    if (!usr) return [];
    const ids = usr.publicChannelIds || [];
    return ids.map(id => state.chats.find(c => c.id === id && c.isChannel)).filter(Boolean) as typeof state.chats;
  }, [userId, state.chats, state.users]);

  useEffect(() => {
    visitRecordedFor.current = null;
    setTab("posts");
  }, [userId]);

  useEffect(() => {
    const usr = userById(state, userId);
    if (!currentUser || !usr || currentUser.id === usr.id) return;
    if (visitRecordedFor.current === usr.id) return;
    visitRecordedFor.current = usr.id;
    recordProfileVisit(usr.id);
  }, [currentUser, userId, state.users, recordProfileVisit]);

  useEffect(() => {
    if (!hlView) return;
    const slides = hlView.slides?.length ? hlView.slides : [];
    if (hlSlide >= slides.length) setHlSlide(0);
  }, [hlView, hlSlide]);

  useEffect(() => {
    const usr = userById(state, userId);
    if (!usr) return;
    const showLikesFav = currentUser?.id === usr.id || usr.showLikesAndFavoritesOnProfile !== false;
    if (!showLikesFav && (tab === "likes" || tab === "favorites")) setTab("posts");
  }, [currentUser?.id, userId, state.users, tab]);

  if (!u) return null;

  const isMe = currentUser?.id === u.id;
  const canView = canViewProfile(state, currentUser?.id || null, u.id);
  const canSeePrivateContent = canViewPrivatePosts(state, currentUser?.id || null, u.id);
  const isFollowing = currentUser?.following.includes(u.id);
  const pendingFollowOut = !!(currentUser?.followRequestOut || []).includes(u.id);
  const isBlocked = currentUser?.blocked.includes(u.id);
  const isHiddenByBlock = !!(currentUser && currentUser.blocked.includes(u.id));
  /** صاحب الملف يرى تبويبي الإعجابات والمحفوظات دائماً؛ الزائر يرونهما فقط إذا لم يخفِهما المستخدم */
  const showLikesFavoritesToVisitors = isMe || u.showLikesAndFavoritesOnProfile !== false;
  /** زائر لا يرى أعداد/قوائم المتابعة إن فعّل صاحب الحساب الإخفاء */
  const hideFollowStatsFromVisitor = !isMe && u.hideFollowListsFromOthers === true;

  const shareProfile = () => setShowShareModal(true);

  const followLabel = isFollowing
    ? t("following")
    : pendingFollowOut
      ? "طلب مرسل"
      : u.isPrivate
        ? "طلب متابعة"
        : t("follow");

  const openHighlight = (h: HighlightEntry) => {
    let slides = h.slides?.length ? [...h.slides] : [];
    if (slides.length === 0 && (h.storyIds || []).length > 0) {
      slides = (h.storyIds || [])
        .map(id => state.stories.find(s => s.id === id))
        .filter((st): st is StoryItem => !!st)
        .map(st => (st.video ? { image: st.image, video: st.video } : { image: st.image }));
    }
    if (slides.length === 0) return;
    setHlSlide(0);
    setHlView({ ...h, slides });
  };

  const hlSlides = hlView?.slides?.length ? hlView.slides : [];

  return (
    <div className="pb-4">
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button type="button" onClick={onBack} className="shrink-0 p-1 rounded-full hover:bg-secondary active:opacity-90">
              <ArrowRight />
            </button>
          )}
          {!isMe && (
            <div className="font-semibold truncate flex items-center gap-1 min-w-0">
              @{u.username}
              <VerifiedMarkForUser user={u} size={14} />
            </div>
          )}
        </div>
        {!isMe && (
          <div className="relative">
            <button onClick={() => setMenuOpen(o => !o)}><MoreVertical /></button>
            {menuOpen && (
              <div className="absolute end-0 mt-1 bg-card border border-border rounded-2xl shadow-lg z-20 w-44 overflow-hidden">
                <button onClick={() => { if (isGuest) { notifyGuestActionBlocked(); setMenuOpen(false); return; } toggleBlock(u.id); setMenuOpen(false); alert(isBlocked ? t("unblock") : t("blocked")); }} className="w-full text-start px-3 py-2 hover:bg-secondary text-destructive text-sm">
                  {isBlocked ? t("unblock") : t("block")} @{u.username}
                </button>
                <button onClick={() => { shareProfile(); setMenuOpen(false); }} className="w-full text-start px-3 py-2 hover:bg-secondary text-sm">{t("share")}</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-2">
        <div className="flex items-center gap-6">
          <Avatar name={u.username} src={u.avatar} size={84} />
          <div className="flex-1 grid grid-cols-3 text-center">
            <div>
              <div className="font-bold">{isHiddenByBlock ? "—" : formatCompactCount(myPosts.length)}</div>
              <div className="text-xs text-muted-foreground">منشورات</div>
            </div>
            {hideFollowStatsFromVisitor ? (
              <>
                <div>
                  <div className="font-bold">—</div>
                  <div className="text-xs text-muted-foreground">{t("followers")}</div>
                </div>
                <div>
                  <div className="font-bold">—</div>
                  <div className="text-xs text-muted-foreground">{t("followsCount")}</div>
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={() => canView && canSeePrivateContent && !isHiddenByBlock && setShowFollowers("followers")}>
                  <div className="font-bold">{isHiddenByBlock ? "—" : followerCountFormatted}</div>
                  <div className="text-xs text-muted-foreground">{t("followers")}</div>
                </button>
                <button type="button" onClick={() => canView && canSeePrivateContent && !isHiddenByBlock && setShowFollowers("following")}>
                  <div className="font-bold">{isHiddenByBlock ? "—" : formatCompactCount(u.following.length)}</div>
                  <div className="text-xs text-muted-foreground">{t("followsCount")}</div>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm whitespace-pre-wrap mt-0">{u.bio}</div>
            {u.profileLink?.trim() && (
              <a href={u.profileLink.startsWith("http") ? u.profileLink : `https://${u.profileLink}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary break-all">
                <LinkIcon size={14} /> {u.profileLink}
              </a>
            )}
          </div>
        </div>

        {isMe && (u.followRequestIn || []).length > 0 && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-3 space-y-2">
            <div className="text-sm font-semibold">طلبات متابعة</div>
            {(u.followRequestIn || []).map(id => {
              const req = userById(state, id);
              if (!req) return null;
              return (
                <div key={id} className="flex items-center gap-2 flex-wrap">
                  <Avatar name={req.username} src={req.avatar} size={36} />
                  <span className="text-sm flex-1 min-w-0 truncate">@{req.username}</span>
                  <button type="button" className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-full" onClick={() => { if (isGuest) { notifyGuestActionBlocked(); return; } acceptFollowRequest(id); }}>قبول</button>
                  <button type="button" className="text-xs bg-secondary px-3 py-1.5 rounded-full" onClick={() => { if (isGuest) { notifyGuestActionBlocked(); return; } declineFollowRequest(id); }}>رفض</button>
                </div>
              );
            })}
          </div>
        )}

        {publicChannels.length > 0 && canView && canSeePrivateContent && !isHiddenByBlock && (
          <div className="mt-4">
            <div className="text-xs text-muted-foreground mb-2">القناة</div>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {publicChannels.map(ch => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => onOpenChannel?.(ch.id)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-secondary/35 px-2 py-1 max-w-[9.5rem] hover:bg-secondary/60 active:scale-[0.98] transition"
                >
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {ch.avatar?.startsWith("data:") ? <img src={ch.avatar} alt="" className="w-full h-full object-cover" /> : <Megaphone size={12} className="text-muted-foreground" />}
                  </div>
                  <span className="text-[11px] font-medium leading-tight truncate text-start">{ch.name || "قناة"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isMe ? (
          <div className="flex gap-2 mt-4">
            <button onClick={onEdit} className="flex-1 bg-primary text-primary-foreground py-2 rounded-2xl font-semibold text-sm">تعديل البروفايل</button>
            <button onClick={shareProfile} className="flex-1 bg-secondary py-2 rounded-2xl font-semibold text-sm">مشاركة البروفايل</button>
          </div>
        ) : (
          <div className="flex gap-2 mt-4">
            {canView && !isHiddenByBlock && (
              <>
                <button
                  onClick={() => {
                    if (isGuest) {
                      notifyGuestActionBlocked();
                      return;
                    }
                    toggleFollow(u.id);
                  }}
                  className={"flex-1 py-2 rounded-2xl font-semibold text-sm " + (isFollowing || pendingFollowOut ? "bg-secondary" : "bg-primary text-primary-foreground")}
                >
                  {followLabel}
                </button>
                {canSeePrivateContent && (
                  <button
                    onClick={() => {
                      if (isGuest) {
                        notifyGuestActionBlocked();
                        return;
                      }
                      onOpenChat?.(u.id);
                    }}
                    className="flex-1 bg-secondary py-2 rounded-2xl font-semibold text-sm"
                  >
                    {t("message")}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {canView && canSeePrivateContent && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar mt-4">
            {isMe && (
              <button type="button" onClick={() => setShowHL(true)} className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-2xl border-2 border-dashed border-muted-foreground/40"><Plus /></div>
                <span className="text-xs">جديد</span>
              </button>
            )}
            {u.highlights.map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => openHighlight(h)}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-3xl overflow-hidden border border-border">
                  {h.coverImage?.startsWith("data:") ? (
                    <img src={h.coverImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{h.cover}</span>
                  )}
                </div>
                <span className="text-xs max-w-[4.5rem] truncate">{h.title}</span>
              </button>
            ))}
          </div>
        )}

        {!canView || isHiddenByBlock ? (
          <div className="text-center py-12 text-muted-foreground">
            <Lock className="mx-auto mb-2" /> {isHiddenByBlock ? "هذا الحساب محظور عندك" : t("locked")}
          </div>
        ) : !canSeePrivateContent ? (
          <div className="text-center py-12 text-muted-foreground">
            <Lock className="mx-auto mb-2" /> حساب خاص — اقبل المتابعة أو أرسل طلب متابعة لعرض المنشورات
          </div>
        ) : (
          <>
            <div className={(showLikesFavoritesToVisitors ? "grid-cols-4" : "grid-cols-2") + " grid mt-6 border-b border-border"}>
              {(showLikesFavoritesToVisitors
                ? ([
                    { k: "posts" as const, icon: Grid3x3 },
                    { k: "reposts" as const, icon: Repeat2 },
                    { k: "likes" as const, icon: Heart },
                    { k: "favorites" as const, icon: Bookmark },
                  ] as const)
                : ([
                    { k: "posts" as const, icon: Grid3x3 },
                    { k: "reposts" as const, icon: Repeat2 },
                  ] as const)
              ).map(({ k, icon: Icon }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={"py-3 flex justify-center " + (tab === k ? "border-b-2 border-primary -mb-px" : "")}
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-px bg-border">
              {tabPosts.map((p, index) => {
                const isRp = tab === "reposts";
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setProfileFeed({ orderedIds: tabPosts.map(x => x.id), initialIndex: index, gridTab: tab })}
                    className="aspect-square bg-background relative flex w-full items-center justify-center overflow-hidden border-0 p-0 cursor-pointer text-inherit active:opacity-90 hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
                  >
                    {profilePostThumb(p)}
                    {isRp && (
                      <span className="pointer-events-none absolute end-1 top-1 z-[1] rounded-full bg-black/60 p-0.5 text-white shadow">
                        <Repeat2 size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showFollowers && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setShowFollowers(null)}>
          <div
            className="bg-background w-full max-w-md mx-auto rounded-t-3xl p-4 max-h-[70vh] overflow-y-auto overflow-x-hidden"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-center mb-3">{showFollowers === "followers" ? t("followers") : t("followsCount")}</h3>
            {showFollowers === "followers" && u.displayFollowerCount != null && u.followers.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground leading-relaxed">
                يُعرض هنا العدد الإجمالي للمتابعين فقط؛ قائمة الأسماء غير متوفرة في النسخة التجريبية.
              </p>
            ) : (
              (showFollowers === "followers" ? u.followers : u.following).map(id => {
                const x = userById(state, id);
                return x ? (
                  <div key={id} className="flex items-center gap-3 p-2">
                    <Avatar name={x.username} src={x.avatar} />
                    <div className="flex-1 text-start">
                      <div className="font-semibold text-sm">@{x.username}</div>
                      <div className="text-xs text-muted-foreground">{x.bio}</div>
                    </div>
                  </div>
                ) : null;
              })
            )}
          </div>
        </div>
      )}

      {showHL && isMe && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end justify-center" onClick={() => setShowHL(false)}>
          <div
            className="bg-background w-full max-w-md mx-auto rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto overflow-x-hidden space-y-3 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-bold text-center">هايلايت جديد</h3>
            <HighlightForm
              stories={myStoriesSorted}
              onSave={p => {
                addHighlight(p);
                setShowHL(false);
              }}
              onClose={() => setShowHL(false)}
            />
          </div>
        </div>
      )}

      {hlView && hlSlides.length > 0 && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col" onClick={() => setHlView(null)}>
          <div className="flex items-center justify-between p-3 text-white shrink-0" onClick={e => e.stopPropagation()}>
            <button type="button" className="p-2 rounded-full hover:bg-white/10" aria-label="إغلاق" onClick={() => setHlView(null)}>
              <ArrowRight size={22} />
            </button>
            <span className="font-semibold truncate px-2">{hlView.title}</span>
            <span className="w-10" />
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0 relative" onClick={e => e.stopPropagation()}>
            {hlSlide > 0 && (
              <button type="button" className="absolute start-2 z-10 p-2 rounded-full bg-black/40 text-white" onClick={() => setHlSlide(s => Math.max(0, s - 1))}>
                <ChevronRight size={28} />
              </button>
            )}
            {hlSlide < hlSlides.length - 1 && (
              <button type="button" className="absolute end-2 z-10 p-2 rounded-full bg-black/40 text-white" onClick={() => setHlSlide(s => Math.min(hlSlides.length - 1, s + 1))}>
                <ChevronLeft size={28} />
              </button>
            )}
            {hlSlides[hlSlide]?.video ? (
              <video src={hlSlides[hlSlide].video} controls playsInline className="max-h-[78vh] max-w-full object-contain" />
            ) : (
              <img src={hlSlides[hlSlide].image} alt="" className="max-h-[78vh] max-w-full object-contain" />
            )}
          </div>
          <div className="text-center text-white/80 text-xs pb-4">{hlSlide + 1} / {hlSlides.length}</div>
        </div>
      )}

      {showShareModal && <ProfileShareModal userId={u.id} onClose={() => setShowShareModal(false)} />}

      {profileFeed && onOpenProfile && onOpenExistingChat && (
        <ProfilePostsFeedOverlay
          postIds={profileFeed.orderedIds}
          initialIndex={profileFeed.initialIndex}
          profileOwnerId={u.id}
          gridTab={profileFeed.gridTab}
          initialCommentsOpen={!!profileFeed.scrollToComments}
          onClose={() => setProfileFeed(null)}
          onOpenProfile={onOpenProfile}
          onOpenChat={onOpenExistingChat}
        />
      )}
    </div>
  );
}

function HighlightForm({
  stories,
  onSave,
  onClose,
}: {
  stories: StoryItem[];
  onSave: (p: { title: string; cover: string; coverImage?: string; storyIds: string[] }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [cover, setCover] = useState("⭐");
  const [coverImage, setCoverImage] = useState<string | undefined>();
  const [selected, setSelected] = useState<string[]>([]);

  const pickCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setCoverImage(String(r.result));
    r.readAsDataURL(f);
  };

  const addLatestStory = () => {
    const first = stories[0];
    if (!first) return;
    setSelected([first.id]);
  };

  const save = () => {
    if (!title.trim() || selected.length === 0) return;
    onSave({ title: title.trim(), cover, coverImage, storyIds: selected });
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-3">
      <button type="button" onClick={onClose} className="text-sm text-muted-foreground w-full text-center mb-1">إلغاء</button>
      <div className="flex justify-center">
        <span className="text-5xl bg-secondary rounded-full w-20 h-20 flex items-center justify-center overflow-hidden shrink-0">
          {coverImage?.startsWith("data:") ? <img src={coverImage} alt="" className="w-full h-full object-cover" /> : cover}
        </span>
      </div>
      <div className="flex gap-2 justify-center flex-wrap max-w-full">
        {["⭐", "✈️", "🎉", "❤️", "🌸", "🎨", "🎬", "🍔"].map(e => (
          <button key={e} type="button" onClick={() => setCover(e)} className="text-2xl p-1 rounded-lg hover:bg-secondary shrink-0">{e}</button>
        ))}
      </div>
      <label className="block text-center text-sm min-w-0 max-w-full">
        <span className="text-primary font-medium">صورة غلاف الهايلايت</span>
        <input type="file" accept="image/*" className="block w-full max-w-full mt-1 text-xs min-w-0" onChange={pickCoverFile} />
      </label>
      <button type="button" onClick={addLatestStory} className="w-full max-w-full py-2 rounded-2xl bg-secondary text-sm font-medium">
        إضافة آخر ستوري للهايلايت
      </button>
      <div className="max-h-40 overflow-y-auto overflow-x-hidden bg-card rounded-2xl p-2 space-y-2 border border-border min-w-0 max-w-full">
        <p className="text-xs text-muted-foreground break-words">اختر ستوري واحد أو أكثر (تُحفظ نسخة دائمة في الهايلايت)</p>
        {stories.map(st => (
          <label key={st.id} className="flex items-center gap-2 text-sm min-w-0 max-w-full">
            <input
              type="checkbox"
              className="shrink-0"
              checked={selected.includes(st.id)}
              onChange={() => setSelected(s => s.includes(st.id) ? s.filter(x => x !== st.id) : [...s, st.id])}
            />
            <span className="min-w-0 flex-1 truncate">
              {st.video ? "🎬 فيديو" : st.image.startsWith("data:") ? "📸 صورة" : st.image}
            </span>
          </label>
        ))}
        {stories.length === 0 && <p className="text-xs text-muted-foreground text-center">ما عندك ستوريات حالياً</p>}
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="اسم الهايلايت" className="w-full max-w-full min-w-0 box-border bg-input rounded-2xl px-3 py-2 outline-none" />
      <button type="button" onClick={save} className="w-full max-w-full py-2 rounded-2xl bg-primary text-primary-foreground font-semibold">حفظ</button>
    </div>
  );
}
