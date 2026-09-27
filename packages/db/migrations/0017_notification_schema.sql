-- Notification schema migration
-- Tables: notifications, notification_preferences

-- notifications: records of notifications sent to users
CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  channels        TEXT[] NOT NULL DEFAULT '{}',
  delivered_at    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_event_type ON notifications(tenant_id, event_type);

-- notification_preferences: per-user channel and DND preferences per event type
CREATE TABLE IF NOT EXISTS notification_preferences (
  pref_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  channels        TEXT[] NOT NULL DEFAULT '{"in_app","email"}',
  dnd_start_hour  INTEGER CHECK (dnd_start_hour >= 0 AND dnd_start_hour <= 23),
  dnd_end_hour    INTEGER CHECK (dnd_end_hour >= 0 AND dnd_end_hour <= 23),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant ON notification_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(tenant_id, user_id);

-- notification_role_defaults: role-level default preferences set by admins
CREATE TABLE IF NOT EXISTS notification_role_defaults (
  default_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL,
  event_type      VARCHAR(100) NOT NULL,
  channels        TEXT[] NOT NULL DEFAULT '{"in_app","email"}',
  dnd_start_hour  INTEGER CHECK (dnd_start_hour >= 0 AND dnd_start_hour <= 23),
  dnd_end_hour    INTEGER CHECK (dnd_end_hour >= 0 AND dnd_end_hour <= 23),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_role_defaults_tenant ON notification_role_defaults(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_role_defaults_role ON notification_role_defaults(tenant_id, role);
