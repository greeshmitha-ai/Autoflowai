import {
  pgTable,
  uuid,
  varchar,
  decimal,
  date,
  integer,
  timestamp,
  text,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

// We reference users table by name to avoid circular imports
// (users table is defined in users.ts)
import { users } from './users.js';

export const dealStatusEnum = pgEnum('deal_status', ['open', 'won', 'lost', 'overdue']);

export const dealActivityTypeEnum = pgEnum('deal_activity_type', [
  'call',
  'email',
  'meeting',
  'note',
]);

export const pipelines = pgTable('pipelines', {
  pipeline_id: uuid('pipeline_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;

export const pipelineStages = pgTable('pipeline_stages', {
  stage_id: uuid('stage_id').primaryKey().defaultRandom(),
  pipeline_id: uuid('pipeline_id')
    .notNull()
    .references(() => pipelines.pipeline_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  win_probability: decimal('win_probability', { precision: 4, scale: 3 }).notNull(),
  position: integer('position').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;

export const deals = pgTable('deals', {
  deal_id: uuid('deal_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  pipeline_id: uuid('pipeline_id')
    .notNull()
    .references(() => pipelines.pipeline_id),
  contact_id: uuid('contact_id')
    .notNull()
    .references(() => contacts.contact_id),
  name: varchar('name', { length: 255 }).notNull(),
  stage_id: uuid('stage_id')
    .notNull()
    .references(() => pipelineStages.stage_id),
  value: decimal('value', { precision: 15, scale: 2 }).notNull().default('0'),
  expected_close_date: date('expected_close_date'),
  owner_id: uuid('owner_id')
    .notNull()
    .references(() => users.user_id),
  status: dealStatusEnum('status').notNull().default('open'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;

export const dealStageHistory = pgTable('deal_stage_history', {
  history_id: uuid('history_id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id')
    .notNull()
    .references(() => deals.deal_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  from_stage_id: uuid('from_stage_id').references(() => pipelineStages.stage_id),
  to_stage_id: uuid('to_stage_id')
    .notNull()
    .references(() => pipelineStages.stage_id),
  changed_by: uuid('changed_by')
    .notNull()
    .references(() => users.user_id),
  changed_at: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DealStageHistory = typeof dealStageHistory.$inferSelect;
export type NewDealStageHistory = typeof dealStageHistory.$inferInsert;

export const dealActivities = pgTable('deal_activities', {
  activity_id: uuid('activity_id').primaryKey().defaultRandom(),
  deal_id: uuid('deal_id')
    .notNull()
    .references(() => deals.deal_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  type: dealActivityTypeEnum('type').notNull(),
  content: text('content').notNull(),
  logged_by: uuid('logged_by')
    .notNull()
    .references(() => users.user_id),
  logged_at: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
});

export type DealActivity = typeof dealActivities.$inferSelect;
export type NewDealActivity = typeof dealActivities.$inferInsert;
