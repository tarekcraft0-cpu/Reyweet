# Group Socket Events

## Server → Client

| Event | Payload | When |
|-------|---------|------|
| `group:updated` | `{ chatId, patch: Partial<Chat> }` | Settings, roles, members changed |
| `group:deleted` | `{ chatId }` | Owner deleted group |
| `group_invite` | `{ chat, fromUserId }` | Member added to group |
| `message_new` | `{ chatId, message, members, isGroup }` | New group message |
| `sync_hint` | `{ kind: "group_join_request" \| "chats", chatId? }` | Refresh inbox |

## Client → Server (existing)

| Event | Payload |
|-------|---------|
| `message:send` | PostMessageInput |
| `typing` | `{ chatId, isTyping }` |

## Rooms

Delivery uses per-user rooms `user:{userId}` (not `group:{chatId}`) for horizontal scale compatibility.
