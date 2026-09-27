import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  text,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const reportFrequencyEnum = pgEnum('report_frequency', ['daily', 'weekly', 'monthly']);

// ─── Report definition types ──────────────────────────────────────────────────

export interface ReportMetric {
  id: string;
  subsystem: 'contacts' | 'campaigns' | 'calls' | 'surveys' | 'deals';
  field: string;
  aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max';
  label?: string;
}

export interface ReportVisualization {
  id: string;
  type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'data_table' | 'metric_card';
  metric_ids: string[];
  title?: string;
}

export interface ReportFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between';
  value: unknown;
}

export interface ReportDefinition {
  metrics: ReportMetric[];
  visualizations: ReportVisualization[];
  filters: ReportFilter[];
  date_range?: {
    start?: string;
    end?: string;
    preset?: 'today' | 'last_7_days' | 'last_30_days' | 'last_90_days' | 'this_month' | 'last_month';
  };
}

// ─── reports table ────────────────────────────────────────────────────────────

export const reports = pgTable('reports', {
  report_id:  uuid('report_id').primaryKey().defaultRandom(),
  tenant_id:  uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  name:       varchar('name', { length: 255 }).notNull(),
  definition: jsonb('definition').$type<ReportDefinition>().notNull().default({ metrics: [], visualizations: [], filters: [] }),
  created_by: uuid('created_by').notNull().references(() => users.user_id, { onDelete: 'cascade' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;

// ─── report_schedules table ───────────────────────────────────────────────────

export const reportSchedules = pgTable('report_schedules', {
  schedule_id: uuid('schedule_id').primaryKey().defaultRandom(),
  report_id:   uuid('report_id').notNull().references(() => reports.report_id, { onDelete: 'cascade' }),
  tenant_id:   uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  frequency:   reportFrequencyEnum('frequency').notNull(),
  recipients:  text('recipients').array().notNull().default([]),
  next_run_at: timestamp('next_run_at', { withTimezone: true }).notNull(),
  created_at:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type NewReportSchedule = typeof reportSchedules.$inferInsert;
