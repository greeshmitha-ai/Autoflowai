import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const collabResourceTypeEnum = pgEnum('collab_resource_type', [
  'contact',
  'deal',
  'conversation',
]);

// internal_notes — private notes on contacts, deals, and inbox conversations
// Never exposed to customer-facing interfaces
export const internalNotes = pgTable('internal_notes', {
  note_id: uuid('note_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  resource_type: collabResourceTypeEnum('resource_type').notNull(),
  resource_id: uuid('resource_id').notNull(),
  content: text('content').notNull(),
  created_by: uuid('created_by')
    .notNull()
    .references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InternalNote = typeof internalNotes.$inferSelect;
export type NewInternalNote = typeof internalNotes.$inferInsert;

// assignments — record of resource assignments between users
export const assignments = pgTable('assignments', {
  assignment_id: uuid('assignment_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  resource_type: collabResourceTypeEnum('resource_type').notNull(),
  resource_id: uuid('resource_id').notNull(),
  assigned_by: uuid('assigned_by')
    .notNull()
    .references(() => users.user_id),
  assigned_to: uuid('assigned_to')
    .notNull()
    .references(() => users.user_id),
  assigned_at: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
