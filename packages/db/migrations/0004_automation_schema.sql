-- Automation Engine schema migration
-- Creates workflows, workflow_executions tables

CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'inactive');
CREATE TYPE workflow_execution_status AS ENUM ('running', 'completed', 'failed');

-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
  workflow_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  name         VARCHAR(255) NOT NULL,
  status       workflow_status NOT NULL DEFAULT 'draft',
  definition   JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[],"trigger":{}}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow executions table
CREATE TABLE IF NOT EXISTS workflow_executions (
  execution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflows(workflow_id),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  status       workflow_execution_status NOT NULL DEFAULT 'running',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  error_log    JSONB NOT NULL DEFAULT '[]'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_tenant ON workflow_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(tenant_id, status);
