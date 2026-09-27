import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const leadScoreConfidenceEnum = pgEnum('lead_score_confidence', ['high', 'low']);

export const contacts = pgTable('contacts', {
  contact_id: uuid('contact_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  full_name: varchar('full_name', { length: 255 }),
  email: varchar('email', { length: 320 }),
  phone: varchar('phone', { length: 50 }),
  company_name: varchar('company_name', { length: 255 }),
  tags: text('tags').array().notNull().default([]),
  lifecycle_stage: varchar('lifecycle_stage', { length: 100 }),
  lead_score: integer('lead_score').notNull().default(50),
  lead_score_confidence: leadScoreConfidenceEnum('lead_score_confidence').notNull().default('low'),
  pii_erasure_requested_at: timestamp('pii_erasure_requested_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
