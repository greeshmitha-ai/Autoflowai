/**
 * Attribution Engine Service
 * Requirements: 24.1–24.6
 *
 * Supports three attribution models:
 *   first_touch  — 100% credit to the first touchpoint
 *   last_touch   — 100% credit to the last touchpoint
 *   linear       — equal credit distributed across all touchpoints
 */
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import {
  getDb,
  touchpoints,
  conversionEvents,
  attributionResults,
  customConversionEvents,
  type Touchpoint,
  type NewTouchpoint,
  type ConversionEvent,
  type NewConversionEvent,
  type AttributionResult,
  type NewAttributionResult,
  type CustomConversionEvent,
  type NewCustomConversionEvent,
} from '@platform/db';

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

export type AttributionModel = 'first_touch' | 'last_touch' | 'linear';

// ─── Touchpoint recording (Task 31.1) ─────────────────────────────────────────

export interface RecordTouchpointInput {
  contact_id: string;
  channel: 'email' | 'sms' | 'chatbot' | 'call' | 'campaign';
  campaign_id?: string | null;
  event_type: string;
  occurred_at?: Date;
}

export async function recordTouchpoint(
  tenantId: string,
  input: RecordTouchpointInput,
): Promise<Touchpoint> {
  if (!input.contact_id) throw new ValidationError('contact_id is required');
  if (!input.channel) throw new ValidationError('channel is required');
  if (!input.event_type) throw new ValidationError('event_type is required');

  const db = getDb();
  const newTouchpoint: NewTouchpoint = {
    tenant_id: tenantId,
    contact_id: input.contact_id,
    channel: input.channel,
    campaign_id: input.campaign_id ?? null,
    event_type: input.event_type,
    occurred_at: input.occurred_at ?? new Date(),
  };

  const [tp] = await db.insert(touchpoints).values(newTouchpoint).returning();
  if (!tp) throw new Error('Failed to record touchpoint');
  return tp;
}

export async function getContactTouchpoints(
  tenantId: string,
  contactId: string,
): Promise<Touchpoint[]> {
  const db = getDb();
  return db
    .select()
    .from(touchpoints)
    .where(and(eq(touchpoints.tenant_id, tenantId), eq(touchpoints.contact_id, contactId)))
    .orderBy(desc(touchpoints.occurred_at));
}

// ─── Attribution model calculation (Task 31.2) ────────────────────────────────

/**
 * Calculate credit fractions for a list of touchpoints using the given model.
 * Returns an array of { touchpoint_id, credit } where credit sums to 1.0.
 * If there are no touchpoints, returns an empty array.
 */
export function calculateCreditDistribution(
  tps: Touchpoint[],
  model: AttributionModel,
): Array<{ touchpoint_id: string; credit: number }> {
  if (tps.length === 0) return [];

  // Sort by occurred_at ascending (oldest first)
  const sorted = [...tps].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );

  switch (model) {
    case 'first_touch': {
      return sorted.map((tp, i) => ({
        touchpoint_id: tp.touchpoint_id,
        credit: i === 0 ? 1.0 : 0.0,
      }));
    }

    case 'last_touch': {
      const lastIdx = sorted.length - 1;
      return sorted.map((tp, i) => ({
        touchpoint_id: tp.touchpoint_id,
        credit: i === lastIdx ? 1.0 : 0.0,
      }));
    }

    case 'linear': {
      // Distribute equally; last touchpoint absorbs rounding remainder
      const equalShare = Math.floor((1.0 / sorted.length) * 10000) / 10000;
      const totalAssigned = equalShare * (sorted.length - 1);
      const lastShare = Math.round((1.0 - totalAssigned) * 10000) / 10000;

      return sorted.map((tp, i) => ({
        touchpoint_id: tp.touchpoint_id,
        credit: i === sorted.length - 1 ? lastShare : equalShare,
      }));
    }
  }
}

/**
 * Record a conversion event and calculate attribution results.
 * Called when deal.status_updated with new_status = 'won'.
 */
export async function recordConversionAndCalculate(
  tenantId: string,
  contactId: string,
  eventType: string,
  model: AttributionModel,
  occurredAt?: Date,
): Promise<{ conversion: ConversionEvent; results: AttributionResult[] }> {
  const db = getDb();

  // Insert conversion event
  const newConversion: NewConversionEvent = {
    tenant_id: tenantId,
    contact_id: contactId,
    event_type: eventType,
    occurred_at: occurredAt ?? new Date(),
  };

  const [conversion] = await db.insert(conversionEvents).values(newConversion).returning();
  if (!conversion) throw new Error('Failed to record conversion event');

  // Load all touchpoints for this contact prior to conversion
  const contactTouchpoints = await db
    .select()
    .from(touchpoints)
    .where(
      and(
        eq(touchpoints.tenant_id, tenantId),
        eq(touchpoints.contact_id, contactId),
        lte(touchpoints.occurred_at, conversion.occurred_at),
      ),
    )
    .orderBy(touchpoints.occurred_at);

  if (contactTouchpoints.length === 0) {
    return { conversion, results: [] };
  }

  const distribution = calculateCreditDistribution(contactTouchpoints, model);

  // Build attribution result rows
  const tpMap = new Map(contactTouchpoints.map((tp) => [tp.touchpoint_id, tp]));
  const resultRows: NewAttributionResult[] = distribution
    .filter((d) => d.credit > 0)
    .map((d) => {
      const tp = tpMap.get(d.touchpoint_id)!;
      return {
        tenant_id: tenantId,
        conversion_id: conversion.conversion_id,
        touchpoint_id: tp.touchpoint_id,
        contact_id: contactId,
        model,
        credit: d.credit.toFixed(4),
        channel: tp.channel,
        campaign_id: tp.campaign_id ?? null,
        occurred_at: tp.occurred_at,
      };
    });

  if (resultRows.length === 0) {
    return { conversion, results: [] };
  }

  const results = await db.insert(attributionResults).values(resultRows).returning();
  return { conversion, results };
}

// ─── Attribution report (Task 31.4) ───────────────────────────────────────────

export interface AttributionReportRow {
  channel: string;
  campaign_id: string | null;
  total_credit: number;
  conversion_count: number;
}

export interface AttributionReport {
  model: AttributionModel;
  from: string;
  to: string;
  rows: AttributionReportRow[];
  generated_at: string;
}

export async function getAttributionReport(
  tenantId: string,
  model: AttributionModel,
  from: Date,
  to: Date,
): Promise<AttributionReport> {
  const db = getDb();

  const rows = await db
    .select({
      channel: attributionResults.channel,
      campaign_id: attributionResults.campaign_id,
      total_credit: sql<number>`sum(credit::numeric)::float`,
      conversion_count: sql<number>`count(distinct conversion_id)::int`,
    })
    .from(attributionResults)
    .where(
      and(
        eq(attributionResults.tenant_id, tenantId),
        eq(attributionResults.model, model),
        gte(attributionResults.occurred_at, from),
        lte(attributionResults.occurred_at, to),
      ),
    )
    .groupBy(attributionResults.channel, attributionResults.campaign_id)
    .orderBy(desc(sql`sum(credit::numeric)`));

  return {
    model,
    from: from.toISOString(),
    to: to.toISOString(),
    rows: rows.map((r) => ({
      channel: r.channel,
      campaign_id: r.campaign_id,
      total_credit: r.total_credit ?? 0,
      conversion_count: r.conversion_count ?? 0,
    })),
    generated_at: new Date().toISOString(),
  };
}

// ─── Custom conversion events (Task 31.4) ─────────────────────────────────────

export async function defineCustomConversionEvent(
  tenantId: string,
  eventType: string,
  description?: string,
): Promise<CustomConversionEvent> {
  if (!eventType?.trim()) throw new ValidationError('event_type is required');

  const db = getDb();
  const newEvent: NewCustomConversionEvent = {
    tenant_id: tenantId,
    event_type: eventType.trim(),
    description: description?.trim() ?? null,
  };

  const [created] = await db
    .insert(customConversionEvents)
    .values(newEvent)
    .onConflictDoUpdate({
      target: [customConversionEvents.tenant_id, customConversionEvents.event_type],
      set: { description: newEvent.description ?? null },
    })
    .returning();

  if (!created) throw new Error('Failed to define custom conversion event');
  return created;
}

export async function listCustomConversionEvents(
  tenantId: string,
): Promise<CustomConversionEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(customConversionEvents)
    .where(eq(customConversionEvents.tenant_id, tenantId))
    .orderBy(customConversionEvents.created_at);
}

// ─── Metrics for Report Builder (Task 31.5) ───────────────────────────────────

export interface AttributionMetricDefinition {
  id: string;
  label: string;
  subsystem: string;
  field: string;
  aggregation: string;
  description: string;
}

export function getAttributionMetrics(): AttributionMetricDefinition[] {
  return [
    {
      id: 'attribution.credit_by_channel',
      label: 'Attribution Credit by Channel',
      subsystem: 'attribution',
      field: 'credit',
      aggregation: 'sum',
      description: 'Total attribution credit distributed per channel',
    },
    {
      id: 'attribution.conversions_by_channel',
      label: 'Conversions by Channel',
      subsystem: 'attribution',
      field: 'conversion_count',
      aggregation: 'count',
      description: 'Number of conversions attributed to each channel',
    },
    {
      id: 'attribution.touchpoints_count',
      label: 'Touchpoints Count',
      subsystem: 'attribution',
      field: 'touchpoint_id',
      aggregation: 'count',
      description: 'Total number of tracked touchpoints',
    },
    {
      id: 'attribution.credit_by_campaign',
      label: 'Attribution Credit by Campaign',
      subsystem: 'attribution',
      field: 'credit',
      aggregation: 'sum',
      description: 'Total attribution credit distributed per campaign',
    },
  ];
}
