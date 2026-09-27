import { pgTable, uuid, varchar, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const retentionPolicies = pgTable('retention_policies', {
  policy_id: uuid('policy_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  resource_type: varchar('resource_type', { length: 100 }).notNull(),
  retention_days: integer('retention_days').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RetentionPolicy = typeof retentionPolicies.$inferSelect;
export type NewRetentionPolicy = typeof retentionPolicies.$inferInsert;

export const exportJobs = pgTable('export_jobs', {
  job_id: uuid('job_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  s3_key: varchar('s3_key', { length: 500 }),
  download_url: varchar('download_url', { length: 1000 }),
  error: text('error'),
  requested_by: uuid('requested_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export type ExportJob = typeof exportJobs.$inferSelect;
export type NewExportJob = typeof exportJobs.$inferInsert;
