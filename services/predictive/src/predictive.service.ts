import { eq, and, desc, sql, gt } from 'drizzle-orm';
import {
  getDb,
  contacts,
  churnRiskScores,
  contactOptimalTimes,
  contactNextActions,
  type ChurnRiskScore,
  type ContactOptimalTime,
  type ContactNextAction,
} from '@platform/db';
import { TenantCache } from '@platform/cache';
import { EventPublisher } from '@platform/events';
import { computeChurnRisk, type ChurnSignals } from './churn.js';
import { computeOptimalTime, type ResponseEvent } from './optimal-time.js';
import { computeNextAction } from './next-action.js';

/** Minimum interaction records required before generating predictions */
const MIN_INTERACTION_RECORDS = 100;

/** Cache TTL: 24 hours in seconds */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export interface TenantInsights {
  data_sufficient: boolean;
  high_risk_contacts: ChurnRiskScore[];
  optimal_times: ContactOptimalTime[];
  next_actions: ContactNextAction[];
}

export interface ContactInsights {
  contact_id: string;
  churn_risk: ChurnRiskScore | null;
  optimal_time: ContactOptimalTime | null;
  next_action: ContactNextAction | null;
}

export class PredictiveService {
  // ─── Churn Risk ────────────────────────────────────────────────────────────

  /**
   * Compute and persist churn risk for all active contacts in a tenant.
   * Called by the weekly scheduler.
   */
  async computeChurnRiskForTenant(tenantId: string): Promise<void> {
    const db = getDb();

    // Check data sufficiency
    const interactionCount = await this.getInteractionCount(tenantId);
    if (interactionCount < MIN_INTERACTION_RECORDS) {
      console.info(
        `[predictive] Tenant ${tenantId} has only ${interactionCount} interaction records — skipping churn calculation`,
      );
      return;
    }

    const batchSize = 100;
    let offset = 0;

    while (true) {
      const batch = await db
        .select({ contact_id: contacts.contact_id })
        .from(contacts)
        .where(eq(contacts.tenant_id, tenantId))
        .limit(batchSize)
        .offset(offset);

      if (batch.length === 0) break;

      for (const { contact_id } of batch) {
        try {
          await this.computeChurnRiskForContact(tenantId, contact_id);
        } catch (err) {
          console.error(`[predictive] Failed churn calc for contact ${contact_id}:`, err);
        }
      }

      offset += batchSize;
      if (batch.length < batchSize) break;
    }

    // Publish high-risk events and invalidate cache
    await this.publishHighRiskEvents(tenantId);
    await this.invalidateTenantCache(tenantId);
  }

  async computeChurnRiskForContact(tenantId: string, contactId: string): Promise<void> {
    const db = getDb();
    const signals = await this.gatherChurnSignals(tenantId, contactId);
    const result = computeChurnRisk(signals);

    // Upsert: delete old record and insert new one
    await db
      .delete(churnRiskScores)
      .where(
        and(
          eq(churnRiskScores.contact_id, contactId),
          eq(churnRiskScores.tenant_id, tenantId),
        ),
      );

    await db.insert(churnRiskScores).values({
      contact_id: contactId,
      tenant_id: tenantId,
      churn_risk_score: result.score,
      risk_level: result.risk_level,
      factors: result.factors,
    });
  }

  // ─── Optimal Time ──────────────────────────────────────────────────────────

  async computeOptimalTimesForTenant(tenantId: string): Promise<void> {
    const db = getDb();
    const batchSize = 100;
    let offset = 0;

    while (true) {
      const batch = await db
        .select({ contact_id: contacts.contact_id })
        .from(contacts)
        .where(eq(contacts.tenant_id, tenantId))
        .limit(batchSize)
        .offset(offset);

      if (batch.length === 0) break;

      for (const { contact_id } of batch) {
        try {
          await this.computeOptimalTimeForContact(tenantId, contact_id);
        } catch (err) {
          console.error(`[predictive] Failed optimal time calc for contact ${contact_id}:`, err);
        }
      }

      offset += batchSize;
      if (batch.length < batchSize) break;
    }

    await this.invalidateTenantCache(tenantId);
  }

  async computeOptimalTimeForContact(tenantId: string, contactId: string): Promise<void> {
    const db = getDb();
    const events = await this.gatherResponseEvents(tenantId, contactId);
    const result = computeOptimalTime(events);

    // Upsert
    await db
      .delete(contactOptimalTimes)
      .where(
        and(
          eq(contactOptimalTimes.contact_id, contactId),
          eq(contactOptimalTimes.tenant_id, tenantId),
        ),
      );

    await db.insert(contactOptimalTimes).values({
      contact_id: contactId,
      tenant_id: tenantId,
      best_day_of_week: result.best_day_of_week,
      best_hour_of_day: result.best_hour_of_day,
      confidence: result.confidence,
    });
  }

  // ─── Next-Best-Action ──────────────────────────────────────────────────────

  async computeNextActionsForTenant(tenantId: string): Promise<void> {
    const db = getDb();
    const batchSize = 100;
    let offset = 0;

    while (true) {
      const batch = await db
        .select()
        .from(contacts)
        .where(eq(contacts.tenant_id, tenantId))
        .limit(batchSize)
        .offset(offset);

      if (batch.length === 0) break;

      for (const contact of batch) {
        try {
          await this.computeNextActionForContact(tenantId, contact.contact_id);
        } catch (err) {
          console.error(`[predictive] Failed next-action calc for contact ${contact.contact_id}:`, err);
        }
      }

      offset += batchSize;
      if (batch.length < batchSize) break;
    }

    await this.invalidateTenantCache(tenantId);
  }

  async computeNextActionForContact(tenantId: string, contactId: string): Promise<void> {
    const db = getDb();

    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.contact_id, contactId), eq(contacts.tenant_id, tenantId)))
      .limit(1);

    if (!contact) return;

    // Get latest churn risk score
    const [churnRow] = await db
      .select()
      .from(churnRiskScores)
      .where(
        and(
          eq(churnRiskScores.contact_id, contactId),
          eq(churnRiskScores.tenant_id, tenantId),
        ),
      )
      .orderBy(desc(churnRiskScores.calculated_at))
      .limit(1);

    const daysSinceLastContact = await this.getDaysSinceLastContact(tenantId, contactId);

    const result = computeNextAction({
      leadScore: contact.lead_score,
      churnRiskScore: churnRow?.churn_risk_score ?? 0,
      daysSinceLastContact,
      lifecycleStage: contact.lifecycle_stage,
    });

    // Upsert
    await db
      .delete(contactNextActions)
      .where(
        and(
          eq(contactNextActions.contact_id, contactId),
          eq(contactNextActions.tenant_id, tenantId),
        ),
      );

    await db.insert(contactNextActions).values({
      contact_id: contactId,
      tenant_id: tenantId,
      action: result.action,
      reason: result.reason,
      confidence: result.confidence,
    });
  }

  // ─── Insights Queries ──────────────────────────────────────────────────────

  async getTenantInsights(tenantId: string): Promise<TenantInsights> {
    const cache = new TenantCache(tenantId, 'predictive');
    const cacheKey = 'tenant_insights';

    const cached = await cache.get<TenantInsights>(cacheKey);
    if (cached) return cached;

    const db = getDb();
    const interactionCount = await this.getInteractionCount(tenantId);

    if (interactionCount < MIN_INTERACTION_RECORDS) {
      const result: TenantInsights = {
        data_sufficient: false,
        high_risk_contacts: [],
        optimal_times: [],
        next_actions: [],
      };
      await cache.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });
      return result;
    }

    const [highRiskContacts, optimalTimes, nextActions] = await Promise.all([
      db
        .select()
        .from(churnRiskScores)
        .where(
          and(
            eq(churnRiskScores.tenant_id, tenantId),
            gt(churnRiskScores.churn_risk_score, 0.7),
          ),
        )
        .orderBy(desc(churnRiskScores.churn_risk_score))
        .limit(100),

      db
        .select()
        .from(contactOptimalTimes)
        .where(eq(contactOptimalTimes.tenant_id, tenantId))
        .limit(500),

      db
        .select()
        .from(contactNextActions)
        .where(eq(contactNextActions.tenant_id, tenantId))
        .limit(500),
    ]);

    const result: TenantInsights = {
      data_sufficient: true,
      high_risk_contacts: highRiskContacts,
      optimal_times: optimalTimes,
      next_actions: nextActions,
    };

    await cache.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });
    return result;
  }

  async getContactInsights(tenantId: string, contactId: string): Promise<ContactInsights | null> {
    const db = getDb();
    const cache = new TenantCache(tenantId, 'predictive');
    const cacheKey = `contact:${contactId}`;

    const cached = await cache.get<ContactInsights>(cacheKey);
    if (cached) return cached;

    // Verify contact belongs to tenant
    const [contact] = await db
      .select({ contact_id: contacts.contact_id })
      .from(contacts)
      .where(and(eq(contacts.contact_id, contactId), eq(contacts.tenant_id, tenantId)))
      .limit(1);

    if (!contact) return null;

    const [[churnRow], [optimalRow], [actionRow]] = await Promise.all([
      db
        .select()
        .from(churnRiskScores)
        .where(
          and(
            eq(churnRiskScores.contact_id, contactId),
            eq(churnRiskScores.tenant_id, tenantId),
          ),
        )
        .orderBy(desc(churnRiskScores.calculated_at))
        .limit(1),

      db
        .select()
        .from(contactOptimalTimes)
        .where(
          and(
            eq(contactOptimalTimes.contact_id, contactId),
            eq(contactOptimalTimes.tenant_id, tenantId),
          ),
        )
        .limit(1),

      db
        .select()
        .from(contactNextActions)
        .where(
          and(
            eq(contactNextActions.contact_id, contactId),
            eq(contactNextActions.tenant_id, tenantId),
          ),
        )
        .limit(1),
    ]);

    const result: ContactInsights = {
      contact_id: contactId,
      churn_risk: churnRow ?? null,
      optimal_time: optimalRow ?? null,
      next_action: actionRow ?? null,
    };

    await cache.set(cacheKey, result, { ttl: CACHE_TTL_SECONDS });
    return result;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async getInteractionCount(tenantId: string): Promise<number> {
    const db = getDb();
    const result = await db.execute<{ count: string }>(
      sql`SELECT (
        (SELECT COUNT(*) FROM calls WHERE tenant_id = ${tenantId}) +
        (SELECT COUNT(*) FROM survey_responses WHERE tenant_id = ${tenantId}) +
        (SELECT COUNT(*) FROM campaign_events WHERE tenant_id = ${tenantId})
      )::int AS count`,
    );
    return parseInt(String(result.rows[0]?.count ?? '0'), 10);
  }

  private async gatherChurnSignals(tenantId: string, contactId: string): Promise<ChurnSignals> {
    const db = getDb();

    // Days since last interaction (call, survey response, or campaign event)
    const lastInteractionResult = await db.execute<{ days: string | null }>(
      sql`SELECT EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::int / 86400 AS days
          FROM (
            SELECT ended_at AS ts FROM calls
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId} AND ended_at IS NOT NULL
            UNION ALL
            SELECT submitted_at AS ts FROM survey_responses
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
            UNION ALL
            SELECT created_at AS ts FROM campaign_events
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
          ) t`,
    );
    const daysSinceLastInteraction = parseInt(
      String(lastInteractionResult.rows[0]?.days ?? '90'),
      10,
    );

    // Average sentiment from calls (-1 to +1) and surveys (mapped from positive/neutral/negative)
    const sentimentResult = await db.execute<{ avg_sentiment: string | null }>(
      sql`SELECT AVG(sentiment_score) AS avg_sentiment
          FROM calls
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND sentiment_score IS NOT NULL`,
    );
    const callSentiment = parseFloat(String(sentimentResult.rows[0]?.avg_sentiment ?? '0'));

    // Survey sentiment: positive=1, neutral=0, negative=-1
    const surveySentimentResult = await db.execute<{ avg_sentiment: string | null }>(
      sql`SELECT AVG(CASE sentiment WHEN 'positive' THEN 1 WHEN 'neutral' THEN 0 ELSE -1 END) AS avg_sentiment
          FROM survey_responses
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}`,
    );
    const surveySentiment = parseFloat(
      String(surveySentimentResult.rows[0]?.avg_sentiment ?? '0'),
    );

    // Combine call and survey sentiment (simple average)
    const avgSentiment = (callSentiment + surveySentiment) / 2;

    // Days inactive (any activity: campaign open, call, survey)
    const inactiveResult = await db.execute<{ days: string | null }>(
      sql`SELECT EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::int / 86400 AS days
          FROM (
            SELECT created_at AS ts FROM campaign_events
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
                AND event_type = 'opened'
            UNION ALL
            SELECT ended_at AS ts FROM calls
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
                AND status = 'completed' AND ended_at IS NOT NULL
            UNION ALL
            SELECT submitted_at AS ts FROM survey_responses
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
          ) t`,
    );
    const daysInactive = parseInt(String(inactiveResult.rows[0]?.days ?? '90'), 10);

    // Total interactions
    const totalResult = await db.execute<{ count: string }>(
      sql`SELECT (
        (SELECT COUNT(*) FROM calls WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}) +
        (SELECT COUNT(*) FROM survey_responses WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}) +
        (SELECT COUNT(*) FROM campaign_events WHERE tenant_id = ${tenantId} AND contact_id = ${contactId})
      )::int AS count`,
    );
    const totalInteractions = parseInt(String(totalResult.rows[0]?.count ?? '0'), 10);

    return {
      daysSinceLastInteraction: isNaN(daysSinceLastInteraction) ? 90 : daysSinceLastInteraction,
      avgSentiment: isNaN(avgSentiment) ? 0 : Math.max(-1, Math.min(1, avgSentiment)),
      daysInactive: isNaN(daysInactive) ? 90 : daysInactive,
      totalInteractions,
    };
  }

  private async gatherResponseEvents(
    tenantId: string,
    contactId: string,
  ): Promise<ResponseEvent[]> {
    const db = getDb();

    // Calls answered (completed)
    const callsResult = await db.execute<{ day_of_week: string; hour_of_day: string }>(
      sql`SELECT EXTRACT(DOW FROM ended_at)::int AS day_of_week,
                 EXTRACT(HOUR FROM ended_at)::int AS hour_of_day
          FROM calls
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND status = 'completed'
            AND ended_at IS NOT NULL`,
    );

    // Emails opened
    const emailsResult = await db.execute<{ day_of_week: string; hour_of_day: string }>(
      sql`SELECT EXTRACT(DOW FROM created_at)::int AS day_of_week,
                 EXTRACT(HOUR FROM created_at)::int AS hour_of_day
          FROM campaign_events
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND event_type = 'opened'`,
    );

    const events: ResponseEvent[] = [
      ...callsResult.rows.map((r) => ({
        dayOfWeek: parseInt(String(r.day_of_week), 10),
        hourOfDay: parseInt(String(r.hour_of_day), 10),
      })),
      ...emailsResult.rows.map((r) => ({
        dayOfWeek: parseInt(String(r.day_of_week), 10),
        hourOfDay: parseInt(String(r.hour_of_day), 10),
      })),
    ];

    return events;
  }

  private async getDaysSinceLastContact(tenantId: string, contactId: string): Promise<number> {
    const db = getDb();
    const result = await db.execute<{ days: string | null }>(
      sql`SELECT EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::int / 86400 AS days
          FROM (
            SELECT ended_at AS ts FROM calls
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId} AND ended_at IS NOT NULL
            UNION ALL
            SELECT created_at AS ts FROM campaign_events
              WHERE tenant_id = ${tenantId} AND contact_id = ${contactId}
          ) t`,
    );
    const days = parseInt(String(result.rows[0]?.days ?? '30'), 10);
    return isNaN(days) ? 30 : days;
  }

  private async publishHighRiskEvents(tenantId: string): Promise<void> {
    const db = getDb();
    const highRisk = await db
      .select()
      .from(churnRiskScores)
      .where(
        and(
          eq(churnRiskScores.tenant_id, tenantId),
          gt(churnRiskScores.churn_risk_score, 0.7),
        ),
      )
      .limit(500);

    if (highRisk.length === 0) return;

    try {
      const publisher = new EventPublisher(tenantId);
      await publisher.connect();

      for (const row of highRisk) {
        await publisher.publish('churn', 'churn.high_risk' as never, {
          contact_id: row.contact_id,
          churn_risk_score: row.churn_risk_score,
          risk_level: row.risk_level,
        } as never);
      }

      await publisher.disconnect();
    } catch (err) {
      console.warn('[predictive] Failed to publish high-risk events:', err);
    }
  }

  private async invalidateTenantCache(tenantId: string): Promise<void> {
    try {
      const cache = new TenantCache(tenantId, 'predictive');
      await cache.delPattern('*');
    } catch (err) {
      console.warn('[predictive] Failed to invalidate cache:', err);
    }
  }
}
