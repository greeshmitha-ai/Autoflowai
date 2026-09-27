-- Dashboard Export schema migration
-- Creates dashboard_export_jobs table for PDF/PNG export of dashboards and reports

CREATE TABLE IF NOT EXISTS dashboard_export_jobs (
  job_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id),
  user_id        UUID REFERENCES users(user_id),
  type           VARCHAR(10) NOT NULL CHECK (type IN ('pdf', 'png')),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  source_url     VARCHAR(2000) NOT NULL,
  report_name    VARCHAR(500) NOT NULL,
  tenant_name    VARCHAR(500) NOT NULL DEFAULT '',
  date_range     VARCHAR(200),
  s3_key         VARCHAR(500),
  download_url   VARCHAR(1000),
  error          TEXT,
  partial_output_expires_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dashboard_export_jobs_tenant ON dashboard_export_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_export_jobs_status ON dashboard_export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_dashboard_export_jobs_user ON dashboard_export_jobs(user_id);
