/**
 * Scheduled jobs for lead scorer:
 * - Daily (every 24h): recalculate all contact scores for all tenants
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@platform/db';
import { LeadScorerService } from './lead-scorer.service.js';

// Import tenants table via raw SQL to avoid circular deps
import { sql } from 'drizzle-orm';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export function startScheduler(service: LeadScorerService): NodeJS.Timeout {
  const timer = setInterval(async () => {
    await runDailyRecalculation(service);
  }, TWENTY_FOUR_HOURS);

  // Run once shortly after startup (non-blocking)
  setTimeout(() => {
    runDailyRecalculation(service).catch((err) => {
      console.error('Initial lead score recalculation failed:', err);
    });
  }, 5000);

  return timer;
}

async function runDailyRecalculation(service: LeadScorerService): Promise<void> {
  console.log('[lead-scorer] Starting daily score recalculation...');

  const db = getDb();

  // Get all active tenant IDs
  const tenantRows = await db.execute<{ tenant_id: string }>(
    sql`SELECT tenant_id FROM tenants WHERE status = 'active'`,
  );

  for (const { tenant_id } of tenantRows.rows) {
    try {
      await service.recalculateAllForTenant(tenant_id);
      console.log(`[lead-scorer] Recalculated scores for tenant ${tenant_id}`);
    } catch (err) {
      console.error(`[lead-scorer] Failed to recalculate scores for tenant ${tenant_id}:`, err);
    }
  }

  console.log('[lead-scorer] Daily score recalculation complete.');
}
