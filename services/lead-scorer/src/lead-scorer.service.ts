import { eq, and, desc, sql } from 'drizzle-orm';
import {
  getDb,
  contacts,
  leadScoreHistory,
  type Contact,
  type LeadScoreHistory,
} from '@platform/db';
import { computeLeadScore, type BehavioralSignals } from './scorer.js';

export interface ScoreExplanation {
  contact_id: string;
  score: number;
  confidence: 'high' | 'low';
  factors: Array<{ name: string; points: number; description: string }>;
  history: LeadScoreHistory[];
}

export class LeadScorerService {
  /**
   * Fetch behavioral signals for a contact from the DB and compute a score.
   * Signals are derived from existing tables (calls, conversations, campaign events).
   */
  async recalculateScore(tenantId: string, contactId: string): Promise<void> {
    const db = getDb();

    // Load current contact
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.contact_id, contactId), eq(contacts.tenant_id, tenantId)))
      .limit(1);

    if (!contact) return;

    const signals = await this.gatherSignals(tenantId, contactId, contact);
    const result = computeLeadScore(signals);

    const previousScore = contact.lead_score ?? 50;
    const delta = Math.abs(result.score - previousScore);

    // Always update the contact's current score
    await db
      .update(contacts)
      .set({
        lead_score: result.score,
        lead_score_confidence: result.confidence,
        updated_at: new Date(),
      })
      .where(and(eq(contacts.contact_id, contactId), eq(contacts.tenant_id, tenantId)));

    // Record history only when delta >= 10
    if (delta >= 10) {
      await db.insert(leadScoreHistory).values({
        contact_id: contactId,
        tenant_id: tenantId,
        score: result.score,
        confidence: result.confidence,
        factors: result.factors,
      });
    }
  }

  /**
   * Recalculate scores for all contacts in a tenant (used by daily cron).
   */
  async recalculateAllForTenant(tenantId: string): Promise<void> {
    const db = getDb();

    // Process in batches of 100 to avoid memory pressure
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
          await this.recalculateScore(tenantId, contact_id);
        } catch (err) {
          console.error(`Failed to recalculate score for contact ${contact_id}:`, err);
        }
      }

      offset += batchSize;
      if (batch.length < batchSize) break;
    }
  }

  /**
   * Get score explanation: current score, confidence, top-3 factors, last 10 history entries.
   */
  async getExplanation(tenantId: string, contactId: string): Promise<ScoreExplanation | null> {
    const db = getDb();

    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.contact_id, contactId), eq(contacts.tenant_id, tenantId)))
      .limit(1);

    if (!contact) return null;

    // Get last 10 history entries
    const history = await db
      .select()
      .from(leadScoreHistory)
      .where(
        and(
          eq(leadScoreHistory.contact_id, contactId),
          eq(leadScoreHistory.tenant_id, tenantId),
        ),
      )
      .orderBy(desc(leadScoreHistory.recorded_at))
      .limit(10);

    // Get the most recent factors from history (or empty if none)
    const latestFactors = (history[0]?.factors as Array<{ name: string; points: number; description: string }>) ?? [];

    return {
      contact_id: contactId,
      score: contact.lead_score,
      confidence: contact.lead_score_confidence,
      factors: latestFactors,
      history,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async gatherSignals(
    tenantId: string,
    contactId: string,
    contact: Contact,
  ): Promise<BehavioralSignals> {
    const db = getDb();

    // Email opens — count from campaign tracking (campaign_events or similar)
    // We query the raw SQL since we don't have a typed schema for tracking events here
    const emailOpensResult = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::int AS count
          FROM campaign_events
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND event_type = 'opened'`,
    );
    const emailOpens = parseInt(String(emailOpensResult.rows[0]?.count ?? '0'), 10);

    // Chatbot sessions — count closed conversations
    const chatbotResult = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::int AS count
          FROM conversations
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND status = 'closed'`,
    );
    const chatbotSessions = parseInt(String(chatbotResult.rows[0]?.count ?? '0'), 10);

    // Call outcomes
    const callsResult = await db.execute<{ status: string; count: string }>(
      sql`SELECT status, COUNT(*)::int AS count
          FROM calls
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND status IN ('completed', 'failed')
          GROUP BY status`,
    );
    let completedCalls = 0;
    let failedCalls = 0;
    for (const row of callsResult.rows) {
      if (row.status === 'completed') completedCalls = parseInt(String(row.count), 10);
      if (row.status === 'failed') failedCalls = parseInt(String(row.count), 10);
    }

    // Campaign clicks
    const clicksResult = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*)::int AS count
          FROM campaign_events
          WHERE tenant_id = ${tenantId}
            AND contact_id = ${contactId}
            AND event_type = 'clicked'`,
    );
    const campaignClicks = parseInt(String(clicksResult.rows[0]?.count ?? '0'), 10);

    return {
      emailOpens,
      chatbotSessions,
      completedCalls,
      failedCalls,
      campaignClicks,
      lifecycleStage: contact.lifecycle_stage,
    };
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
