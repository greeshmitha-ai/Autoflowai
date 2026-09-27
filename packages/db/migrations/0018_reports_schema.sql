-- Reports schema migration
-- Tables: reports, report_schedules

-- reports: custom report definitions per tenant
CREATE TABLE IF NOT EXISTS reports (
  report_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  definition   JSONB NOT NULL DEFAULT '{}',
  created_by   UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_tenant ON reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_created ON reports(tenant_id, created_at DESC);

-- report_schedules: scheduled email delivery for reports
CREATE TYPE IF NOT EXISTS report_frequency AS ENUM ('daily', 'weekly', 'monthly');

CREATE TABLE IF NOT EXISTS report_schedules (
  schedule_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    UUID NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  frequency    report_frequency NOT NULL,
  recipients   TEXT[] NOT NULL DEFAULT '{}',
  next_run_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant ON report_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_report ON report_schedules(report_id);
