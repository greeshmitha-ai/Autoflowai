-- Billing schema migration
-- Adds subscription_plans, subscriptions, invoices, and usage_records tables

-- Subscription plan tiers
CREATE TYPE subscription_tier AS ENUM ('starter', 'growth', 'enterprise');

-- Subscription status
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'suspended');

-- Usage resource types
CREATE TYPE usage_resource AS ENUM ('contacts', 'call_minutes', 'sms_sent', 'ai_tokens');

-- Subscription plans (platform-level, not tenant-scoped)
CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  tier             subscription_tier NOT NULL,
  features         JSONB NOT NULL DEFAULT '{}',
  limits           JSONB NOT NULL DEFAULT '{}',
  stripe_price_id  VARCHAR(255) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_tier ON subscription_plans(tier);

-- Tenant subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(tenant_id),
  plan_id                UUID NOT NULL REFERENCES subscription_plans(plan_id),
  stripe_customer_id     VARCHAR(255) NOT NULL,
  stripe_subscription_id VARCHAR(255) NOT NULL,
  status                 subscription_status NOT NULL DEFAULT 'active',
  current_period_start   TIMESTAMPTZ NOT NULL,
  current_period_end     TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id),
  stripe_invoice_id VARCHAR(255) NOT NULL,
  amount_cents      INTEGER NOT NULL,
  currency          VARCHAR(10) NOT NULL DEFAULT 'usd',
  status            VARCHAR(50) NOT NULL,
  pdf_url           VARCHAR(1000),
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_invoice ON invoices(stripe_invoice_id);

-- Usage records for metering
CREATE TABLE IF NOT EXISTS usage_records (
  record_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  resource    usage_resource NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_records_tenant ON usage_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_resource ON usage_records(tenant_id, resource);
CREATE INDEX IF NOT EXISTS idx_usage_records_recorded_at ON usage_records(recorded_at);
