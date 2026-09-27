/**
 * Report Service — CRUD, execution engine, caching, and scheduling.
 * Requirements: 23.1–23.7
 */
import { eq, and, desc } from 'drizzle-orm';
import {
  getDb,
  reports,
  reportSchedules,
  contacts,
  campaigns,
  deals,
  type Report,
  type NewReport,
  type ReportSchedule,
  type NewReportSchedule,
  type ReportDefinition,
  type ReportMetric,
  type ReportVisualization,
} from '@platform/db';
import { TenantCache } from '@platform/cache';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ─── Report CRUD ──────────────────────────────────────────────────────────────

export interface CreateReportInput {
  name: string;
  definition: ReportDefinition;
}

export async function createReport(
  tenantId: string,
  userId: string,
  input: CreateReportInput,
): Promise<Report> {
  if (!input.name?.trim()) throw new ValidationError('name is required');
  if (!input.definition) throw new ValidationError('definition is required');

  const db = getDb();
  const newReport: NewReport = {
    tenant_id: tenantId,
    name: input.name.trim(),
    definition: input.definition,
    created_by: userId,
  };

  const [report] = await db.insert(reports).values(newReport).returning();
  if (!report) throw new Error('Failed to create report');
  return report;
}

export async function listReports(tenantId: string): Promise<Report[]> {
  const db = getDb();
  return db
    .select()
    .from(reports)
    .where(eq(reports.tenant_id, tenantId))
    .orderBy(desc(reports.created_at));
}

export async function getReport(tenantId: string, reportId: string): Promise<Report> {
  const db = getDb();
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.tenant_id, tenantId), eq(reports.report_id, reportId)))
    .limit(1);

  if (!report) throw new NotFoundError(`Report ${reportId} not found`);
  return report;
}

export async function updateReport(
  tenantId: string,
  reportId: string,
  input: Partial<CreateReportInput>,
): Promise<Report> {
  const db = getDb();

  // Verify exists
  await getReport(tenantId, reportId);

  const updates: Partial<NewReport> = { updated_at: new Date() };
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new ValidationError('name cannot be empty');
    updates.name = input.name.trim();
  }
  if (input.definition !== undefined) {
    updates.definition = input.definition;
  }

  const [updated] = await db
    .update(reports)
    .set(updates)
    .where(and(eq(reports.tenant_id, tenantId), eq(reports.report_id, reportId)))
    .returning();

  if (!updated) throw new Error('Failed to update report');

  // Invalidate cache
  const cache = new TenantCache(tenantId, 'reports');
  await cache.del(`data:${reportId}`);

  return updated;
}

// ─── Report execution engine ──────────────────────────────────────────────────

export interface VisualizationResult {
  visualization_id: string;
  type: ReportVisualization['type'];
  title?: string;
  data?: unknown;
  error?: string;
  metric?: string;
}

export interface ReportDataResult {
  report_id: string;
  name: string;
  executed_at: string;
  cached: boolean;
  visualizations: VisualizationResult[];
}

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes

export async function executeReport(
  tenantId: string,
  reportId: string,
): Promise<ReportDataResult> {
  const report = await getReport(tenantId, reportId);
  const cache = new TenantCache(tenantId, 'reports');
  const cacheKey = `data:${reportId}`;

  // Check cache first (Req 23.5)
  const cached = await cache.get<ReportDataResult>(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  const definition = report.definition as ReportDefinition;
  const visualizations: VisualizationResult[] = [];

  for (const viz of definition.visualizations ?? []) {
    try {
      const data = await executeVisualization(tenantId, viz, definition);
      visualizations.push({
        visualization_id: viz.id,
        type: viz.type,
        title: viz.title,
        data,
      });
    } catch (err) {
      // Req 23.7: graceful unavailable-metric error handling
      const metricId = viz.metric_ids?.[0] ?? viz.id;
      visualizations.push({
        visualization_id: viz.id,
        type: viz.type,
        title: viz.title,
        error: 'metric_unavailable',
        metric: metricId,
      });
    }
  }

  const result: ReportDataResult = {
    report_id: reportId,
    name: report.name,
    executed_at: new Date().toISOString(),
    cached: false,
    visualizations,
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });

  return result;
}

async function executeVisualization(
  tenantId: string,
  viz: ReportVisualization,
  definition: ReportDefinition,
): Promise<unknown> {
  const db = getDb();
  const metricResults: Record<string, unknown> = {};

  for (const metricId of viz.metric_ids) {
    const metric = definition.metrics.find((m) => m.id === metricId);
    if (!metric) {
      throw new Error(`metric_unavailable: ${metricId}`);
    }
    metricResults[metricId] = await executeMetric(tenantId, metric, definition, db);
  }

  return metricResults;
}

async function executeMetric(
  tenantId: string,
  metric: ReportMetric,
  definition: ReportDefinition,
  db: ReturnType<typeof getDb>,
): Promise<unknown> {
  const { subsystem, field, aggregation } = metric;

  // Build date range filter
  const dateRange = resolveDateRange(definition.date_range);

  switch (subsystem) {
    case 'contacts':
      return executeContactsMetric(tenantId, field, aggregation, dateRange, db);
    case 'campaigns':
      return executeCampaignsMetric(tenantId, field, aggregation, dateRange, db);
    case 'deals':
      return executeDealsMetric(tenantId, field, aggregation, dateRange, db);
    case 'calls':
      return executeCallsMetric(tenantId, field, aggregation, dateRange, db);
    case 'surveys':
      return executeSurveysMetric(tenantId, field, aggregation, dateRange, db);
    default:
      throw new Error(`metric_unavailable: unknown subsystem ${subsystem}`);
  }
}

interface DateRange {
  start: Date;
  end: Date;
}

function resolveDateRange(
  dateRangeConfig?: ReportDefinition['date_range'],
): DateRange {
  const now = new Date();
  const end = new Date(now);

  if (!dateRangeConfig) {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }

  if (dateRangeConfig.start && dateRangeConfig.end) {
    return {
      start: new Date(dateRangeConfig.start),
      end: new Date(dateRangeConfig.end),
    };
  }

  const preset = dateRangeConfig.preset ?? 'last_30_days';
  const start = new Date(now);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'last_7_days':
      start.setDate(start.getDate() - 7);
      break;
    case 'last_30_days':
      start.setDate(start.getDate() - 30);
      break;
    case 'last_90_days':
      start.setDate(start.getDate() - 90);
      break;
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last_month': {
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0); // last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
    }
    default:
      start.setDate(start.getDate() - 30);
  }

  return { start, end };
}

async function executeContactsMetric(
  tenantId: string,
  field: string,
  aggregation: ReportMetric['aggregation'],
  dateRange: DateRange,
  db: ReturnType<typeof getDb>,
): Promise<unknown> {
  const { sql } = await import('drizzle-orm');

  if (aggregation === 'count') {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenant_id, tenantId),
          sql`${contacts.created_at} >= ${dateRange.start.toISOString()}`,
          sql`${contacts.created_at} <= ${dateRange.end.toISOString()}`,
        ),
      );
    return result[0]?.count ?? 0;
  }

  if (field === 'lead_score' && (aggregation === 'avg' || aggregation === 'sum' || aggregation === 'min' || aggregation === 'max')) {
    const aggFn = aggregation === 'avg' ? sql<number>`avg(lead_score)::float`
      : aggregation === 'sum' ? sql<number>`sum(lead_score)::int`
      : aggregation === 'min' ? sql<number>`min(lead_score)::int`
      : sql<number>`max(lead_score)::int`;

    const result = await db
      .select({ value: aggFn })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenant_id, tenantId),
          sql`${contacts.created_at} >= ${dateRange.start.toISOString()}`,
          sql`${contacts.created_at} <= ${dateRange.end.toISOString()}`,
        ),
      );
    return result[0]?.value ?? 0;
  }

  throw new Error(`metric_unavailable: contacts.${field}.${aggregation}`);
}

async function executeCampaignsMetric(
  tenantId: string,
  field: string,
  aggregation: ReportMetric['aggregation'],
  dateRange: DateRange,
  db: ReturnType<typeof getDb>,
): Promise<unknown> {
  const { sql } = await import('drizzle-orm');

  if (aggregation === 'count') {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.tenant_id, tenantId),
          sql`${campaigns.created_at} >= ${dateRange.start.toISOString()}`,
          sql`${campaigns.created_at} <= ${dateRange.end.toISOString()}`,
        ),
      );
    return result[0]?.count ?? 0;
  }

  throw new Error(`metric_unavailable: campaigns.${field}.${aggregation}`);
}

async function executeDealsMetric(
  tenantId: string,
  field: string,
  aggregation: ReportMetric['aggregation'],
  dateRange: DateRange,
  db: ReturnType<typeof getDb>,
): Promise<unknown> {
  const { sql } = await import('drizzle-orm');

  if (aggregation === 'count') {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(
        and(
          eq(deals.tenant_id, tenantId),
          sql`${deals.created_at} >= ${dateRange.start.toISOString()}`,
          sql`${deals.created_at} <= ${dateRange.end.toISOString()}`,
        ),
      );
    return result[0]?.count ?? 0;
  }

  if (field === 'value' && aggregation === 'sum') {
    const result = await db
      .select({ value: sql<number>`coalesce(sum(value), 0)::float` })
      .from(deals)
      .where(
        and(
          eq(deals.tenant_id, tenantId),
          sql`${deals.created_at} >= ${dateRange.start.toISOString()}`,
          sql`${deals.created_at} <= ${dateRange.end.toISOString()}`,
        ),
      );
    return result[0]?.value ?? 0;
  }

  throw new Error(`metric_unavailable: deals.${field}.${aggregation}`);
}

async function executeCallsMetric(
  tenantId: string,
  field: string,
  aggregation: ReportMetric['aggregation'],
  _dateRange: DateRange,
  db: ReturnType<typeof getDb>,
): Promise<unknown> {
  const { sql, calls } = await import('@platform/db');

  if (aggregation === 'count') {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(calls)
      .where(eq(calls.tenant_id, tenantId));
    return result[0]?.count ?? 0;
  }

  if (field === 'duration_seconds' && (aggregation === 'avg' || aggregation === 'sum')) {
    const aggFn = aggregation === 'avg'
      ? sql<number>`avg(duration_seconds)::float`
      : sql<number>`sum(duration_seconds)::int`;

    const result = await db
      .select({ value: aggFn })
      .from(calls)
      .where(eq(calls.tenant_id, tenantId));
    return result[0]?.value ?? 0;
  }

  throw new Error(`metric_unavailable: calls.${field}.${aggregation}`);
}

async function executeSurveysMetric(
  tenantId: string,
  field: string,
  aggregation: ReportMetric['aggregation'],
  _dateRange: DateRange,
  db: ReturnType<typeof getDb>,
): Promise<unknown> {
  const { sql, surveys } = await import('@platform/db');

  if (aggregation === 'count') {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(surveys)
      .where(eq(surveys.tenant_id, tenantId));
    return result[0]?.count ?? 0;
  }

  throw new Error(`metric_unavailable: surveys.${field}.${aggregation}`);
}

// ─── Schedule CRUD ────────────────────────────────────────────────────────────

export interface CreateScheduleInput {
  frequency: 'daily' | 'weekly' | 'monthly';
  recipients: string[];
}

export async function createOrUpdateSchedule(
  tenantId: string,
  reportId: string,
  input: CreateScheduleInput,
): Promise<ReportSchedule> {
  if (!input.frequency) throw new ValidationError('frequency is required');
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    throw new ValidationError('recipients must be a non-empty array');
  }

  // Verify report exists and belongs to tenant
  await getReport(tenantId, reportId);

  const db = getDb();
  const nextRunAt = computeNextRunAt(input.frequency);

  // Upsert: delete existing schedule for this report, then insert
  await db
    .delete(reportSchedules)
    .where(and(eq(reportSchedules.tenant_id, tenantId), eq(reportSchedules.report_id, reportId)));

  const newSchedule: NewReportSchedule = {
    report_id: reportId,
    tenant_id: tenantId,
    frequency: input.frequency,
    recipients: input.recipients,
    next_run_at: nextRunAt,
  };

  const [schedule] = await db.insert(reportSchedules).values(newSchedule).returning();
  if (!schedule) throw new Error('Failed to create schedule');
  return schedule;
}

export function computeNextRunAt(frequency: 'daily' | 'weekly' | 'monthly'): Date {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      break;
    case 'weekly':
      next.setDate(next.getDate() + (7 - next.getDay())); // next Sunday
      next.setHours(8, 0, 0, 0);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1, 1);
      next.setHours(8, 0, 0, 0);
      break;
  }

  return next;
}
