import { eq, and, sql, lte, inArray, ne } from 'drizzle-orm';
import {
  getDb,
  pipelines,
  pipelineStages,
  deals,
  dealStageHistory,
  dealActivities,
  type Pipeline,
  type PipelineStage,
  type Deal,
  type DealStageHistory,
  type DealActivity,
  type NewDeal,
  type NewDealActivity,
} from '@platform/db';
import { createPublisher } from '@platform/events';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ─── Forecast types ───────────────────────────────────────────────────────────

export interface ForecastBucket {
  label: string;       // e.g. "2024-W23" or "2024-06"
  start: string;       // ISO date
  end: string;         // ISO date
  weighted_value: number;
  deal_count: number;
}

export interface ForecastResult {
  pipeline_id: string;
  generated_at: string;
  weekly: ForecastBucket[];
  monthly: ForecastBucket[];
}

// ─── Board types ──────────────────────────────────────────────────────────────

export interface BoardColumn {
  stage_id: string;
  stage_name: string;
  position: number;
  win_probability: number;
  total_value: number;
  deal_count: number;
  deals: Deal[];
}

export interface BoardResult {
  pipeline_id: string;
  columns: BoardColumn[];
}

// ─── Pipeline management ──────────────────────────────────────────────────────

export async function createPipeline(
  tenantId: string,
  name: string,
): Promise<Pipeline> {
  const db = getDb();
  const [pipeline] = await db
    .insert(pipelines)
    .values({ tenant_id: tenantId, name })
    .returning();
  if (!pipeline) throw new Error('Failed to create pipeline');
  return pipeline;
}

export async function getPipeline(
  tenantId: string,
  pipelineId: string,
): Promise<Pipeline> {
  const db = getDb();
  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.tenant_id, tenantId), eq(pipelines.pipeline_id, pipelineId)))
    .limit(1);
  if (!pipeline) throw new NotFoundError('Pipeline not found');
  return pipeline;
}

// ─── Deal CRUD ────────────────────────────────────────────────────────────────

export async function createDeal(
  tenantId: string,
  pipelineId: string,
  userId: string,
  body: {
    contact_id: string;
    name: string;
    stage_id: string;
    value?: number;
    expected_close_date?: string;
    owner_id?: string;
  },
): Promise<Deal> {
  const db = getDb();

  // Verify pipeline belongs to tenant
  await getPipeline(tenantId, pipelineId);

  // Verify stage belongs to pipeline
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.stage_id, body.stage_id),
        eq(pipelineStages.pipeline_id, pipelineId),
        eq(pipelineStages.tenant_id, tenantId),
      ),
    )
    .limit(1);

  if (!stage) throw new ValidationError('Stage not found in this pipeline');

  const newDeal: NewDeal = {
    tenant_id: tenantId,
    pipeline_id: pipelineId,
    contact_id: body.contact_id,
    name: body.name,
    stage_id: body.stage_id,
    value: body.value?.toString() ?? '0',
    expected_close_date: body.expected_close_date ?? null,
    owner_id: body.owner_id ?? userId,
    status: 'open',
  };

  const [deal] = await db.insert(deals).values(newDeal).returning();
  if (!deal) throw new Error('Failed to create deal');

  // Record initial stage history (from_stage_id = null for new deals)
  await db.insert(dealStageHistory).values({
    deal_id: deal.deal_id,
    tenant_id: tenantId,
    from_stage_id: null,
    to_stage_id: body.stage_id,
    changed_by: userId,
  });

  return deal;
}

export async function getDeal(tenantId: string, dealId: string): Promise<Deal> {
  const db = getDb();
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.tenant_id, tenantId), eq(deals.deal_id, dealId)))
    .limit(1);
  if (!deal) throw new NotFoundError('Deal not found');
  return deal;
}

export async function updateDeal(
  tenantId: string,
  dealId: string,
  userId: string,
  body: {
    name?: string;
    stage_id?: string;
    value?: number;
    expected_close_date?: string | null;
    owner_id?: string;
    status?: 'open' | 'won' | 'lost' | 'overdue';
  },
): Promise<Deal> {
  const db = getDb();

  const existing = await getDeal(tenantId, dealId);

  const stageChanged = body.stage_id && body.stage_id !== existing.stage_id;

  // If stage is changing, verify the new stage belongs to the same pipeline
  if (stageChanged && body.stage_id) {
    const [stage] = await db
      .select()
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.stage_id, body.stage_id),
          eq(pipelineStages.pipeline_id, existing.pipeline_id),
          eq(pipelineStages.tenant_id, tenantId),
        ),
      )
      .limit(1);
    if (!stage) throw new ValidationError('Stage not found in this pipeline');
  }

  const updateValues: Partial<typeof deals.$inferInsert> = {};
  if (body.name !== undefined) updateValues.name = body.name;
  if (body.stage_id !== undefined) updateValues.stage_id = body.stage_id;
  if (body.value !== undefined) updateValues.value = body.value.toString();
  if (body.expected_close_date !== undefined)
    updateValues.expected_close_date = body.expected_close_date;
  if (body.owner_id !== undefined) updateValues.owner_id = body.owner_id;
  if (body.status !== undefined) updateValues.status = body.status;

  const [updated] = await db
    .update(deals)
    .set(updateValues)
    .where(and(eq(deals.tenant_id, tenantId), eq(deals.deal_id, dealId)))
    .returning();

  if (!updated) throw new Error('Failed to update deal');

  // Record stage transition if stage changed
  if (stageChanged && body.stage_id) {
    await db.insert(dealStageHistory).values({
      deal_id: dealId,
      tenant_id: tenantId,
      from_stage_id: existing.stage_id,
      to_stage_id: body.stage_id,
      changed_by: userId,
    });
  }

  return updated;
}

// ─── Kanban board ─────────────────────────────────────────────────────────────

export async function getPipelineBoard(
  tenantId: string,
  pipelineId: string,
): Promise<BoardResult> {
  const db = getDb();

  // Verify pipeline
  await getPipeline(tenantId, pipelineId);

  // Load all stages for this pipeline ordered by position
  const stages = await db
    .select()
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.pipeline_id, pipelineId),
        eq(pipelineStages.tenant_id, tenantId),
      ),
    )
    .orderBy(pipelineStages.position);

  // Load all open deals for this pipeline
  const pipelineDeals = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.pipeline_id, pipelineId),
        eq(deals.tenant_id, tenantId),
      ),
    );

  // Group deals by stage
  const dealsByStage = new Map<string, Deal[]>();
  for (const deal of pipelineDeals) {
    const stageDeals = dealsByStage.get(deal.stage_id) ?? [];
    stageDeals.push(deal);
    dealsByStage.set(deal.stage_id, stageDeals);
  }

  const columns: BoardColumn[] = stages.map((stage) => {
    const stageDeals = dealsByStage.get(stage.stage_id) ?? [];
    const totalValue = stageDeals.reduce((sum, d) => sum + parseFloat(d.value ?? '0'), 0);
    return {
      stage_id: stage.stage_id,
      stage_name: stage.name,
      position: stage.position,
      win_probability: parseFloat(stage.win_probability),
      total_value: totalValue,
      deal_count: stageDeals.length,
      deals: stageDeals,
    };
  });

  return { pipeline_id: pipelineId, columns };
}

// ─── Forecast calculation ─────────────────────────────────────────────────────

/**
 * Calculate weighted revenue forecast for the next 90 days.
 * Weighted value = deal.value × stage.win_probability
 * Aggregated by ISO week and calendar month.
 */
export function calculateForecast(
  openDeals: Array<{ value: string; win_probability: string; expected_close_date: string | null }>,
  referenceDate: Date = new Date(),
): { weekly: ForecastBucket[]; monthly: ForecastBucket[] } {
  const horizon = new Date(referenceDate);
  horizon.setDate(horizon.getDate() + 90);

  // Build week buckets (ISO weeks) for next 90 days
  const weekBuckets = new Map<string, ForecastBucket>();
  const monthBuckets = new Map<string, ForecastBucket>();

  // Pre-generate all week and month buckets in the 90-day window
  const cursor = new Date(referenceDate);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= horizon) {
    const weekLabel = getIsoWeekLabel(cursor);
    const monthLabel = getMonthLabel(cursor);

    if (!weekBuckets.has(weekLabel)) {
      const { start, end } = getWeekRange(cursor);
      weekBuckets.set(weekLabel, {
        label: weekLabel,
        start: start.toISOString().split('T')[0]!,
        end: end.toISOString().split('T')[0]!,
        weighted_value: 0,
        deal_count: 0,
      });
    }

    if (!monthBuckets.has(monthLabel)) {
      const { start, end } = getMonthRange(cursor);
      monthBuckets.set(monthLabel, {
        label: monthLabel,
        start: start.toISOString().split('T')[0]!,
        end: end.toISOString().split('T')[0]!,
        weighted_value: 0,
        deal_count: 0,
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  // Distribute deal weighted values into buckets
  for (const deal of openDeals) {
    if (!deal.expected_close_date) continue;

    const closeDate = new Date(deal.expected_close_date);
    closeDate.setHours(0, 0, 0, 0);

    // Only include deals closing within the 90-day window
    if (closeDate < referenceDate || closeDate > horizon) continue;

    const value = parseFloat(deal.value) || 0;
    const prob = parseFloat(deal.win_probability) || 0;
    const weighted = value * prob;

    const weekLabel = getIsoWeekLabel(closeDate);
    const monthLabel = getMonthLabel(closeDate);

    const weekBucket = weekBuckets.get(weekLabel);
    if (weekBucket) {
      weekBucket.weighted_value += weighted;
      weekBucket.deal_count += 1;
    }

    const monthBucket = monthBuckets.get(monthLabel);
    if (monthBucket) {
      monthBucket.weighted_value += weighted;
      monthBucket.deal_count += 1;
    }
  }

  // Round weighted values to 2 decimal places
  const roundBuckets = (buckets: ForecastBucket[]): ForecastBucket[] =>
    buckets.map((b) => ({ ...b, weighted_value: Math.round(b.weighted_value * 100) / 100 }));

  return {
    weekly: roundBuckets(Array.from(weekBuckets.values())),
    monthly: roundBuckets(Array.from(monthBuckets.values())),
  };
}

export async function getPipelineForecast(
  tenantId: string,
  pipelineId: string,
): Promise<ForecastResult> {
  const db = getDb();

  // Verify pipeline
  await getPipeline(tenantId, pipelineId);

  // Load open deals with their stage win_probability
  const openDeals = await db
    .select({
      value: deals.value,
      win_probability: pipelineStages.win_probability,
      expected_close_date: deals.expected_close_date,
    })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stage_id, pipelineStages.stage_id))
    .where(
      and(
        eq(deals.pipeline_id, pipelineId),
        eq(deals.tenant_id, tenantId),
        eq(deals.status, 'open'),
      ),
    );

  const { weekly, monthly } = calculateForecast(openDeals);

  return {
    pipeline_id: pipelineId,
    generated_at: new Date().toISOString(),
    weekly,
    monthly,
  };
}

// ─── Activity logging ─────────────────────────────────────────────────────────

export async function logActivity(
  tenantId: string,
  dealId: string,
  userId: string,
  body: {
    type: 'call' | 'email' | 'meeting' | 'note';
    content: string;
    contact_id?: string;
  },
): Promise<DealActivity> {
  const db = getDb();

  // Verify deal belongs to tenant
  await getDeal(tenantId, dealId);

  const newActivity: NewDealActivity = {
    deal_id: dealId,
    tenant_id: tenantId,
    contact_id: body.contact_id ?? null,
    type: body.type,
    content: body.content,
    logged_by: userId,
  };

  const [activity] = await db.insert(dealActivities).values(newActivity).returning();
  if (!activity) throw new Error('Failed to log activity');
  return activity;
}

export async function getDealActivities(
  tenantId: string,
  dealId: string,
): Promise<DealActivity[]> {
  const db = getDb();
  await getDeal(tenantId, dealId);
  return db
    .select()
    .from(dealActivities)
    .where(and(eq(dealActivities.tenant_id, tenantId), eq(dealActivities.deal_id, dealId)))
    .orderBy(sql`logged_at DESC`);
}

// ─── Overdue detection ────────────────────────────────────────────────────────

export async function detectAndFlagOverdueDeals(
  kafkaBrokers: string[],
): Promise<{ flagged: number }> {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find open deals past their expected_close_date
  const overdueDeals = await db
    .select()
    .from(deals)
    .where(
      and(
        eq(deals.status, 'open'),
        lte(deals.expected_close_date, today.toISOString().split('T')[0]!),
      ),
    );

  if (overdueDeals.length === 0) return { flagged: 0 };

  const overdueIds = overdueDeals.map((d) => d.deal_id);

  // Bulk update to overdue status
  await db
    .update(deals)
    .set({ status: 'overdue' })
    .where(inArray(deals.deal_id, overdueIds));

  // Publish notification events per deal owner
  const ownerGroups = new Map<string, typeof overdueDeals>();
  for (const deal of overdueDeals) {
    const group = ownerGroups.get(deal.tenant_id) ?? [];
    group.push(deal);
    ownerGroups.set(deal.tenant_id, group);
  }

  for (const [tenantId, tenantDeals] of ownerGroups) {
    try {
      const publisher = createPublisher(tenantId, { brokers: kafkaBrokers });
      await publisher.connect();
      for (const deal of tenantDeals) {
        await publisher.publish(
          'crm',
          'deal.overdue' as never,
          {
            deal_id: deal.deal_id,
            deal_name: deal.name,
            owner_id: deal.owner_id,
            pipeline_id: deal.pipeline_id,
            expected_close_date: deal.expected_close_date,
          } as never,
        );
      }
      await publisher.disconnect();
    } catch (err) {
      console.error(`Failed to publish overdue events for tenant ${tenantId}:`, err);
    }
  }

  return { flagged: overdueDeals.length };
}

// ─── Stage history ────────────────────────────────────────────────────────────

export async function getDealStageHistory(
  tenantId: string,
  dealId: string,
): Promise<DealStageHistory[]> {
  const db = getDb();
  await getDeal(tenantId, dealId);
  return db
    .select()
    .from(dealStageHistory)
    .where(
      and(eq(dealStageHistory.tenant_id, tenantId), eq(dealStageHistory.deal_id, dealId)),
    )
    .orderBy(sql`changed_at ASC`);
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getIsoWeekLabel(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // ISO week: Thursday determines the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const year = d.getFullYear();
  const week = Math.ceil(
    ((d.getTime() - new Date(year, 0, 4).getTime()) / 86400000 + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // Monday
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function getMonthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}
