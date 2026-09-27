-- Predictive Analytics Engine schema migration
-- Tables: churn_risk_scores, contact_optimal_times, contact_next_actions

-- Risk level enum
DO $$ BEGIN
  CREATE TYPE churn_risk_level AS ENUM ('low', 'medium', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Churn risk scores: one row per contact per calculation run
CREATE TABLE IF NOT EXISTS churn_risk_scores (
  score_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  churn_risk_score FLOAT NOT NULL CHECK (churn_risk_score >= 0 AND churn_risk_score <= 1),
  risk_level      churn_risk_level NOT NULL,
  factors         JSONB NOT NULL DEFAULT '{}',
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_risk_tenant ON churn_risk_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_churn_risk_contact ON churn_risk_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_churn_risk_level ON churn_risk_scores(tenant_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_churn_risk_calculated ON churn_risk_scores(calculated_at DESC);

-- Optimal contact times: best day/hour per contact
CREATE TABLE IF NOT EXISTS contact_optimal_times (
  optimal_time_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  best_day_of_week INTEGER NOT NULL CHECK (best_day_of_week >= 0 AND best_day_of_week <= 6),
  best_hour_of_day INTEGER NOT NULL CHECK (best_hour_of_day >= 0 AND best_hour_of_day <= 23),
  confidence       FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  calculated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_optimal_times_contact ON contact_optimal_times(contact_id);
CREATE INDEX IF NOT EXISTS idx_optimal_times_tenant ON contact_optimal_times(tenant_id);

-- Next-best-action recommendations
CREATE TABLE IF NOT EXISTS contact_next_actions (
  action_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  action         VARCHAR(50) NOT NULL,
  reason         TEXT NOT NULL,
  confidence     FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  calculated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_next_actions_contact ON contact_next_actions(contact_id);
CREATE INDEX IF NOT EXISTS idx_next_actions_tenant ON contact_next_actions(tenant_id);
