-- Marketing Engine schema migration
-- Creates campaigns, email_templates, campaign_deliveries, contact_unsubscribes tables

CREATE TYPE campaign_channel AS ENUM ('email', 'sms', 'in_app');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'completed', 'cancelled');
CREATE TYPE delivery_status AS ENUM ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed');

-- Email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  template_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  name         VARCHAR(255) NOT NULL,
  html_content TEXT NOT NULL DEFAULT '',
  text_content TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
  name            VARCHAR(255) NOT NULL,
  channel         campaign_channel NOT NULL DEFAULT 'email',
  status          campaign_status NOT NULL DEFAULT 'draft',
  audience_filter JSONB NOT NULL DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ,
  template_id     UUID REFERENCES email_templates(template_id),
  created_by      UUID REFERENCES users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-contact delivery status tracking
CREATE TABLE IF NOT EXISTS campaign_deliveries (
  delivery_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(campaign_id),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id   UUID NOT NULL REFERENCES contacts(contact_id),
  status       delivery_status NOT NULL DEFAULT 'pending',
  sent_at      TIMESTAMPTZ,
  opened_at    TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  bounced_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);

-- Unsubscribe list (enforced on future sends)
CREATE TABLE IF NOT EXISTS contact_unsubscribes (
  unsubscribe_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id     UUID NOT NULL REFERENCES contacts(contact_id),
  channel        campaign_channel NOT NULL DEFAULT 'email',
  campaign_id    UUID REFERENCES campaigns(campaign_id),
  unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, contact_id, channel)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_contact ON campaign_deliveries(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_tenant ON campaign_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_unsubscribes_tenant_contact ON contact_unsubscribes(tenant_id, contact_id);
