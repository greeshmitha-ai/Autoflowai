/**
 * Weekly scheduled job for the Predictive Analytics Engine.
 * Runs churn risk, optimal time, and next-best-action calculations
 * for all active tenants.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@platform/db';
import { PredictiveService } from './predictive.service.js';

/** 7 days in milliseconds */
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function startScheduler(service: PredictiveService): void {
  // Run immediately on startup, then weekly
  void runWeeklyJob(service);

  setInterval(() => {
    void runWeeklyJob(service);
  }, WEEKLY_INTERVAL_MS);
}

async function runWeeklyJob(service: PredictiveService): Promise<void> {
  console.info('[predictive] Starting weekly predictive analytics job...');

  const db = getDb();

  // Dynamically import to avoid circular deps
  const { tenants } = await import('@platform/db');

  const activeTenants = await db
    .select({ tenant_id: tenants.tenant_id })
    .from(tenants)
    .where(eq(tenants.status, 'active'));

  for (const { tenant_id } of activeTenants) {
    try {
      console.info(`[predictive] Processing tenant ${tenant_id}...`);
      await service.computeChurnRiskForTenant(tenant_id);
      await service.computeOptimalTimesForTenant(tenant_id);
      await service.computeNextActionsForTenant(tenant_id);
      console.info(`[predictive] Completed tenant ${tenant_id}`);
    } catch (err) {
      console.error(`[predictive] Failed to process tenant ${tenant_id}:`, err);
    }
  }

  console.info('[predictive] Weekly predictive analytics job complete.');
}
