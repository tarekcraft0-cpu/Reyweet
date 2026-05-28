# Group Chat System — Architecture

## Overview

Production-grade Instagram-style group messaging built on Retweet's existing stack:

| Layer | Technology |
|-------|------------|
| Runtime DB | JSON (`group_registry.json` + per-user snapshots) |
| Target DB | PostgreSQL (`backend/schema/groups.postgresql.sql`) |
| API | Express `/v1/groups/*` + legacy `/v1/chats/group/*` |
| Realtime | Socket.IO `group:updated`, `group:deleted` + SSE `sync_hint` |
| Auth | JWT + RBAC (`src/lib/groupRbac.ts`) |

## Folder Structure

```
backend/
  schema/groups.postgresql.sql    # Migration target
  src/
    db/groupRegistry.ts           # Canonical RBAC store
    groups/
      groupService.ts             # Business logic
      ARCHITECTURE.md
    routes/groupRoutes.ts         # REST API
    lib/groupChatDelivery.ts      # Snapshot sync
src/
  lib/
    groupTypes.ts                 # Shared types
    groupRbac.ts                  # Permission matrix
    groupApi.ts                   # Client API
  components/group/
    GroupRolesSheet.tsx
    GroupSettingsSheet.tsx
    GroupInviteQr.tsx
```

## RBAC

Roles: `owner` → `admin` → `moderator` → `member`

Permission matrix: `GROUP_ROLE_PERMISSIONS` in `groupRbac.ts`

**Admin demoting another admin:** requires `roles.demote_any_admin` (Owner always can).

## Data Flow

1. **Create group** → `POST /v1/chats/group` → snapshots + `ensureGroupRecord()`
2. **Role change** → `PATCH /v1/groups/:id/members/:uid/role` → registry → `patchGroupChatForMembers` → Socket `group:updated`
3. **Send message** → `assertCanSendMessage()` in `chatAccess` → existing ingest + realtime

## Socket Events

| Event | Payload |
|-------|---------|
| `group:updated` | `{ chatId, patch }` |
| `group:deleted` | `{ chatId }` |
| `group_invite` | (existing) |
| `message_new` | (existing) |

## Security

- JWT on all `/v1/groups/*` routes
- `requirePermission()` middleware pattern in `groupService`
- Rate limiting via existing `rateLimit.ts`
- Audit log in `group_audit.json`
- Media validation via existing upload pipeline

## Scaling Path

1. Run PostgreSQL schema
2. ETL `group_registry.json` → `groups` + `group_members`
3. Replace `groupRegistry.ts` reads/writes with SQL repository
4. Add Redis adapter for Socket.IO horizontal scale
