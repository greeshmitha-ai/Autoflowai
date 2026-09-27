-- Call Engine schema migration
-- Creates calls table

CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE call_status AS ENUM ('initiated', 'connected', 'completed', 'failed', 'voicemail');

-- Calls table
CREATE TABLE IF NOT EXISTS calls (
  call_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id       UUID REFERENCES contacts(contact_id),
  direction        call_direction NOT NULL,
  status           call_status NOT NULL DEFAULT 'initiated',
  duration_seconds INTEGER,
  recording_url    VARCHAR(2048),
  transcript       TEXT,
  sentiment_score  FLOAT,
  is_voice_ai      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_tenant ON calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_status ON calls(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_tenant_created ON calls(tenant_id, created_at DESC);
