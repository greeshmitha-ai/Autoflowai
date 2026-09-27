-- Lead Scorer schema migration
-- Adds lead_score_history table for tracking score changes over time

-- Confidence enum (reuse existing or create if not present)
DO $$ BEGIN
  CREATE TYPE score_confidence AS ENUM ('high', 'low');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Lead score history: records each score recalculation with delta >= 10
CREATE TABLE IF NOT EXISTS lead_score_history (
  history_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  score        INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  confidence   score_confidence NOT NULL,
  factors      JSONB NOT NULL DEFAULT '[]',
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_contact ON lead_score_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_tenant ON lead_score_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_recorded_at ON lead_score_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_contact_recorded ON lead_score_history(contact_id, recorded_at DESC);
