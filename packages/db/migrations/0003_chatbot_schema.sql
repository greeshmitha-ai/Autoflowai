-- Chatbot Engine schema migration
-- Creates agents, conversations, knowledge_base tables

CREATE TYPE conversation_channel AS ENUM ('widget', 'whatsapp', 'facebook', 'sms', 'live_chat');
CREATE TYPE conversation_status AS ENUM ('open', 'escalated', 'closed');

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  agent_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(tenant_id),
  name                 VARCHAR(255) NOT NULL,
  persona              TEXT NOT NULL DEFAULT '',
  escalation_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  deployment_targets   TEXT[] NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id      UUID REFERENCES contacts(contact_id),
  agent_id        UUID REFERENCES agents(agent_id),
  channel         conversation_channel NOT NULL DEFAULT 'widget',
  status          conversation_status NOT NULL DEFAULT 'open',
  transcript      JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

-- Knowledge base table
CREATE TABLE IF NOT EXISTS knowledge_base (
  kb_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  agent_id    UUID NOT NULL REFERENCES agents(agent_id),
  filename    VARCHAR(500) NOT NULL,
  s3_key      VARCHAR(1000) NOT NULL,
  status      VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indexed_at  TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_agent ON knowledge_base(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant ON knowledge_base(tenant_id);
