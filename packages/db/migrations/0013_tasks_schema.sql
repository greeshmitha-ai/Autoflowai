-- Task and Activity Management schema migration
-- Tables: tasks, booking_slots, bookings

-- Task priority enum
DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Task status enum
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('open', 'completed', 'overdue');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tasks: work items assigned to users, optionally linked to contacts/deals
CREATE TABLE IF NOT EXISTS tasks (
  task_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  due_date    TIMESTAMPTZ,
  priority    task_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID NOT NULL REFERENCES users(user_id),
  contact_id  UUID REFERENCES contacts(contact_id),
  deal_id     UUID REFERENCES deals(deal_id),
  status      task_status NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(tenant_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deal ON tasks(deal_id) WHERE deal_id IS NOT NULL;

-- Booking slots: available time windows defined by users
CREATE TABLE IF NOT EXISTS booking_slots (
  slot_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(user_id),
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_slots_end_after_start CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_booking_slots_tenant ON booking_slots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_slots_user ON booking_slots(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_booking_slots_available ON booking_slots(tenant_id, user_id, is_available, start_time);

-- Bookings: customer-confirmed bookings against a slot
CREATE TABLE IF NOT EXISTS bookings (
  booking_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  slot_id         UUID NOT NULL REFERENCES booking_slots(slot_id),
  contact_id      UUID REFERENCES contacts(contact_id),
  customer_email  VARCHAR(255) NOT NULL,
  customer_name   VARCHAR(255) NOT NULL,
  booking_token   VARCHAR(255) NOT NULL UNIQUE,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_token ON bookings(booking_token);
CREATE INDEX IF NOT EXISTS idx_bookings_contact ON bookings(contact_id) WHERE contact_id IS NOT NULL;
