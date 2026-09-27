import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const dashboardExportJobs = pgTable('dashboard_export_jobs', {
  job_id: uuid('job_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  user_id: uuid('user_id').references(() => users.user_id),
  type: varchar('type', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  source_url: varchar('source_url', { length: 2000 }).notNull(),
  report_name: varchar('report_name', { length: 500 }).notNull(),
  tenant_name: varchar('tenant_name', { length: 500 }).notNull().default(''),
  date_range: varchar('date_range', { length: 200 }),
  s3_key: varchar('s3_key', { length: 500 }),
  download_url: varchar('download_url', { length: 1000 }),
  error: text('error'),
  partial_output_expires_at: timestamp('partial_output_expires_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export type DashboardExportJob = typeof dashboardExportJobs.$inferSelect;
export type NewDashboardExportJob = typeof dashboardExportJobs.$inferInsert;
