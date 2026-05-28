# Moderation System Architecture

## Storage (runtime)

`{DATA_ROOT}/moderation/`
- `reports.json` — tickets / queue
- `appeals.json`
- `user_states.json` — ban status, violations, device/IP links
- `audit.json` — immutable-style audit chain

## PostgreSQL

See `backend/schema/moderation.postgresql.sql`

## API Surface

| Area | Prefix |
|------|--------|
| User reports | `POST /v1/moderation/reports` |
| Ban status | `GET /v1/me/moderation/status` |
| Appeal | `POST /v1/me/appeal/*` |
| Admin | `/v1/admin/moderation/*` |
| Internal override | `POST /v1/internal/moderation/*` + `X-Internal-Key` |

## Account States

`ACTIVE` → `RESTRICTED` → `SHADOW_BANNED` → `TEMP_BANNED` → `BANNED` → `PERMANENTLY_BANNED`

## Moderator Roles (env)

- `SUPPORT_AGENT_IDS`
- `SENIOR_MODERATOR_IDS`
- `MODERATOR_ADMIN_IDS`
- `SUPER_ADMIN_USER_IDS`
- `INTERNAL_TRUSTED_USER_IDS`
- `MODERATION_INTERNAL_SECRET` — internal unban only

## Security

- Report rate limits (15/hour per IP, 10/hour per reporter)
- Duplicate report detection (24h)
- Device fingerprint header: `X-Device-Fingerprint`
- Banned users: JWT allowed only for appeal + moderation status routes

## Frontend

- `SafetyActionSheet` + `ReportFlow`
- `BanScreen` + `AppealFlow`
- `ModerationDashboard` (admin)
- `BannedProfileView`
