import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  pgEnum,
  text,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const importJobStatusEnum = pgEnum('import_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const importJobs = pgTable('import_jobs', {
  job_id: uuid('job_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_by: uuid('created_by').references(() => users.user_id),
  s3_key: varchar('s3_key', { length: 1024 }).notNull(),
  status: importJobStatusEnum('status').notNull().default('pending'),
  total_rows: integer('total_rows'),
  success_count: integer('success_count').notNull().default(0),
  error_count: integer('error_count').notNull().default(0),
  error_details: text('error_details'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
