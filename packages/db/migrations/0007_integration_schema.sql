-- Integration Hub schema migration
-- Creates api_keys, webhooks, webhook_deliveries, and integrations tables

CREATE TYPE api_key_status AS ENUM ('active', 'revoked');
CREATE TYPE webhook_status AS ENUM ('active', 'inactive');
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'delivered', 'failed');
CREATE TYPE integration_status AS ENUM ('active', 'inactive', 'error');

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  api_key_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  key_hash    VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  status      api_key_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  webhook_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  url         VARCHAR(2048) NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',
  secret      VARCHAR(255) NOT NULL,
  status      webhook_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id     UUID NOT NULL REFERENCES webhooks(webhook_id),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  event_type     VARCHAR(255) NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}',
  status         webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempts       INTEGER NOT NULL DEFAULT 0,
  next_retry_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Integrations table (native adapters config)
CREATE TABLE IF NOT EXISTS integrations (
  integration_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
  provider        VARCHAR(100) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}',
  status          integration_status NOT NULL DEFAULT 'inactive',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_status ON api_keys(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_provider ON integrations(tenant_id, provider);
