-- Initial schema migration
-- Creates core tables with tenant_id isolation

CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE user_status AS ENUM ('active', 'locked', 'suspended');

-- Tenants table (top-level multi-tenant isolation)
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  domain        VARCHAR(255),
  parent_tenant_id UUID REFERENCES tenants(tenant_id),
  branding      JSONB,
  plan_id       UUID,
  status        tenant_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table (scoped to tenant)
CREATE TABLE IF NOT EXISTS users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
  email         VARCHAR(320) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  roles         TEXT[] NOT NULL DEFAULT '{}',
  status        user_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- Audit logs table (retained minimum 90 days)
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id       UUID REFERENCES users(user_id),
  resource_type VARCHAR(100) NOT NULL,
  resource_id   UUID,
  action        VARCHAR(100) NOT NULL,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata      JSONB
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON tenants(parent_tenant_id);
