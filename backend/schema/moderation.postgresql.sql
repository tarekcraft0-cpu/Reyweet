-- Retweet Moderation — PostgreSQL (production target)

CREATE TYPE account_status AS ENUM (
  'ACTIVE', 'RESTRICTED', 'SHADOW_BANNED', 'TEMP_BANNED', 'BANNED', 'PERMANENTLY_BANNED'
);

CREATE TYPE moderation_status AS ENUM (
  'pending', 'under_review', 'approved', 'rejected', 'escalated'
);

CREATE TYPE appeal_status AS ENUM ('pending', 'under_review', 'approved', 'rejected');

CREATE TABLE report_categories (
  id VARCHAR(64) PRIMARY KEY,
  label_en VARCHAR(120) NOT NULL,
  label_ar VARCHAR(120) NOT NULL,
  needs_impersonation_flow BOOLEAN DEFAULT FALSE
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(80),
  category VARCHAR(64) NOT NULL REFERENCES report_categories(id),
  subcategory VARCHAR(120),
  evidence JSONB NOT NULL DEFAULT '{}',
  status moderation_status NOT NULL DEFAULT 'pending',
  device_fingerprint VARCHAR(128),
  ip INET,
  user_agent TEXT,
  assigned_moderator_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX idx_reports_reported ON reports(reported_user_id);

CREATE TABLE report_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  url TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  report_id UUID REFERENCES reports(id),
  action VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  guideline VARCHAR(120),
  moderator_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE banned_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  account_status account_status NOT NULL,
  ban_reason TEXT,
  ban_guideline VARCHAR(120),
  banned_at TIMESTAMPTZ NOT NULL,
  ban_expires_at TIMESTAMPTZ,
  permanently_disabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  report_id UUID REFERENCES reports(id),
  status appeal_status NOT NULL DEFAULT 'pending',
  message TEXT NOT NULL,
  phone VARCHAR(32),
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  review_note TEXT
);

CREATE TABLE appeal_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appeal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id UUID NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id),
  moderator_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(64) NOT NULL,
  note TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderator_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  moderator_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE linked_devices (
  user_id UUID NOT NULL REFERENCES users(id),
  fingerprint VARCHAR(128) NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, fingerprint)
);

CREATE TABLE linked_ips (
  user_id UUID NOT NULL REFERENCES users(id),
  ip INET NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ip)
);

CREATE TABLE moderation_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40),
  entity_id VARCHAR(80),
  meta JSONB,
  immutable_hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
