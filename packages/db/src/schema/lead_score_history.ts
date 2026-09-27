import {
  pgTable,
  uuid,
  integer,
  jsonb,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

export const scoreConfidenceEnum = pgEnum('score_confidence', ['high', 'low']);

export const leadScoreHistory = pgTable('lead_score_history', {
  history_id: uuid('history_id').primaryKey().defaultRandom(),
  contact_id: uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
  confidence: scoreConfidenceEnum('confidence').notNull(),
  factors: jsonb('factors').notNull().default([]),
  recorded_at: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LeadScoreHistory = typeof leadScoreHistory.$inferSelect;
export type NewLeadScoreHistory = typeof leadScoreHistory.$inferInsert;

export interface ScoreFactor {
  name: string;
  points: number;
  description: string;
}
