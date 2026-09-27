-- Collaboration schema migration
-- Tables: internal_notes, assignments

-- Resource type enum (shared by notes and assignments)
DO $$ BEGIN
  CREATE TYPE collab_resource_type AS ENUM ('contact', 'deal', 'conversation');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- internal_notes: private notes on contacts, deals, and inbox conversations
-- Never exposed to customer-facing interfaces
CREATE TABLE IF NOT EXISTS internal_notes (
  note_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  resource_type collab_resource_type NOT NULL,
  resource_id   UUID NOT NULL,
  content       TEXT NOT NULL,
  created_by    UUID NOT NULL REFERENCES users(user_id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_tenant ON internal_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_resource ON internal_notes(tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_created_at ON internal_notes(tenant_id, resource_type, resource_id, created_at DESC);

-- assignments: record of who assigned a resource to whom
CREATE TABLE IF NOT EXISTS assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  resource_type collab_resource_type NOT NULL,
  resource_id   UUID NOT NULL,
  assigned_by   UUID NOT NULL REFERENCES users(user_id),
  assigned_to   UUID NOT NULL REFERENCES users(user_id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assignments_resource ON assignments(tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_to ON assignments(tenant_id, assigned_to);
