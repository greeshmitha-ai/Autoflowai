-- CRM and Pipeline Management schema migration
-- Tables: pipelines, pipeline_stages, deals, deal_stage_history, deal_activities

-- Deal status enum
DO $$ BEGIN
  CREATE TYPE deal_status AS ENUM ('open', 'won', 'lost', 'overdue');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Deal activity type enum
DO $$ BEGIN
  CREATE TYPE deal_activity_type AS ENUM ('call', 'email', 'meeting', 'note');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Pipelines: a sales pipeline per tenant
CREATE TABLE IF NOT EXISTS pipelines (
  pipeline_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_tenant ON pipelines(tenant_id);

-- Pipeline stages: ordered stages within a pipeline
CREATE TABLE IF NOT EXISTS pipeline_stages (
  stage_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id     UUID NOT NULL REFERENCES pipelines(pipeline_id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  win_probability FLOAT NOT NULL CHECK (win_probability >= 0 AND win_probability <= 1),
  position        INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant ON pipeline_stages(tenant_id);

-- Deals: individual sales opportunities
CREATE TABLE IF NOT EXISTS deals (
  deal_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  pipeline_id         UUID NOT NULL REFERENCES pipelines(pipeline_id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  stage_id            UUID NOT NULL REFERENCES pipeline_stages(stage_id),
  value               DECIMAL(15, 2) NOT NULL DEFAULT 0,
  expected_close_date DATE,
  owner_id            UUID NOT NULL REFERENCES users(user_id),
  status              deal_status NOT NULL DEFAULT 'open',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_tenant ON deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_close_date ON deals(expected_close_date) WHERE status = 'open';

-- Deal stage history: immutable audit trail of stage transitions
CREATE TABLE IF NOT EXISTS deal_stage_history (
  history_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES pipeline_stages(stage_id),
  to_stage_id   UUID NOT NULL REFERENCES pipeline_stages(stage_id),
  changed_by    UUID NOT NULL REFERENCES users(user_id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_tenant ON deal_stage_history(tenant_id);

-- Deal activities: calls, emails, meetings, notes linked to a deal
CREATE TABLE IF NOT EXISTS deal_activities (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(contact_id),
  type        deal_activity_type NOT NULL,
  content     TEXT NOT NULL,
  logged_by   UUID NOT NULL REFERENCES users(user_id),
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_tenant ON deal_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_contact ON deal_activities(contact_id);
