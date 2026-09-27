import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

// ─── Portal Sessions ──────────────────────────────────────────────────────────

export const portalSessions = pgTable('portal_sessions', {
  session_id: uuid('session_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  contact_id: uuid('contact_id')
    .notNull()
    .references(() => contacts.contact_id),
  email: varchar('email', { length: 320 }).notNull(),
  magic_link_token: varchar('magic_link_token', { length: 256 }),
  token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PortalSession = typeof portalSessions.$inferSelect;
export type NewPortalSession = typeof portalSessions.$inferInsert;

// ─── Support Tickets ──────────────────────────────────────────────────────────

export const supportTicketStatusEnum = pgEnum('support_ticket_status', [
  'open',
  'in_progress',
  'resolved',
]);

export const supportTickets = pgTable('support_tickets', {
  ticket_id: uuid('ticket_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  contact_id: uuid('contact_id')
    .notNull()
    .references(() => contacts.contact_id),
  subject: varchar('subject', { length: 500 }).notNull(),
  description: text('description').notNull(),
  status: supportTicketStatusEnum('status').notNull().default('open'),
  file_attachment_url: varchar('file_attachment_url', { length: 2000 }),
  ticket_ref: varchar('ticket_ref', { length: 50 }).notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
