-- Attribution Engine schema migration
-- Tables: touchpoints, conversion_events, attribution_results, custom_conversion_events

-- channel enum for touchpoints
DO $$ BEGIN
  CREATE TYPE touchpoint_channel AS ENUM ('email', 'sms', 'chatbot', 'call', 'campaign');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- attribution_model enum
DO $$ BEGIN
  CREATE TYPE attribution_model AS ENUM ('first_touch', 'last_touch', 'linear');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- touchpoints: one row per interaction touchpoint per contact
CREATE TABLE IF NOT EXISTS touchpoints (
  touchpoint_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  channel        touchpoint_channel NOT NULL,
  campaign_id    UUID NULL,
  event_type     VARCHAR(100) NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_touchpoints_tenant ON touchpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_contact ON touchpoints(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_occurred ON touchpoints(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_touchpoints_campaign ON touchpoints(tenant_id, campaign_id) WHERE campaign_id IS NOT NULL;

-- conversion_events: deal closed-won, form submitted, survey completed, custom
CREATE TABLE IF NOT EXISTS conversion_events (
  conversion_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  event_type     VARCHAR(100) NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_tenant ON conversion_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_contact ON conversion_events(tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_occurred ON conversion_events(tenant_id, occurred_at DESC);

-- attribution_results: credit assigned per touchpoint for a conversion
CREATE TABLE IF NOT EXISTS attribution_results (
  result_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  conversion_id  UUID NOT NULL REFERENCES conversion_events(conversion_id) ON DELETE CASCADE,
  touchpoint_id  UUID NOT NULL REFERENCES touchpoints(touchpoint_id) ON DELETE CASCADE,
  contact_id     UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
  model          attribution_model NOT NULL,
  credit         NUMERIC(5, 4) NOT NULL,  -- 0.0000 to 1.0000 (fraction of 100%)
  channel        touchpoint_channel NOT NULL,
  campaign_id    UUID NULL,
  occurred_at    TIMESTAMPTZ NOT NULL,
  calculated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attribution_results_tenant ON attribution_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attribution_results_conversion ON attribution_results(tenant_id, conversion_id);
CREATE INDEX IF NOT EXISTS idx_attribution_results_channel ON attribution_results(tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_attribution_results_occurred ON attribution_results(tenant_id, occurred_at DESC);

-- custom_conversion_events: tenant-defined conversion event types
CREATE TABLE IF NOT EXISTS custom_conversion_events (
  custom_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_type      VARCHAR(100) NOT NULL,
  description     VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_custom_conversion_events_tenant ON custom_conversion_events(tenant_id);
