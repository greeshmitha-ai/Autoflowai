-- Marketplace schema migration
-- Adds missing columns to extensions and tenant_extensions tables
-- (tables were created in 0000_initial_schema.sql but without marketplace-specific columns)

-- Extension status and pricing enums
DO $$ BEGIN
  CREATE TYPE extension_status AS ENUM ('available', 'under_review', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE extension_pricing_model AS ENUM ('free', 'paid', 'usage_based');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tenant_extension_status AS ENUM ('active', 'uninstalled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extensions marketplace table
CREATE TABLE IF NOT EXISTS extensions (
  extension_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  publisher     VARCHAR(255) NOT NULL,
  version       VARCHAR(50) NOT NULL DEFAULT '1.0.0',
  permissions   TEXT[] NOT NULL DEFAULT '{}',
  pricing_model extension_pricing_model NOT NULL DEFAULT 'free',
  status        extension_status NOT NULL DEFAULT 'under_review',
  rating        NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  review_count  INTEGER NOT NULL DEFAULT 0,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant extension installations
CREATE TABLE IF NOT EXISTS tenant_extensions (
  tenant_extension_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id),
  extension_id        UUID NOT NULL REFERENCES extensions(extension_id),
  status              tenant_extension_status NOT NULL DEFAULT 'active',
  approved_permissions TEXT[] NOT NULL DEFAULT '{}',
  installed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uninstalled_at      TIMESTAMPTZ,
  UNIQUE (tenant_id, extension_id)
);

CREATE INDEX IF NOT EXISTS idx_extensions_status ON extensions(status);
CREATE INDEX IF NOT EXISTS idx_tenant_extensions_tenant ON tenant_extensions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_extensions_extension ON tenant_extensions(extension_id);
