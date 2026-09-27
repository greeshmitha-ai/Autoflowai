-- Customer Self-Service Portal schema migration
-- Creates portal_sessions and support_tickets tables

-- Portal sessions (magic-link + password-based auth for customers)
CREATE TABLE IF NOT EXISTS portal_sessions (
  session_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id        UUID NOT NULL REFERENCES contacts(contact_id),
  email             VARCHAR(320) NOT NULL,
  magic_link_token  VARCHAR(256),
  token_expires_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_tenant ON portal_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_contact ON portal_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_sessions(magic_link_token) WHERE magic_link_token IS NOT NULL;

-- Support tickets
CREATE TYPE IF NOT EXISTS support_ticket_status AS ENUM ('open', 'in_progress', 'resolved');

CREATE TABLE IF NOT EXISTS support_tickets (
  ticket_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(tenant_id),
  contact_id            UUID NOT NULL REFERENCES contacts(contact_id),
  subject               VARCHAR(500) NOT NULL,
  description           TEXT NOT NULL,
  status                support_ticket_status NOT NULL DEFAULT 'open',
  file_attachment_url   VARCHAR(2000),
  ticket_ref            VARCHAR(50) NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_contact ON support_tickets(contact_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
