# تقرير أداء Retweet

_آخر قياس: 2026-05-30T23:58:35.392Z_

| اختبار | p50 (ms) | p95 (ms) |
|--------|----------|----------|
| feed_filter_sort_5k_posts | 0.401 | 1.006 |
| unread_scan_200_chats_x80_msgs | 0.044 | 0.512 |
| json_stringify_app_state_5k_posts | 3.233 | 5.592 |
| paginate_slice_30_from_5k | 0 | 0.002 |

## التحسينات المطبّقة

1. **Pagination** — `/v1/feed/posts`, `/v1/users/:id/posts`, `/v1/chats/:id/messages` تدعم `limit` و `before`
2. **Client API cache** — `src/lib/apiCache.ts` (TTL للدليل والصفحة الأولى من الفيد)
3. **Retry logic** — إعادة محاولة تلقائية على 503/504 في `apiFetch`
4. **Backend collection cache** — `backend/src/db/collectionCache.ts` (4s TTL)
5. **Hydrate dedupe** — قراءة messages.json مرة واحدة في app-state
6. **Compact JSON writes** — بدون pretty-print في engine
7. **Home feed windowing** — عرض تدريجي + تحميل المزيد عند التمرير
8. **ProfileFeedItem** — `memo` + `LazyInView` للوسائط
9. **Polling consolidation** — إزالة interval 20s المكرر من HomeScreen
10. **Unread counter** — يُحسب في store (deps على chats فقط)

## إعادة القياس

```bash
node scripts/benchmark-performance.mjs
```
