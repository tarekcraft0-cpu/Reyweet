# Reels API (Instagram-style)

## Stack integration

- Videos on disk: `{DATA_ROOT}/uploads/reels/` and `{DATA_ROOT}/uploads/reels/thumbnails/`
- Metadata: `db/reels.json`, `db/reel_likes.json`, `db/reel_comments.json`, `db/reel_views.json`
- Legacy posts (`type: "reel"` in `posts.json`) stay compatible; new uploads also mirror to `posts.json`
- Routes: `/v1/reels/*` and alias `/api/reels/*`

## Public URLs

Set `PUBLIC_BASE_URL` in `backend/.env` (e.g. `https://reyweet.vercel.app` or your VPS).

```
GET {PUBLIC_BASE_URL}/uploads/reels/{uuid}.mp4
GET {PUBLIC_BASE_URL}/uploads/reels/thumbnails/{uuid}-cover.webp
```

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/reels?limit=15&cursor=ISO&scope=all\|friends` | Yes | Paginated feed (newest first) |
| POST | `/v1/reels/upload` | Yes | Multipart `file` + optional `caption` |
| POST | `/v1/reels/:id/view` | Yes | View count (4h cooldown per user) |
| POST | `/v1/reels/:id/like` | Yes | Toggle like |
| POST | `/v1/reels/:id/comment` | Yes | Body: `{ "text": "..." }` |
| GET | `/v1/reels/:id/comments?limit=20&cursor=ISO` | Yes | Comment list |
| DELETE | `/v1/reels/:id` | Yes | Owner only; deletes files + metadata |

## Env (backend)

```env
DATA_ROOT=D:/RetweetSocial
PUBLIC_BASE_URL=https://your-api.example.com
```

## Frontend

- Feed: `useReelsFeed` + `ReelsScreen` (paginated, preloads adjacent slides)
- Upload: `publishReelViaApi` in Create flow, fallback to legacy `/v1/media/upload?reel=1`

## Migration

On server start, existing `posts.json` reels are imported into `reels.json` once (idempotent).
