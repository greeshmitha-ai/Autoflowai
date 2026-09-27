import {
  pgTable,
  uuid,
  real,
  integer,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

export const churnRiskLevelEnum = pgEnum('churn_risk_level', ['low', 'medium', 'high']);

export const churnRiskScores = pgTable('churn_risk_scores', {
  score_id: uuid('score_id').primaryKey().defaultRandom(),
  contact_id: uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  churn_risk_score: real('churn_risk_score').notNull(),
  risk_level: churnRiskLevelEnum('risk_level').notNull(),
  factors: jsonb('factors').notNull().default({}),
  calculated_at: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contactOptimalTimes = pgTable('contact_optimal_times', {
  optimal_time_id: uuid('optimal_time_id').primaryKey().defaultRandom(),
  contact_id: uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  best_day_of_week: integer('best_day_of_week').notNull(),
  best_hour_of_day: integer('best_hour_of_day').notNull(),
  confidence: real('confidence').notNull(),
  calculated_at: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contactNextActions = pgTable('contact_next_actions', {
  action_id: uuid('action_id').primaryKey().defaultRandom(),
  contact_id: uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 50 }).notNull(),
  reason: text('reason').notNull(),
  confidence: real('confidence').notNull(),
  calculated_at: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ChurnRiskScore = typeof churnRiskScores.$inferSelect;
export type NewChurnRiskScore = typeof churnRiskScores.$inferInsert;

export type ContactOptimalTime = typeof contactOptimalTimes.$inferSelect;
export type NewContactOptimalTime = typeof contactOptimalTimes.$inferInsert;

export type ContactNextAction = typeof contactNextActions.$inferSelect;
export type NewContactNextAction = typeof contactNextActions.$inferInsert;

export type RiskLevel = 'low' | 'medium' | 'high';
export type NextAction = 'send_email' | 'schedule_call' | 'send_sms' | 'assign_to_campaign' | 'no_action';

export interface ChurnFactors {
  days_since_last_interaction: number;
  avg_sentiment: number;
  days_inactive: number;
}
