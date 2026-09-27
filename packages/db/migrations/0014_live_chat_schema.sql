-- Live Chat schema migration
-- Tables: live_chat_sessions, live_chat_messages, canned_responses

-- Live chat session status enum
DO $$ BEGIN
  CREATE TYPE live_chat_session_status AS ENUM ('waiting', 'active', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Live chat message sender type enum
DO $$ BEGIN
  CREATE TYPE live_chat_sender_type AS ENUM ('customer', 'operator', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Live chat sessions: created when a chatbot conversation is escalated
CREATE TABLE IF NOT EXISTS live_chat_sessions (
  session_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  conversation_id     UUID REFERENCES conversations(conversation_id),
  contact_id          UUID REFERENCES contacts(contact_id),
  assigned_operator_id UUID REFERENCES users(user_id),
  status              live_chat_session_status NOT NULL DEFAULT 'waiting',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_chat_sessions_tenant ON live_chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_sessions_status ON live_chat_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_live_chat_sessions_operator ON live_chat_sessions(assigned_operator_id) WHERE assigned_operator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_chat_sessions_conversation ON live_chat_sessions(conversation_id) WHERE conversation_id IS NOT NULL;

-- Live chat messages: messages exchanged within a session
CREATE TABLE IF NOT EXISTS live_chat_messages (
  message_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES live_chat_sessions(session_id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  sender_type  live_chat_sender_type NOT NULL,
  sender_id    VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_chat_messages_session ON live_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_tenant ON live_chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_live_chat_messages_sent_at ON live_chat_messages(session_id, sent_at);

-- Canned responses: pre-written response templates for operators
CREATE TABLE IF NOT EXISTS canned_responses (
  canned_response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title              VARCHAR(255) NOT NULL,
  content            TEXT NOT NULL,
  created_by         UUID REFERENCES users(user_id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canned_responses_tenant ON canned_responses(tenant_id);
