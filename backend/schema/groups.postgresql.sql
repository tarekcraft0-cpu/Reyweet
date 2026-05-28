-- Retweet Group Chat — PostgreSQL schema (production target)
-- Current runtime uses JSON registry; migrate with ETL from group_registry.json

CREATE TYPE group_visibility AS ENUM ('public', 'private', 'invite_only');
CREATE TYPE group_role AS ENUM ('owner', 'admin', 'moderator', 'member');

CREATE TABLE groups (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  visibility group_visibility NOT NULL DEFAULT 'invite_only',
  invite_code VARCHAR(32) UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role group_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID REFERENCES users(id),
  muted_until TIMESTAMPTZ,
  restricted_until TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_members_user ON group_members(user_id);

CREATE TABLE group_permissions (
  role group_role NOT NULL,
  permission VARCHAR(64) NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  dm_thread_id UUID,
  sender_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  extras JSONB DEFAULT '{}',
  parent_message_id UUID REFERENCES messages(id),
  scheduled_at TIMESTAMPTZ,
  deleted_for_everyone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_group_created ON messages(group_id, created_at DESC);

CREATE TABLE message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE message_reads (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE group_invites (
  code VARCHAR(32) PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE muted_users (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_by UUID NOT NULL REFERENCES users(id),
  until_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE blocked_users (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE group_join_requests (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id),
  action VARCHAR(64) NOT NULL,
  target_user_id UUID REFERENCES users(id),
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_group ON audit_logs(group_id, created_at DESC);

-- Seed permission matrix
INSERT INTO group_permissions (role, permission) VALUES
  ('owner', 'group.delete'),
  ('owner', 'group.transfer_ownership'),
  ('owner', 'roles.assign_admin'),
  ('owner', 'roles.demote_any_admin'),
  ('admin', 'members.add'),
  ('admin', 'members.remove'),
  ('admin', 'roles.demote_any_admin'),
  ('moderator', 'messages.delete_any'),
  ('member', 'messages.send');
