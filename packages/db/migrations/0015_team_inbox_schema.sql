-- Team Inbox schema migration
-- Tables: inbox_conversations

-- Inbox channel enum
DO $$ BEGIN
  CREATE TYPE inbox_channel AS ENUM ('email', 'sms', 'live_chat', 'whatsapp', 'facebook');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Inbox conversation status enum
DO $$ BEGIN
  CREATE TYPE inbox_status AS ENUM ('open', 'pending', 'resolved', 'snoozed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- inbox_conversations: unified queue of inbound conversations across all channels
CREATE TABLE IF NOT EXISTS inbox_conversations (
  inbox_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  channel             inbox_channel NOT NULL,
  contact_id          UUID REFERENCES contacts(contact_id),
  contact_name        VARCHAR(255),
  last_message_preview TEXT,
  last_message_at     TIMESTAMPTZ,
  assigned_to         UUID REFERENCES users(user_id),
  status              inbox_status NOT NULL DEFAULT 'open',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_conversations_tenant ON inbox_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_status ON inbox_conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_assigned ON inbox_conversations(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_channel ON inbox_conversations(tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_inbox_conversations_last_message ON inbox_conversations(tenant_id, last_message_at DESC);
