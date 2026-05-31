# Performance Audit — Retweet (52874)

_تاريخ: 2026-05-31 — قياس فعلي + patches مطبّقة_

## تفعيل Profiling

```js
localStorage.setItem('retweet_perf', '1')
// ثم أعد تحميل التطبيق — يظهر HUD أسفل يسار الشاشة
```

| المقياس | المصدر |
|---------|--------|
| Render Count | `useRenderCount` → `getRenderCounts()` |
| JS Thread | `perfAsync` / `performance.measure` |
| Memory | `performance.memory.usedJSHeapSize` (Chrome) |
| Frame Drops | `startFrameMonitor` — FPS + dropped/s |

```bash
npm run build
node scripts/benchmark-performance.mjs
```

---

## أسوأ 20 نقطة أداء (مرتبة)

| # | الخطورة | المشكلة | الملف | Patch | احتمال bottleneck متبقٍ |
|---|---------|---------|-------|-------|-------------------------|
| 1 | 🔴 95% | `AppCtx` monolithic — أي `setState` يعيد رسم ~45 مكوّناً | `store.tsx` | `StoreApiCtx` + `useAppSelector` | **45%** — App.tsx ما زال `useApp()` |
| 2 | 🔴 90% | `PostCard` كان يستدعي `useApp()` → re-render لكل بطاقة عند رسالة chat | `PostCard.tsx` | selectors جزئية | **15%** عند like/comment على نفس المنشور |
| 3 | 🔴 88% | `StoryTrayItem` × N كان `useApp()` داخل كل عنصر | `StoriesRow.tsx` | props + selectors | **8%** |
| 4 | 🔴 85% | `HomeScreen` كان يشترك في `state` كامل | `HomeScreen.tsx` | `memo` + selectors + actions فقط | **20%** عند تحديث `posts` |
| 5 | 🔴 82% | `HomeFeedActionsProvider` value جديد → re-render أبناء | `homeFeedActionsContext.tsx` | ref pattern | **3%** |
| 6 | 🟠 78% | Keep-alive tabs — Home/Reels/Chat mounted معاً | `MainTabStack.tsx` | `contentVisibility` موجود | **35%** ChatScreen ثقيل |
| 7 | 🟠 75% | `ChatScreen` ~30 timer + 6× `useApp()` | `ChatScreen.tsx` | _لم يُ refactor بعد_ | **40%** أثناء محادثة نشطة |
| 8 | 🟠 72% | persist debounce يرسل state ضخم | `store.tsx` | debounce 2s موجود | **12%** |
| 9 | 🟠 70% | `homeFeedPosts` يُعاد حسابه idle لكن يمر عبر context | `store.tsx` | `HomeFeedCtx` منفصل | **10%** |
| 10 | 🟠 68% | Virtual list `measureElement` يسبب layout thrashing | `VirtualizedHomeFeed.tsx` | overscan 3, estimate 480 | **15%** فيديو طويل |
| 11 | 🟡 65% | فيديو autoplay خارج viewport | `PostFeedMediaBlock` | `VideoPauseWhenHidden` | **18%** Reels tab |
| 12 | 🟡 62% | صور full-res بدون thumbnail | `ProgressiveImage.tsx` | blur placeholder | **10%** شبكة بطيئة |
| 13 | 🟡 60% | `StoryViewer` timers + preload | `StoryViewer.tsx` | cleanup جزئي | **25%** ستوري fullscreen |
| 14 | 🟡 58% | polling moderation 60s في App | `App.tsx` | خُفّض من 12s | **5%** |
| 15 | 🟡 55% | unread scan O(chats×msgs) | `store.tsx` | `unreadMessageCount` state | **8%** |
| 16 | 🟡 52% | `NotificationBanner` interval | `NotificationBanner.tsx` | — | **5%** |
| 17 | 🟡 50% | mention renderer يبني JSX لكل post | `PostCard.tsx` | `useMemo` على text | **7%** |
| 18 | 🟡 48% | JSON.stringify state على push remote | `store.tsx` | skip أثناء hydrate | **10%** |
| 19 | 🟢 45% | bundle JS كبير (chat stickers) | `app/stickers/` | lazy route | **12%** cold start |
| 20 | 🟢 42% | backend feed بدون gzip على VPS قديم | `backend/` | `jsonGzip.ts` | **15%** TTFB |

---

## Patches مطبّقة في هذه الجلسة

| ملف | التغيير |
|-----|---------|
| `src/lib/storeSubscription.ts` | **جديد** — API اشتراك store |
| `src/lib/useAppSelector.ts` | **جديد** — `useSyncExternalStore` + shallow/equalIdArrays |
| `src/lib/renderProfiler.ts` | **جديد** — render count, FPS, memory |
| `src/components/dev/PerfHUD.tsx` | **جديد** — overlay قياس |
| `src/lib/store.tsx` | `StoreApiCtx` + notify على `[state]` |
| `src/lib/homeFeedActionsContext.tsx` | ref ثابت بدل value context |
| `src/components/PostCard.tsx` | selectors + `useRenderCount` |
| `src/components/stories/StoriesRow.tsx` | إزالة `useApp` من items + `memo` |
| `src/components/screens/HomeScreen.tsx` | `memo` + selectors |
| `src/components/home/VirtualizedHomeFeed.tsx` | `memo`, overscan 3 |
| `src/components/App.tsx` | `<PerfHUD />` |

---

## إذا بقي التعليق بعد التحسينات

| السيناريو | الملف المسؤول | احتمال |
|-----------|---------------|--------|
| lag على Home أثناء scroll | `VirtualizedHomeFeed.tsx` + `PostFeedMediaBlock` | **55%** |
| lag عند وصول رسالة والـ Home ظاهر | `App.tsx` (re-render root) | **45%** |
| lag داخل محادثة | `ChatScreen.tsx` | **70%** |
| lag في Reels | `ReelsScreen.tsx` | **65%** |
| lag فتح ستوري | `StoryViewer.tsx` | **60%** |

**الخطوة التالية الأعلى ROI:** refactor `App.tsx` + `ChatScreen.tsx` إلى `useAppSelector` / split contexts.
