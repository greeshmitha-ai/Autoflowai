-- Contact Service schema migration
-- Creates contacts and import_jobs tables

CREATE TYPE lead_score_confidence AS ENUM ('high', 'low');
CREATE TYPE import_job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Contacts table (central contact database, shared by all subsystems)
CREATE TABLE IF NOT EXISTS contacts (
  contact_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(tenant_id),
  full_name                VARCHAR(255),
  email                    VARCHAR(320),
  phone                    VARCHAR(50),
  company_name             VARCHAR(255),
  tags                     TEXT[] NOT NULL DEFAULT '{}',
  lifecycle_stage          VARCHAR(100),
  lead_score               INTEGER NOT NULL DEFAULT 50 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_score_confidence    lead_score_confidence NOT NULL DEFAULT 'low',
  pii_erasure_requested_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Import jobs table (tracks async CSV import jobs)
CREATE TABLE IF NOT EXISTS import_jobs (
  job_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  created_by     UUID REFERENCES users(user_id),
  s3_key         VARCHAR(1024) NOT NULL,
  status         import_job_status NOT NULL DEFAULT 'pending',
  total_rows     INTEGER,
  success_count  INTEGER NOT NULL DEFAULT 0,
  error_count    INTEGER NOT NULL DEFAULT 0,
  error_details  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_email ON contacts(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_lifecycle ON contacts(tenant_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_lead_score ON contacts(tenant_id, lead_score);
CREATE INDEX IF NOT EXISTS idx_contacts_pii_erasure ON contacts(pii_erasure_requested_at) WHERE pii_erasure_requested_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_id ON import_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
