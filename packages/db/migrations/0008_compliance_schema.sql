-- Compliance schema migration
-- Adds retention_policies and export_jobs tables

-- Data retention policies per tenant per resource type
CREATE TABLE IF NOT EXISTS retention_policies (
  policy_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  resource_type  VARCHAR(100) NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resource_type)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_tenant ON retention_policies(tenant_id);

-- Export jobs for tenant data export requests
CREATE TABLE IF NOT EXISTS export_jobs (
  job_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  s3_key       VARCHAR(500),
  download_url VARCHAR(1000),
  error        TEXT,
  requested_by UUID REFERENCES users(user_id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_tenant ON export_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
